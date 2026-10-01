import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { authoringContract, lint } from "./plan-gate";
import type { GateViolation } from "./plan-gate";
import { mutatePlanFile, planState, protocolSpecHash, replaceDraftSpec, replaceDraftTitle } from "./plan-update";
import type { PlanState } from "./plan-update";

export interface SubmitSpecInput {
  readonly plan: string;
  readonly baseRevision: string;
  readonly ownerRequest: string;
  readonly spec: string;
  /** A new title for the draft; absent keeps the one init wrote. */
  readonly title?: string;
}

/** What a submission returns; the server adds the published url and the reply. */
export interface SubmitSpecResult {
  readonly revision: string;
  readonly state: PlanState;
  readonly corrections: readonly { readonly line: number; readonly before: string; readonly after: string }[];
  readonly findings: readonly GateViolation[];
  readonly checkStatus: "checked" | "no_change";
}

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

/** Replace the whole SPEC of a draft through the writer, correcting what needs
 * no judgement and reporting every lint error at once. No model reads the
 * plan. Unchanged text changes nothing; a stale revision or a locked plan
 * refuses.
 * @tested-by: tst_unit_planctl_spec_submission_001, tst_unit_planctl_spec_submission_002
 */
export async function submitSpec(root: string, input: SubmitSpecInput): Promise<SubmitSpecResult> {
  const plan = resolve(root, input.plan).slice(root.length + 1);
  const body = readFileSync(resolve(root, plan), "utf8");
  const state = planState(body);
  if (state !== "SPEC_DRAFT") throw new Error(`the SPEC is ${state === "SPEC_LOCKED" ? "locked" : "approved"}; correct it with amend under the owner's word`);
  const current = protocolSpecHash(body);
  if (input.baseRevision !== current) throw new Error(`stale revision ${input.baseRevision}; the plan is at ${current}`);
  const contract = await authoringContract(root);
  const corrected = correct(input.spec, contract.vocabulary);
  const before = currentSpec(body);
  const sameTitle = input.title === undefined || body.startsWith(`# ${input.title}\n`);
  if (corrected.text === before && sameTitle) {
    const report = await lint(body, root);
    return { revision: current, state, corrections: corrected.corrections, findings: report.violations, checkStatus: "no_change" };
  }
  mutatePlanFile(root, plan, "set-spec", (draft) => {
    const withSpec = replaceDraftSpec(draft, corrected.text).body;
    return input.title === undefined ? { body: withSpec } : replaceDraftTitle(withSpec, input.title);
  });
  const saved = readFileSync(resolve(root, plan), "utf8");
  const report = await lint(saved, root);
  return {
    revision: protocolSpecHash(saved),
    state: planState(saved),
    corrections: corrected.corrections,
    findings: report.violations,
    checkStatus: "checked",
  };
}
