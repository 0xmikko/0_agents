import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { lint, protocolLanguageViolations } from "./plan-gate";
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

/** Replace the whole SPEC of a draft through the writer, preserving authored words
 * and reporting errors separately from editorial advice. No model reads the
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
  const spec = input.spec.replace(/\r\n?/g, "\n").trim();
  const before = currentSpec(body);
  const sameTitle = input.title === undefined || body.startsWith(`# ${input.title}\n`);
  if (spec === before && sameTitle) {
    const report = await lint(body, root);
    return { revision: current, state, corrections: [], findings: report.violations, checkStatus: "no_change" };
  }
  const candidate = (draft: string): { body: string } => {
    const withSpec = replaceDraftSpec(draft, spec).body;
    return input.title === undefined ? { body: withSpec } : replaceDraftTitle(withSpec, input.title);
  };
  // Another language is refused before anything is written: nothing to save, nothing to publish.
  const language = protocolLanguageViolations(candidate(body).body);
  if (language.length > 0) throw new Error(language.join("\n"));
  mutatePlanFile(root, plan, "set-spec", candidate);
  const saved = readFileSync(resolve(root, plan), "utf8");
  const report = await lint(saved, root);
  return {
    revision: protocolSpecHash(saved),
    state: planState(saved),
    corrections: [],
    findings: report.violations,
    checkStatus: "checked",
  };
}
