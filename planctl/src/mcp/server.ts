import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { appendEvent } from "../core/event-log";
import type { EventRecord } from "../core/event-log";
import { authoringContract, lint } from "../core/plan-gate";
import type { GateViolation } from "../core/plan-gate";
import { planProgress, progressNote } from "../core/plan-progress";
import type { ProgressView } from "../core/plan-progress";
import {
  applyOwnerAmendment,
  approvePlan,
  closePlanStage,
  closeRootOf,
  completeTask,
  deliveryEnd,
  deliveryFrom,
  deliveryStart,
  initPlan,
  lockPlanSpec,
  mutatePlanFile,
  needsOwner,
  patchFrom,
  planState,
  protocolImplementationHash,
  protocolSpecHash,
  putDelivery,
  putStage,
  recordDeviation,
  recoverPlanMutation,
  removeDraftStage,
  resumeTask,
  stageEnd,
  stageInputs,
  stageFrom,
  stageStart,
  startTask,
  validateImplementation,
} from "../core/plan-update";
import { submitSpec } from "../core/spec-submission";
import type { SubmitSpecResult } from "../core/spec-submission";
import { checkContent } from "../core/content-check";
import { approvedVocabularyFile, cacheDirectory, contentHash, readVocabulary, vocabularyChangesSchema } from "../core/vocabulary";
import { deliveryGate, publishDelivery, recordCompleteGate, requireControlledPublication } from "../core/publication";
import { decodeTaskRun } from "../core/task-run";
import { renderProgressView, renderTaskBrief } from "../cli/render";
import { describeChecks, ownerReply } from "./publish";

interface ServerDependencies {
  /** Where relative plan paths resolve; the server never changes it. */
  readonly cwd: string;
  /** What gh reports for a Delivery branch of a repository. */
  readonly publication: (root: string, branch: string) => ProgressView["publication"];
  /** HEAD of the checkout the server runs from. */
  readonly sourceCommit: string;
  /** The events.jsonl every call appends one line to. */
  readonly eventLog: string;
  /** Publishes the saved bytes after every write and returns the URL. */
  readonly publisher: (root: string, plan: string) => string;
}

interface ToolResult {
  readonly [key: string]: unknown;
  readonly content: { readonly type: "text"; readonly text: string }[];
  readonly structuredContent?: Record<string, unknown>;
  readonly isError?: boolean;
}

interface Tool<Shape extends z.ZodRawShape> {
  readonly description: string;
  readonly schema: z.ZodObject<Shape>;
  readonly run: (deps: ServerDependencies, args: z.infer<z.ZodObject<Shape>>) => Promise<ToolResult>;
}

function tool<Shape extends z.ZodRawShape>(definition: Tool<Shape>): Tool<Shape> {
  return definition;
}

/** The repository a plan path belongs to, and the plan's path inside it. */
function located(cwd: string, planArg: string): { readonly root: string; readonly plan: string } {
  const absolute = resolve(cwd, planArg);
  const root = execFileSync("git", ["-C", dirname(absolute), "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  if (!absolute.startsWith(`${root}/`)) throw new Error(`${planArg} is not inside a repository`);
  return { root, plan: absolute.slice(root.length + 1) };
}

function repository(cwd: string, rootArg: string): string {
  return execFileSync("git", ["-C", resolve(cwd, rootArg), "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
}

function reply(structured: Record<string, unknown>, text: string): ToolResult {
  return { content: [{ type: "text", text }], structuredContent: structured };
}

function refusal(text: string): ToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

function describeFindings(findings: readonly GateViolation[]): string {
  return findings.map((finding) => `${finding.blocking ? "Error" : "Advice"}: ${finding.text}${finding.replacement === null ? "" : ` → ${finding.replacement}`}\nEvidence: ${finding.quote}`).join("\n");
}

function describeSemanticChecks(checks: SubmitSpecResult["semanticChecks"]): string {
  return checks.map(check => `${check.question}\n${check.probability === null ? "Unavailable" : `Probability: ${check.probability}`}${check.uncertainty ? ` — ${check.uncertainty}` : ""}`).join("\n\n");
}

/** Keep complete evidence in the worktree cache before shortening a native client's transport.
 * @tested-by: tst_unit_planctl_mcp_016
 * @invariant: totals count the full report, errors appear first, and every omitted byte remains readable locally.
 */
function boundedContentResult(root: string, result: ToolResult): ToolResult {
  const limit = 24 * 1024;
  if (Buffer.byteLength(JSON.stringify(result)) <= limit) return result;
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  const bytes = Buffer.byteLength(serialized);
  const directory = cacheDirectory(root, "mcp-results");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = resolve(directory, `${contentHash(serialized)}.json`);
  writeFileSync(path, serialized, { mode: 0o600 });
  const excerpt = (value: string, length: number): string => value.length <= length ? value : `${value.slice(0, length)}…`;
  const report = z.object({
    findings: z.array(z.object({ blocking: z.boolean(), line: z.number(), text: z.string() })),
    semanticChecks: z.array(z.object({ question: z.string(), probability: z.number().nullable(), uncertainty: z.string().nullable() })),
  }).safeParse(result.structuredContent);
  if (!report.success) {
    return { ...result, content: [{ type: "text", text: `${excerpt(result.content.map(entry => entry.text).join("\n"), 1000)}\nFull result: ${path} (${bytes} bytes). Original long text is omitted from transport; read the artifact for the complete result.` }],
      structuredContent: { fullResult: { path, bytes, omitted: { originalText: true } } } };
  }
  const { findings, semanticChecks } = report.data;
  const totals = {
    errors: findings.filter(finding => finding.blocking).length,
    advice: findings.filter(finding => !finding.blocking).length,
    unavailable: semanticChecks.filter(check => check.probability === null).length,
    inconclusive: semanticChecks.filter(check => check.probability !== null && check.uncertainty !== null).length,
  };
  const notice = `Full result: ${path} (${bytes} bytes). Repeated semantic evidence, finding quotes and original long text are omitted; displayed text may be excerpted. Read the JSON artifact in line ranges for complete findings and evidence.`;
  const original = result.structuredContent ?? {};
  const summary = [typeof original.reply === "string" ? original.reply : describeChecks(findings, semanticChecks),
    ...(totals.errors > 0 ? ["Blocking errors remain; saving a draft does not satisfy these checks."] : []),
    notice].join("\n");
  const metadata = Object.fromEntries(["plan", "revision", "state", "checkStatus", "url", "specRevision", "implementationRevision"]
    .filter(key => key in original).map(key => [key, typeof original[key] === "string" ? excerpt(original[key], 512) : original[key]]));
  let compact: ToolResult = {
    ...(result.isError === undefined ? {} : { isError: result.isError }),
    content: [{ type: "text", text: summary }],
    structuredContent: { ...metadata, ...(typeof original.reply === "string" ? { reply: summary } : {}), totals,
      findings: [], semanticChecks: [],
      fullResult: { path, bytes, omitted: { findings: findings.length, semanticChecks: semanticChecks.length, semanticEvidence: true, findingEvidence: true, originalText: true } } },
  };
  const shown: typeof findings = [];
  const ordered = [...findings.filter(finding => finding.blocking), ...findings.filter(finding => !finding.blocking)];
  for (const finding of ordered) {
    const item = { ...finding, text: excerpt(finding.text, 512) };
    const candidate = [...shown, item];
    const text = `${summary}\n\n${candidate.map(item => `${item.blocking ? "Error" : "Advice"} (line ${item.line}): ${item.text}`).join("\n")}`;
    const structuredContent = { ...compact.structuredContent, findings: candidate,
      fullResult: { path, bytes, omitted: { findings: findings.length - candidate.length, semanticChecks: semanticChecks.length, semanticEvidence: true, findingEvidence: true, originalText: true } } };
    const next = { ...compact, content: [{ type: "text" as const, text }], structuredContent };
    if (Buffer.byteLength(JSON.stringify(next)) > limit) break;
    shown.push(item);
    compact = next;
  }
  const shownChecks: typeof semanticChecks = [];
  for (const check of semanticChecks) {
    const item = { ...check, question: excerpt(check.question, 512), uncertainty: check.uncertainty === null ? null : excerpt(check.uncertainty, 256) };
    const candidate = [...shownChecks, item];
    const next = { ...compact, structuredContent: { ...compact.structuredContent, semanticChecks: candidate,
      fullResult: { path, bytes, omitted: { findings: findings.length - shown.length, semanticChecks: semanticChecks.length - candidate.length, semanticEvidence: true, findingEvidence: true, originalText: true } } } };
    if (Buffer.byteLength(JSON.stringify(next)) > limit) break;
    shownChecks.push(item);
    compact = next;
  }
  return compact;
}

/** Every lint error of the whole plan plus what approval would refuse: duplicate IDs, unknown dependencies, cycles. */
async function wholePlanFindings(body: string, root: string): Promise<readonly (GateViolation | { readonly text: string })[]> {
  const report = await lint(body, root);
  try {
    validateImplementation(body);
    return report.violations;
  } catch (error: unknown) {
    return [...report.violations, { text: error instanceof Error ? error.message : String(error) }];
  }
}

/** Refuse a submitted part with every lint error inside it, like a compiler; the rest of the plan is reported, not refused. */
async function refuseInsidePart(candidate: string, root: string, start: string, end: string): Promise<void> {
  const lines = candidate.split("\n");
  const from = lines.indexOf(start) + 1;
  const to = lines.indexOf(end) + 1;
  const report = await lint(candidate, root);
  const inside = report.violations.filter((violation) => violation.blocking && violation.line >= from && violation.line <= to);
  if (inside.length > 0) throw new Error(`the submitted part has ${inside.length} error(s):\n${describeFindings(inside)}`);
}

async function lintedApproval(deps: ServerDependencies, plan: string, operation: string, transform: (body: string, ownerWord: string) => { body: string }, ownerWord: string, expectedRevision: string): Promise<{ root: string; plan: string; saved: string }> {
  const { root, plan: relative } = located(deps.cwd, plan);
  recoverPlanMutation(root, relative);
  const body = readFileSync(resolve(root, relative), "utf8");
  const revision = operation === "lock-spec" ? protocolSpecHash : protocolImplementationHash;
  if (revision(body) !== expectedRevision) throw new Error("The displayed revision is stale; inspect the current version before recording approval.");
  if ((operation === "lock-spec" && planState(body) !== "SPEC_DRAFT")
    || (operation === "approve" && planState(body) === "APPROVED")) {
    return { root, plan: relative, saved: body };
  }
  const report = await lint(body, root);
  const checks = await checkContent({ root, goal: specGoal(body), kind: "flow", content: specText(body), source: relative });
  const errors = [...report.violations, ...checks.findings].filter((finding) => finding.blocking);
  if (errors.length > 0) throw new Error(`lint has ${errors.length} error(s):\n${describeFindings(errors)}`);
  mutatePlanFile(root, relative, operation, (current) => {
    if (current !== body || revision(current) !== expectedRevision) throw new Error("The checked version changed during approval; read it again.");
    const vocabularyFile = operation === "lock-spec" ? approvedVocabularyFile(root, specText(current)) : null;
    return { ...transform(current, ownerWord), ...(vocabularyFile === null ? {} : { vocabularyFile }) };
  });
  return { root, plan: relative, saved: readFileSync(resolve(root, relative), "utf8") };
}

function specText(body: string): string {
  return body.split("<!-- plan:spec:start -->")[1]?.split("<!-- plan:spec:end -->")[0]?.trim() ?? body;
}

function specGoal(body: string): string {
  return /## (?:The )?Goal\s*\n([\s\S]*?)(?=\n## |\n<!--|$)/i.exec(specText(body))?.[1]?.trim() ?? "Evaluate the stated behavior.";
}

const deliverySchema = z.object({
  id: z.string().regex(/^D[1-9]\d*$/), review: z.enum(["required", "none"]).optional(), title: z.string(), branch: z.string(),
  depends: z.array(z.string()), gate: z.array(z.string()), active: z.boolean(),
  stageGraph: z.string().describe("One line, for example D1-S1 -> D1-S2."),
  predictedExternalWaitMinutes: z.number().nonnegative(), repository: z.string().optional(), description: z.string(),
});
const stageSchema = z.object({
  id: z.string().regex(/^D[1-9]\d*-S[1-9]\d*$/), deliveryId: z.string(), title: z.string(), owner: z.string(),
  profile: z.enum(["fast", "strong"]), depends: z.array(z.string()), parallelWith: z.array(z.string()),
  writes: z.array(z.string()), tempRoot: z.string().describe(".tmp/code-production/<plan file name without .md>/<Stage-ID>"),
  predictedActiveMinutes: z.number().nonnegative(), predictedCredits: z.number().nonnegative(),
  verifyActiveMinutes: z.number().nonnegative(), verifyCredits: z.number().nonnegative(),
  description: z.string(),
  tasks: z.array(z.object({
    id: z.string().regex(/^[A-Z][A-Z0-9_-]*$/), story: z.string(), writes: z.array(z.string()),
    predictedActiveMinutes: z.number().nonnegative(), predictedCredits: z.number().nonnegative(),
    how: z.union([z.string(), z.array(z.string())]),
    red: z.string().describe("Use bun run agent:test:backend -- test/exact-target.test.ts (or frontend/e2e)."),
  })),
  criteria: z.array(z.string()).describe("Each command uses `command` exits 0 — observable outcome. Include Commit as a separate item."),
});

const TOOLS = {
  publish_delivery: tool({
    description: "Publish the approved feature Delivery after complete local verification and the requested review. Reconciles an already-published head without another push. Plan-only draft publication requires workflows that exclude those documents from CI. Never merges or pushes protected branches.",
    schema: z.object({ plan: z.string(), delivery: z.string(), expectedHead: z.string(), phase: z.enum(["plan", "implementation"]), reviewPath: z.string().optional() }),
    run: async (deps, args) => {
      const result = await publishDelivery({ plan: resolve(deps.cwd, args.plan), delivery: args.delivery,
        expectedHead: args.expectedHead, phase: args.phase, ...(args.reviewPath === undefined ? {} : { reviewPath: args.reviewPath }) },
      { publication: deps.publication });
      return reply({ ...result }, `${result.pushed ? "Published" : "Already published"}: ${result.url}`);
    },
  }),
  check_content: tool({
    description: "Check one flow and its adjacent interfaces, or a code excerpt, without creating a plan. Returns factual findings, writing advice on clarity and complete target types, bounded Jev advice and rendered diagrams. Revise unreadable passages before presenting them; advice cannot grant approval.",
    schema: z.object({ root: z.string(), goal: z.string().min(1), kind: z.enum(["flow", "code"]), content: z.string(), source: z.string().optional(),
      questions: z.record(z.string(), z.object({ type: z.literal("noul"), instructions: z.string().min(1),
        criteria: z.object({ true: z.string().min(1), false: z.string().min(1) }) })).optional(),
    }),
    run: async (deps, args) => {
      const result = await checkContent({ root: repository(deps.cwd, args.root), goal: args.goal, kind: args.kind,
        content: args.content, ...(args.source === undefined ? {} : { source: args.source }),
        ...(args.questions === undefined ? {} : { questions: args.questions }) });
      return reply({ ...result }, [
        ...result.findings.map(f => `${f.blocking ? "Error" : "Advice"}: ${f.text}\nEvidence: ${f.quote}`),
        ...(result.semanticChecks.length > 0 ? [describeSemanticChecks(result.semanticChecks)] : []),
      ].join("\n\n") || "No findings.");
    },
  }),
  init: tool({
    description: "Create docs/plans/<date>-<slug>.md from the branch of a repository, stage and journal it, and return the authoring contract: the sections, the vocabulary and the Goal rule.",
    schema: z.object({ root: z.string(), title: z.string() }),
    run: async (deps, { root, title }) => {
      const repositoryRoot = repository(deps.cwd, root);
      const created = initPlan(repositoryRoot, { title });
      requireControlledPublication(repositoryRoot);
      const contract = await authoringContract(repositoryRoot);
      return reply({ plan: created.plan, branch: created.branch, base: created.base, ...contract }, [
        `Plan: ${created.plan}`,
        `Sections: ${contract.sections.join(", ")}`,
        ...contract.vocabulary.map((pair) => `Vocabulary: ${pair.word} → ${pair.term}`),
        `Goal rule: ${contract.goalRule}`,
        `Target rule: ${contract.targetRule}`,
        `Example flow:\n${contract.example}`,
      ].join("\n"));
    },
  }),
  submit_spec: tool({
    description: "Replace the whole SPEC of a draft, and its title when given. Target and Interfaces show only the finished system and complete hand-written TypeScript data types with explicit field lists, not Partial/Omit/Pick over another type. Current code, database declarations and instructions to add fields are refused before saving or publishing. Preserves authored words, normalizes line endings and reports blocking errors separately from actionable writing advice. Rewrite passages flagged as unreadable or incomplete before presenting them. Refuses a stale revision, a locked plan and a title in another language.",
    schema: z.object({ plan: z.string(), baseRevision: z.string(), ownerRequest: z.string(), spec: z.string(), title: z.string().optional(), vocabularyChanges: vocabularyChangesSchema.optional() }),
    run: async (deps, { plan, baseRevision, ownerRequest, spec, title, vocabularyChanges }) => {
      const { root, plan: relative } = located(deps.cwd, plan);
      recoverPlanMutation(root, relative);
      const result = await submitSpec(root, { plan: relative, baseRevision, ownerRequest, spec,
        ...(title === undefined ? {} : { title }), ...(vocabularyChanges === undefined ? {} : { vocabularyChanges }) });
      return reply({ plan: relative, ...result }, [
        `Revision ${result.revision}, ${result.state}`,
        describeChecks(result.findings, result.semanticChecks),
        ...result.corrections.map((correction) => `Corrected line ${correction.line}: ${correction.after}`),
        ...(result.findings.length > 0 ? [describeFindings(result.findings)] : []),
        ...(result.semanticChecks.length > 0 ? [describeSemanticChecks(result.semanticChecks)] : []),
      ].join("\n"));
    },
  }),
  vocabulary: tool({
    description: "The terms and the words they replace, from the shared vocabulary and the repository's own page.",
    schema: z.object({ root: z.string() }),
    run: async (deps, { root }) => {
      const resolved = repository(deps.cwd, root);
      const contract = await authoringContract(resolved);
      const definitions = readVocabulary(resolved);
      return reply({ terms: contract.vocabulary, ...definitions }, definitions.entries.map(e =>
        `${e.term}: ${e.meaning}${e.definitions.length ? ` (${e.definitions.map(d => `${d.repository}:${d.path}#${d.name}`).join(", ")})` : ""}`).join("\n"));
    },
  }),
  approve_spec: tool({
    description: "Record the owner's word on the SPEC. Runs the same lint as submission on the same bytes; only blocking errors refuse.",
    schema: z.object({ plan: z.string(), ownerWord: z.string(), expectedRevision: z.string() }),
    run: async (deps, { plan, ownerWord, expectedRevision }) => {
      const done = await lintedApproval(deps, plan, "lock-spec", lockPlanSpec, ownerWord, expectedRevision);
      return reply({ plan: done.plan, revision: protocolSpecHash(done.saved), state: planState(done.saved) }, "SPEC approval is recorded.");
    },
  }),
  approve_plan: tool({
    description: "Record the owner's word on the implementation contract. Runs the same lint as authoring on the same bytes.",
    schema: z.object({ plan: z.string(), ownerWord: z.string(), expectedRevision: z.string() }),
    run: async (deps, { plan, ownerWord, expectedRevision }) => {
      const done = await lintedApproval(deps, plan, "approve", approvePlan, ownerWord, expectedRevision);
      return reply({ plan: done.plan, revision: protocolImplementationHash(done.saved), state: planState(done.saved) }, "Implementation approval is recorded.");
    },
  }),
  put_delivery: tool({
    description: "Write one PR Delivery. A Delivery whose branch, commits and PR live in another repository names it with repository (a name, never a path); the checkout is one line per machine, git config code-production.repository.<name> <path>. Refuses with every error of the Delivery at once; returns the whole-plan findings without refusing an incomplete draft.",
    schema: z.object({ plan: z.string(), delivery: deliverySchema }),
    run: async (deps, { plan, delivery }) => {
      const { root, plan: relative } = located(deps.cwd, plan);
      const input = deliveryFrom(delivery);
      const current = readFileSync(resolve(root, relative), "utf8");
      await refuseInsidePart(putDelivery(current, input).body, root, deliveryStart(input.id), deliveryEnd(input.id));
      mutatePlanFile(root, relative, "put-delivery", (body) => putDelivery(body, input));
      const saved = readFileSync(resolve(root, relative), "utf8");
      const findings = await wholePlanFindings(saved, root);
      return reply({ plan: relative, deliveryId: input.id, revision: protocolImplementationHash(saved), findings }, `Delivery ${input.id} saved; ${findings.length} whole-plan finding(s)`);
    },
  }),
  put_stage: tool({
    description: "Write one Stage with its Tasks. Refuses with every error of the Stage at once, like a compiler; returns the whole-plan findings without refusing an incomplete draft.",
    schema: z.object({ plan: z.string(), stage: stageSchema }),
    run: async (deps, { plan, stage }) => {
      const { root, plan: relative } = located(deps.cwd, plan);
      const input = stageFrom(stage);
      const current = readFileSync(resolve(root, relative), "utf8");
      await refuseInsidePart(putStage(current, input).body, root, stageStart(input.id), stageEnd(input.id));
      mutatePlanFile(root, relative, "put-stage", (body) => putStage(body, input));
      const saved = readFileSync(resolve(root, relative), "utf8");
      const findings = await wholePlanFindings(saved, root);
      return reply({ plan: relative, deliveryId: input.deliveryId, revision: protocolImplementationHash(saved), findings }, `Stage ${input.id} saved; ${findings.length} whole-plan finding(s)`);
    },
  }),
  remove_stage: tool({
    description: "Remove a draft Stage before approval.",
    schema: z.object({ plan: z.string(), stage: z.string() }),
    run: async (deps, { plan, stage }) => {
      const { root, plan: relative } = located(deps.cwd, plan);
      mutatePlanFile(root, relative, "remove-stage", (body) => removeDraftStage(body, stage));
      return reply({ plan: relative, stage }, `Stage ${stage} removed`);
    },
  }),
  amend: tool({
    description: "Apply one exact replacement to the SPEC, the implementation or the title under the owner's word; on an approved plan a SPEC correction keeps the approval.",
    schema: z.object({ plan: z.string(), ownerWord: z.string(), patch: z.record(z.string(), z.unknown()) }),
    run: async (deps, { plan, ownerWord, patch }) => {
      const { root, plan: relative } = located(deps.cwd, plan);
      const replacement = patchFrom(patch);
      // The same lint as submission, at every write: an amendment may leave old errors, never add one.
      const current = readFileSync(resolve(root, relative), "utf8");
      const before = (await lint(current, root)).violations.map((violation) => `${violation.text}|${violation.quote}`);
      const candidate = applyOwnerAmendment(current, ownerWord, replacement).body;
      const checks = await checkContent({ root, goal: specGoal(candidate), kind: "flow", content: specText(candidate), source: relative });
      const previousChecks = await checkContent({ root, goal: specGoal(current), kind: "flow", content: specText(current), source: relative });
      before.push(...previousChecks.findings.map(f => `${f.text}|${f.quote}`));
      const after = [...(await lint(candidate, root)).violations, ...checks.findings];
      const added = after.filter((violation) => violation.blocking && !before.includes(`${violation.text}|${violation.quote}`));
      if (added.length > 0) throw new Error(`amendment adds ${added.length} error(s):\n${describeFindings(added)}`);
      mutatePlanFile(root, relative, "amend", (body) => applyOwnerAmendment(body, ownerWord, replacement));
      const saved = readFileSync(resolve(root, relative), "utf8");
      return reply(
        { plan: relative, section: replacement.section, specRevision: protocolSpecHash(saved), implementationRevision: protocolImplementationHash(saved), ...checks, findings: after },
        [`${replacement.section} amended under "${ownerWord}"`, `Checks: ${after.filter((finding) => finding.blocking).length} errors`, ...(after.length > 0 ? [describeFindings(after)] : [])].join("\n"),
      );
    },
  }),
  add_deviation: tool({
    description: "Record an agent-decided shortfall on a Stage; work continues.",
    schema: z.object({ plan: z.string(), stage: z.string(), text: z.string() }),
    run: async (deps, { plan, stage, text }) => {
      const { root, plan: relative } = located(deps.cwd, plan);
      mutatePlanFile(root, relative, "deviate", (body) => recordDeviation(body, stage, text));
      return reply({ plan: relative, stage, text }, `deviation recorded on ${stage}`);
    },
  }),
  progress: tool({
    description: "Where am I: the Goal, the running Task, the active Delivery beside the whole plan, the PR and CI gh observes, the installed runtime. Without plan, finds docs/plans/*-<slug>.md from the branch of root and answers nothing when the branch has none.",
    schema: z.object({ plan: z.string().optional(), root: z.string().optional(), note: z.boolean().optional() }),
    run: async (deps, { plan, root, note }) => {
      const target = plan !== undefined
        ? located(deps.cwd, plan)
        : root !== undefined ? { root: repository(deps.cwd, root), plan: null } : null;
      if (target === null) throw new Error("progress needs plan or root");
      const view = await planProgress(target.root, {
        plan: target.plan,
        publication: deps.publication,
        sourceCommit: deps.sourceCommit,
        decodeRun: decodeTaskRun,
      });
      if (note === true) return reply({ note: progressNote(view) }, progressNote(view) ?? "");
      if (view === null) return reply({ plan: null }, "");
      const revision = planRevision(readFileSync(resolve(target.root, view.plan), "utf8"), view.state);
      return reply({ ...view, revision }, `${renderProgressView(view)}\nRevision  ${revision}`);
    },
  }),
  start_task: tool({
    description: "What do I do now: without task, the running Task or the next open one in Stage-graph order; with task, that Task, also a completed one of an unmerged Delivery for repair; checkpoint saves one line on the record.",
    schema: z.object({ plan: z.string(), task: z.string().optional(), checkpoint: z.string().optional() }),
    run: async (deps, { plan, task, checkpoint }) => {
      const { root, plan: relative } = located(deps.cwd, plan);
      const brief = await startTask(root, {
        plan: relative,
        taskId: task ?? null,
        checkpoint: checkpoint ?? null,
        identity: null,
        publication: deps.publication,
        decodeRun: decodeTaskRun,
      });
      return reply({ ...brief }, renderTaskBrief(brief, "none (MCP record)"));
    },
  }),
  complete_task: tool({
    description: "Record one or more Tasks of a Stage from their IDs, the commit and a result sentence; paths, times, planned tests and the temp root are derived.",
    schema: z.object({ plan: z.string(), taskIds: z.array(z.string()).min(1), commit: z.string(), result: z.string(), deviations: z.array(z.string()).optional() }),
    run: async (deps, { plan, taskIds, commit, result, deviations }) => {
      const { root, plan: relative } = located(deps.cwd, plan);
      const done = await completeTask(root, deviations === undefined
        ? { plan: relative, taskIds, commit, result }
        : { plan: relative, taskIds, commit, result, deviations }, decodeTaskRun);
      return reply({ ...done }, [
        `Tasks ${done.taskIds.join(", ")} COMPLETED — ${done.stageId} commit:${done.commit}`,
        `${done.activeMinutes.toFixed(1)} active (estimate) / ${done.elapsedMinutes.toFixed(1)} elapsed min`,
        `Paths: ${done.paths.join(", ")}`,
        `Temp root: ${done.tempRoot.path} (${done.tempRoot.state})`,
      ].join("\n"));
    },
  }),
  close_stage: tool({
    description: "Run each machinable criterion of a Stage once; on the last Stage of a Delivery write the Ledger line.",
    schema: z.object({ plan: z.string(), stage: z.string() }),
    run: async (deps, { plan, stage }) => {
      const { root, plan: relative } = located(deps.cwd, plan);
      // The Stage closes in its Delivery's checkout, at that checkout's head.
      const at = closeRootOf(root, readFileSync(resolve(root, relative), "utf8"), stage);
      const head = at.head;
      const before = readFileSync(resolve(root, relative), "utf8");
      let status: "CLOSED" | "PARTIAL" = "PARTIAL";
      let closed = 0;
      let verificationLogs: readonly string[] = [];
      mutatePlanFile(root, relative, "close", (body) => {
        const result = closePlanStage(body, stage, { root: at.root, head });
        status = result.status;
        closed = result.closed;
        verificationLogs = result.verificationLogs ?? [];
        return { body: result.body };
      });
      const saved = readFileSync(resolve(root, relative), "utf8");
      const stageInput = stageInputs(before).find(s => s.id === stage);
      if (stageInput !== undefined && closed > 0) {
        for (const criterion of stageInput.criteria) {
          const command = /^`([^`]+)`\s+exits\s+0/.exec(criterion)?.[1];
          // Only an actually executed full gate receives a reusable verification record.
          if (command !== undefined && deliveryGate(before, stageInput.deliveryId) === command && before.includes(`- [ ] ${criterion}`)
            && saved.includes(`- [x] ${criterion} — ${head}`)) recordCompleteGate(at.root, relative, command, saved);
        }
      }
      return reply({ plan: relative, stage, status, closed, head, verificationLogs }, `Stage ${stage} ${status}: ${closed} criteria closed.\n${verificationLogs.map(path => `Verification output: ${path}`).join("\n")}`);
    },
  }),
  needs_owner: tool({
    description: "Record that a started Task needs one owner answer, as a form: what this is about, the options with their consequences, the recommendation, the form of the answer.",
    schema: z.object({
      plan: z.string(),
      task: z.string(),
      context: z.string(),
      options: z.array(z.object({ label: z.string(), consequence: z.string() })).min(1),
      recommendation: z.string(),
      answerForm: z.string(),
    }),
    run: async (deps, { plan, task, context, options, recommendation, answerForm }) => {
      const { root, plan: relative } = located(deps.cwd, plan);
      const receipt = await needsOwner(root, { plan: relative, taskId: task, context, options, recommendation, answerForm });
      return reply({ ...receipt }, [
        `Task ${task} AWAITING OWNER`,
        `Context: ${receipt.context}`,
        ...receipt.options.map((option) => `Option: ${option.label} — ${option.consequence}`),
        `Recommendation: ${receipt.recommendation}`,
        `Answer: ${receipt.answerForm}`,
      ].join("\n"));
    },
  }),
  resume_task: tool({
    description: "Clear the Task's owner wait and account its duration; without a wait nothing changes.",
    schema: z.object({ plan: z.string(), task: z.string() }),
    run: async (deps, { plan, task }) => {
      const { root, plan: relative } = located(deps.cwd, plan);
      const resumed = await resumeTask(root, { plan: relative, taskId: task, decodeRun: decodeTaskRun });
      return reply(
        { plan: relative, taskId: task, cleared: resumed.marker !== null, context: resumed.marker?.context ?? null },
        resumed.marker === null ? `Task ${task} has no owner wait; nothing cleared` : `Task ${task} RESUMED: ${resumed.marker.context}`,
      );
    },
  }),
};

type ToolName = keyof typeof TOOLS;

/** The tools that write the plan: each republishes it and returns url and reply. */
const WRITERS: ReadonlySet<ToolName> = new Set<ToolName>(["submit_spec", "approve_spec", "approve_plan", "put_delivery", "put_stage", "remove_stage", "amend", "add_deviation", "complete_task", "close_stage"]);

/** The revision a write must name: the SPEC hash while the SPEC is a draft, the implementation hash after. */
function planRevision(saved: string, state: string): string {
  return state === "SPEC_DRAFT" ? protocolSpecHash(saved) : protocolImplementationHash(saved);
}

/** After a write: publish the saved bytes and add url and the owner reply; a publish failure is an error, never a stale URL.
 * @tested-by: tst_unit_planctl_mcp_002
 */
function published(deps: ServerDependencies, args: Record<string, unknown>, result: ToolResult): ToolResult {
  if (result.isError === true || typeof args.plan !== "string") return result;
  const { root, plan } = located(deps.cwd, args.plan);
  const structured = result.structuredContent ?? {};
  const saved = readFileSync(resolve(root, plan), "utf8");
  const state = typeof structured.state === "string" ? structured.state : planState(saved);
  const revision = typeof structured.revision === "string" ? structured.revision : planRevision(saved, state);
  const checks = "checkStatus" in structured
    ? describeChecks(
      z.array(z.object({ blocking: z.boolean() })).parse(structured.findings),
      z.array(z.object({ probability: z.number().nullable(), uncertainty: z.string().nullable() })).parse(structured.semanticChecks),
    )
    : null;
  let url: string;
  try {
    url = deps.publisher(root, plan);
  } catch (error: unknown) {
    return refusal(`saved revision ${revision} but publishing failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const owner = ownerReply(url, revision, state, checks);
  return {
    ...result,
    structuredContent: { ...structured, revision, specRevision: protocolSpecHash(saved), implementationRevision: protocolImplementationHash(saved), state, url, reply: owner },
    content: [{ type: "text", text: `${owner}\n${result.content.map((entry) => entry.text).join("\n")}` }],
  };
}

/** Where a call points, for the event line: the repository and plan it named, even when the plan does not exist yet. */
function calledLocation(cwd: string, args: Record<string, unknown>): { readonly repository: string; readonly plan: string } {
  const toplevel = (directory: string): string => {
    let probe = directory;
    while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
    try {
      return execFileSync("git", ["-C", probe, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      return "";
    }
  };
  if (typeof args.plan === "string") {
    const absolute = resolve(cwd, args.plan);
    const root = toplevel(dirname(absolute));
    return { repository: root, plan: root !== "" && absolute.startsWith(`${root}/`) ? absolute.slice(root.length + 1) : "" };
  }
  if (typeof args.root === "string") return { repository: toplevel(resolve(cwd, args.root)), plan: "" };
  return { repository: "", plan: "" };
}

function installedRuntimeCommit(repositoryRoot: string): string | null {
  const manifest = resolve(repositoryRoot, ".agents/code-production/manifest.json");
  if (repositoryRoot === "" || !existsSync(manifest)) return null;
  const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
  return typeof parsed === "object" && parsed !== null && "commit" in parsed && typeof parsed.commit === "string" ? parsed.commit : null;
}

function stringsOf(value: unknown): readonly string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/** The event line of one call: what it named, what it returned, how it ended. */
function eventOf(
  deps: ServerDependencies,
  name: string,
  args: Record<string, unknown>,
  result: ToolResult,
  at: string,
  durationMs: number,
): EventRecord {
  const location = calledLocation(deps.cwd, args);
  const structured = result.structuredContent ?? {};
  const delivery = typeof structured.deliveryId === "string"
    ? structured.deliveryId
    : typeof structured.delivery === "object" && structured.delivery !== null && "id" in structured.delivery && typeof structured.delivery.id === "string"
      ? structured.delivery.id
      : null;
  const publication = typeof structured.publication === "object" && structured.publication !== null && "prUrl" in structured.publication
    ? structured.publication as { prUrl: string; headSha: string; runId: string; attempt: number }
    : null;
  const planPath = location.plan !== "" ? resolve(location.repository, location.plan) : "";
  const revision = planPath !== "" && existsSync(planPath) ? protocolImplementationHash(readFileSync(planPath, "utf8")) : "";
  return {
    at,
    repository: location.repository,
    worktree: location.repository,
    plan: location.plan,
    revision,
    tool: name,
    deliveryId: delivery,
    taskIds: [...new Set([...stringsOf(args.task), ...stringsOf(args.taskIds), ...stringsOf(structured.taskId), ...stringsOf(structured.taskIds)])],
    forecastMinutes: typeof structured.forecastMinutes === "number" ? structured.forecastMinutes : null,
    prUrl: publication?.prUrl ?? null,
    ciHeadSha: publication?.headSha ?? null,
    ciRunId: publication?.runId ?? null,
    ciAttempt: publication?.attempt ?? null,
    outcome: result.isError === true ? "refused" : "ok",
    reason: result.isError === true ? result.content.map((entry) => entry.text).join("\n") : null,
    durationMs,
    runtimeCommit: installedRuntimeCommit(location.repository),
    sourceCommit: deps.sourceCommit,
  };
}

/** Run one tool call and append its event line: a schema rejection before the handler is a refusal too.
 * @tested-by: tst_unit_planctl_event_log_002, tst_unit_planctl_mcp_001
 */
export async function dispatchTool(deps: ServerDependencies, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const at = new Date().toISOString();
  const began = Date.now();
  let result: ToolResult;
  const definition = name in TOOLS ? TOOLS[name as ToolName] : undefined;
  if (definition === undefined) {
    result = refusal(`unknown tool ${name}`);
  } else {
    const parsed = definition.schema.safeParse(args);
    if (!parsed.success) {
      result = refusal(`invalid arguments for ${name}: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ")}`);
    } else {
      try {
        result = await (definition.run as (deps: ServerDependencies, args: unknown) => Promise<ToolResult>)(deps, parsed.data);
        if (WRITERS.has(name as ToolName)) result = published(deps, args, result);
      } catch (error: unknown) {
        result = refusal(error instanceof Error ? error.message : String(error));
      }
    }
  }
  if (name === "check_content" || name === "submit_spec" || name === "amend") {
    try { result = boundedContentResult(calledLocation(deps.cwd, args).repository, result); }
    catch (error: unknown) {
      result = refusal(`${result.content.map(entry => entry.text).join("\n").slice(0, 1000)}\nThe tool returned this result, but storing its complete oversized evidence failed: ${error instanceof Error ? error.message : String(error)}. Inspect the current draft before retrying.`);
    }
  }
  try { appendEvent(deps.eventLog, eventOf(deps, name, args, result, at, Date.now() - began)); }
  catch {
    // This is observer telemetry, not the transaction journal. Never misreport
    // a completed mutation or ask the agent to recreate a recorded approval.
    const diagnostic = "Diagnostic event logging is unavailable; the operation result and plan journal are unchanged.";
    return { ...result, structuredContent: { ...result.structuredContent, diagnostics: [diagnostic] },
      content: [...result.content, { type: "text", text: diagnostic }] };
  }
  return result;
}

/** The names of the tools the server serves, for the installer that approves them. */
export function toolNames(): readonly string[] {
  return Object.keys(TOOLS);
}

/** The planctl tools over stdio. @tested-by: tst_unit_planctl_mcp_001, tst_unit_planctl_mcp_010 */
export function createPlanctlServer(deps: ServerDependencies): Server {
  const server = new Server({ name: "planctl", version: "0.1.0" }, {
    capabilities: { tools: {} },
    instructions: "Use the planctl MCP tools to change plans. Commit authorized changes with normal Git hooks enabled. "
      + "Journal cleanup is automatic: the post-commit hook clears a committed journal, or the next MCP write reconciles it against HEAD. "
      + "Continue with the next authorized action after a successful commit; no separate clear-transaction command or owner confirmation is needed. "
      + "If a tool reports a journal mismatch, inspect that error; do not delete the journal or bypass the checks.",
  });
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: Object.entries(TOOLS).map(([name, definition]) => ({
      name,
      description: definition.description,
      inputSchema: z.toJSONSchema(definition.schema) as { type: "object"; [key: string]: unknown },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => dispatchTool(deps, request.params.name, request.params.arguments ?? {}));
  return server;
}
