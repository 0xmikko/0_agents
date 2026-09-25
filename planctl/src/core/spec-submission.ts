import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { authoringContract, GOAL_RULE, lint } from "./plan-gate";
import type { GateViolation } from "./plan-gate";
import { mutatePlanFile, planState, protocolSpecHash, replaceDraftSpec } from "./plan-update";
import type { PlanState } from "./plan-update";

export interface SubmitSpecInput {
  readonly plan: string;
  readonly baseRevision: string;
  readonly ownerRequest: string;
  readonly spec: string;
}

/** What a submission returns; the server adds the published url and the reply. */
export interface SubmitSpecResult {
  readonly revision: string;
  readonly state: PlanState;
  readonly corrections: readonly { readonly line: number; readonly before: string; readonly after: string }[];
  readonly findings: readonly GateViolation[];
  readonly checkStatus: "checked" | "no_change" | "unavailable";
  readonly checkError: string | null;
}

/** One bounded model call: the prompt in, the model's text out; throws on timeout. */
type ModelRunner = (prompt: string, deadlineMs: number) => Promise<string>;

const MODEL_DEADLINE_MS = 15_000;
const SPEC_START = "<!-- plan:spec:start -->";
const SPEC_END = "<!-- plan:spec:end -->";

function currentSpec(body: string): string {
  const from = body.indexOf(SPEC_START);
  const to = body.indexOf(SPEC_END);
  if (from < 0 || to < from) throw new Error("plan is missing ordered SPEC markers");
  return body.slice(from + SPEC_START.length, to).trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Line endings and the vocabulary pairs the agent should not have to think about. */
function correct(spec: string, vocabulary: readonly { readonly word: string; readonly term: string }[]): {
  readonly text: string;
  readonly corrections: SubmitSpecResult["corrections"];
} {
  const corrections: { line: number; before: string; after: string }[] = [];
  let inCode = false;
  const words = vocabulary.map((pair) => pair.word).sort((left, right) => right.length - left.length).map(escapeRegExp);
  const pattern = words.length === 0 ? null : new RegExp(`\\b(${words.join("|")})(s|es)?\\b`, "gi");
  const lines = spec.replace(/\r\n?/g, "\n").split("\n").map((line, index) => {
    if (line.trimStart().startsWith("```")) inCode = !inCode;
    if (inCode || pattern === null || line.startsWith("#") || line.startsWith("|")) return line;
    const after = line.replace(pattern, (match: string, word: string, plural: string | undefined) => {
      const term = vocabulary.find((pair) => pair.word.toLowerCase() === word.toLowerCase())?.term;
      if (term === undefined) return match;
      return plural === undefined ? term : `${term}${plural}`;
    });
    if (after !== line) corrections.push({ line: index + 1, before: line, after });
    return after;
  });
  return { text: lines.join("\n").trim(), corrections };
}

function changedLines(before: string, after: string): readonly { readonly line: number; readonly text: string }[] {
  const previous = new Set(before.split("\n"));
  return after.split("\n").map((text, index) => ({ line: index + 1, text })).filter((entry) => entry.text.trim() !== "" && !previous.has(entry.text));
}

function prompt(input: SubmitSpecInput, vocabulary: readonly { readonly word: string; readonly term: string }[], changed: readonly { readonly line: number; readonly text: string }[]): string {
  return [
    "You check the changed lines of a plan SPEC. Answer with JSON only: {\"findings\": [{\"rule\": \"goal\" | \"clarity\" | \"vocabulary\", \"line\": number, \"quote\": string, \"message\": string, \"replacement\": string | null}]}.",
    "Report only what breaks the Goal rule, hides what will be behind history or reasons, or uses a rejected word. An empty findings array is a good answer.",
    "",
    `Owner request: ${input.ownerRequest}`,
    "",
    `Goal rule: ${GOAL_RULE}`,
    "",
    `Vocabulary, say the term instead of the word: ${vocabulary.map((pair) => `${pair.word} → ${pair.term}`).join("; ")}`,
    "",
    "Changed lines:",
    ...changed.map((entry) => `${entry.line}: ${entry.text}`),
  ].join("\n");
}

interface ModelFinding {
  readonly rule: "goal" | "clarity" | "vocabulary";
  readonly line: number;
  readonly quote: string;
  readonly message: string;
  readonly replacement: string | null;
}

function decodeFindings(output: string): readonly ModelFinding[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("invalid output: not JSON");
  }
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { findings?: unknown }).findings)) {
    throw new Error("invalid output: no findings array");
  }
  return (parsed as { findings: unknown[] }).findings.map((entry) => {
    if (typeof entry !== "object" || entry === null) throw new Error("invalid output: a finding is not an object");
    const finding = entry as Record<string, unknown>;
    if (finding.rule !== "goal" && finding.rule !== "clarity" && finding.rule !== "vocabulary") throw new Error("invalid output: unknown rule");
    if (typeof finding.line !== "number" || typeof finding.quote !== "string" || typeof finding.message !== "string") throw new Error("invalid output: finding fields");
    if (finding.replacement !== null && typeof finding.replacement !== "string") throw new Error("invalid output: replacement");
    return { rule: finding.rule, line: finding.line, quote: finding.quote, message: finding.message, replacement: finding.replacement };
  });
}

/** The measured invocation: Sonnet without thinking, tools off, MCP off, no session, JSON out, no API key. */
export const claudeModelRunner: ModelRunner = (text, deadlineMs) => {
  const run = spawnSync("claude", ["-p", "--model", "sonnet", "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--output-format", "json"], {
    input: text,
    encoding: "utf8",
    timeout: deadlineMs,
    env: { ...process.env, MAX_THINKING_TOKENS: "0" },
  });
  if (run.error !== undefined) return Promise.reject(new Error(run.signal === "SIGTERM" ? `deadline of ${deadlineMs / 1000} seconds passed` : run.error.message));
  if (run.status !== 0) return Promise.reject(new Error(run.stderr.trim() || `claude exited ${run.status}`));
  const envelope: unknown = JSON.parse(run.stdout);
  const result = typeof envelope === "object" && envelope !== null && "result" in envelope ? (envelope as { result: unknown }).result : null;
  if (typeof result !== "string") return Promise.reject(new Error("invalid output: no result"));
  return Promise.resolve(result.replace(/^```(?:json)?\n?/m, "").replace(/```\s*$/m, "").trim());
};

/** Replace the whole SPEC of a draft through the writer, correcting what needs
 * no judgement, reporting every lint error at once, and asking the model once
 * about the changed lines. Unchanged text calls nothing; a stale revision or
 * a locked plan refuses.
 * @tested-by: tst_unit_planctl_spec_submission_001, tst_unit_planctl_spec_submission_002
 */
export async function submitSpec(root: string, input: SubmitSpecInput, model: ModelRunner): Promise<SubmitSpecResult> {
  const plan = resolve(root, input.plan).slice(root.length + 1);
  const body = readFileSync(resolve(root, plan), "utf8");
  const state = planState(body);
  if (state !== "SPEC_DRAFT") throw new Error(`the SPEC is ${state === "SPEC_LOCKED" ? "locked" : "approved"}; correct it with amend under the owner's word`);
  const current = protocolSpecHash(body);
  if (input.baseRevision !== current) throw new Error(`stale revision ${input.baseRevision}; the plan is at ${current}`);
  const contract = await authoringContract(root);
  const corrected = correct(input.spec, contract.vocabulary);
  const before = currentSpec(body);
  if (corrected.text === before) {
    const report = await lint(body, root);
    return { revision: current, state, corrections: corrected.corrections, findings: report.violations, checkStatus: "no_change", checkError: null };
  }
  mutatePlanFile(root, plan, "set-spec", (draft) => replaceDraftSpec(draft, corrected.text));
  const saved = readFileSync(resolve(root, plan), "utf8");
  const report = await lint(saved, root);
  const changed = changedLines(before, corrected.text);
  let advice: readonly GateViolation[] = [];
  let checkStatus: SubmitSpecResult["checkStatus"] = "checked";
  let checkError: string | null = null;
  try {
    const offset = saved.split("\n").indexOf(SPEC_START) + 1;
    advice = decodeFindings(await model(prompt(input, contract.vocabulary, changed), MODEL_DEADLINE_MS)).map((finding) => ({
      kind: "protocol-shape",
      rule: finding.rule,
      blocking: false,
      line: finding.line + offset,
      quote: finding.quote,
      text: finding.message,
      replacement: finding.replacement,
    }));
  } catch (error: unknown) {
    checkStatus = "unavailable";
    checkError = error instanceof Error ? error.message : String(error);
  }
  return {
    revision: protocolSpecHash(saved),
    state: planState(saved),
    corrections: corrected.corrections,
    findings: [...report.violations, ...advice],
    checkStatus,
    checkError,
  };
}
