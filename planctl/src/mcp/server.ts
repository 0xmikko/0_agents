import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
  removeDraftStage,
  resumeTask,
  stageEnd,
  stageFrom,
  stageStart,
  startTask,
  validateImplementation,
} from "../core/plan-update";
import { submitSpec } from "../core/spec-submission";
import { decodeTaskRun } from "../core/task-run";
import { renderProgressView, renderTaskBrief } from "../cli/render";
import { ownerReply } from "./publish";

interface ServerDependencies {
  /** Where relative plan paths resolve; the server never changes it. */
  readonly cwd: string;
  /** What gh reports for a Delivery branch of a repository. */
  readonly publication: (root: string, branch: string) => ProgressView["publication"];
  /** HEAD of the checkout the server runs from. */
  readonly sourceCommit: string;
  /** The events.jsonl every call appends one line to. */
  readonly eventLog: string;
  /** The one bounded model call submit_spec makes for the changed lines. */
  readonly model: (prompt: string, deadlineMs: number) => Promise<string>;
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
  return findings.map((finding) => `line ${finding.line}: ${finding.text}${finding.replacement === null ? "" : ` → ${finding.replacement}`}`).join("\n");
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
  const inside = report.violations.filter((violation) => violation.line >= from && violation.line <= to);
  if (inside.length > 0) throw new Error(`the submitted part has ${inside.length} error(s):\n${describeFindings(inside)}`);
}

async function lintedApproval(deps: ServerDependencies, plan: string, operation: string, transform: (body: string, ownerWord: string) => { body: string }, ownerWord: string): Promise<{ root: string; plan: string; saved: string }> {
  const { root, plan: relative } = located(deps.cwd, plan);
  const body = readFileSync(resolve(root, relative), "utf8");
  const report = await lint(body, root);
  if (report.violations.length > 0) throw new Error(`lint has ${report.violations.length} error(s):\n${describeFindings(report.violations)}`);
  mutatePlanFile(root, relative, operation, (current) => transform(current, ownerWord));
  return { root, plan: relative, saved: readFileSync(resolve(root, relative), "utf8") };
}

const TOOLS = {
  init: tool({
    description: "Create docs/plans/<date>-<slug>.md from the branch of a repository, stage and journal it, and return the authoring contract: the sections, the vocabulary and the Goal rule.",
    schema: z.object({ root: z.string(), title: z.string() }),
    run: async (deps, { root, title }) => {
      const repositoryRoot = repository(deps.cwd, root);
      const created = initPlan(repositoryRoot, { title });
      const contract = await authoringContract(repositoryRoot);
      return reply({ plan: created.plan, branch: created.branch, base: created.base, ...contract }, [
        `Plan: ${created.plan}`,
        `Sections: ${contract.sections.join(", ")}`,
        ...contract.vocabulary.map((pair) => `Vocabulary: ${pair.word} → ${pair.term}`),
        `Goal rule: ${contract.goalRule}`,
      ].join("\n"));
    },
  }),
  submit_spec: tool({
    description: "Replace the whole SPEC of a draft. Fixes line endings and vocabulary itself, returns every lint error at once and the model's notes on the changed lines. Refuses a stale revision and a locked plan.",
    schema: z.object({ plan: z.string(), baseRevision: z.string(), ownerRequest: z.string(), spec: z.string() }),
    run: async (deps, { plan, baseRevision, ownerRequest, spec }) => {
      const { root, plan: relative } = located(deps.cwd, plan);
      const result = await submitSpec(root, { plan: relative, baseRevision, ownerRequest, spec }, deps.model);
      const errors = result.findings.filter((finding) => finding.blocking).length;
      const notes = result.findings.length - errors;
      return reply({ plan: relative, ...result }, [
        `Revision ${result.revision}, ${result.state}`,
        `Checks: ${errors} errors, ${notes} model notes${result.checkStatus === "checked" ? "" : ` (${result.checkStatus}${result.checkError === null ? "" : `: ${result.checkError}`})`}`,
        ...result.corrections.map((correction) => `Corrected line ${correction.line}: ${correction.after}`),
        ...result.findings.map((finding) => `line ${finding.line}: ${finding.text}${finding.replacement === null ? "" : ` → ${finding.replacement}`}`),
      ].join("\n"));
    },
  }),
  vocabulary: tool({
    description: "The terms and the words they replace, from the shared vocabulary and the repository's own page.",
    schema: z.object({ root: z.string() }),
    run: async (deps, { root }) => {
      const contract = await authoringContract(repository(deps.cwd, root));
      return reply({ terms: contract.vocabulary }, contract.vocabulary.map((pair) => `${pair.word} → ${pair.term}`).join("\n"));
    },
  }),
  approve_spec: tool({
    description: "Record the owner's word on the SPEC. Runs the same lint as submission on the same bytes; every lint error refuses.",
    schema: z.object({ plan: z.string(), ownerWord: z.string() }),
    run: async (deps, { plan, ownerWord }) => {
      const done = await lintedApproval(deps, plan, "lock-spec", lockPlanSpec, ownerWord);
      return reply({ plan: done.plan, revision: protocolSpecHash(done.saved), state: "SPEC_LOCKED" }, `SPEC locked under "${ownerWord}"`);
    },
  }),
  approve_plan: tool({
    description: "Record the owner's word on the implementation contract. Runs the same lint as authoring on the same bytes.",
    schema: z.object({ plan: z.string(), ownerWord: z.string() }),
    run: async (deps, { plan, ownerWord }) => {
      const done = await lintedApproval(deps, plan, "approve", approvePlan, ownerWord);
      return reply({ plan: done.plan, revision: protocolImplementationHash(done.saved), state: "APPROVED" }, `plan approved under "${ownerWord}"`);
    },
  }),
  put_delivery: tool({
    description: "Write one PR Delivery. Refuses with every error of the Delivery at once; returns the whole-plan findings without refusing an incomplete draft.",
    schema: z.object({ plan: z.string(), delivery: z.record(z.string(), z.unknown()) }),
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
    schema: z.object({ plan: z.string(), stage: z.record(z.string(), z.unknown()) }),
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
    description: "Apply one exact replacement to the SPEC or the implementation under the owner's word; on an approved plan a SPEC correction keeps the approval.",
    schema: z.object({ plan: z.string(), ownerWord: z.string(), patch: z.record(z.string(), z.unknown()) }),
    run: async (deps, { plan, ownerWord, patch }) => {
      const { root, plan: relative } = located(deps.cwd, plan);
      const replacement = patchFrom(patch);
      mutatePlanFile(root, relative, "amend", (body) => applyOwnerAmendment(body, ownerWord, replacement));
      const saved = readFileSync(resolve(root, relative), "utf8");
      return reply(
        { plan: relative, section: replacement.section, specRevision: protocolSpecHash(saved), implementationRevision: protocolImplementationHash(saved) },
        `${replacement.section} amended under "${ownerWord}"`,
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
        publication: (branch) => deps.publication(target.root, branch),
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
        publication: (branch) => deps.publication(root, branch),
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
      const head = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
      let status: "CLOSED" | "PARTIAL" = "PARTIAL";
      let closed = 0;
      mutatePlanFile(root, relative, "close", (body) => {
        const result = closePlanStage(body, stage, { root, head });
        status = result.status;
        closed = result.closed;
        return { body: result.body };
      });
      return reply({ plan: relative, stage, status, closed, head }, `Stage ${stage} ${status}: ${closed} criteria closed at ${head.slice(0, 7)}`);
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
  const findings = Array.isArray(structured.findings) ? structured.findings as readonly { blocking?: unknown }[] : null;
  const checks = "checkStatus" in structured && findings !== null
    ? { errors: findings.filter((finding) => finding.blocking === true).length, notes: findings.filter((finding) => finding.blocking === false).length }
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
    structuredContent: { ...structured, revision, state, url, reply: owner },
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
  const publication = typeof structured.publication === "object" && structured.publication !== null && "prUrl" in structured.publication
    ? structured.publication as { prUrl: string; headSha: string; runId: string; attempt: number }
    : null;
  const delivery = typeof structured.deliveryId === "string"
    ? structured.deliveryId
    : typeof structured.delivery === "object" && structured.delivery !== null && "id" in structured.delivery && typeof structured.delivery.id === "string"
      ? structured.delivery.id
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
  appendEvent(deps.eventLog, eventOf(deps, name, args, result, at, Date.now() - began));
  return result;
}

/** The names of the tools the server serves, for the installer that approves them. */
export function toolNames(): readonly string[] {
  return Object.keys(TOOLS);
}

/** The planctl tools over stdio. @tested-by: tst_unit_planctl_mcp_001 */
export function createPlanctlServer(deps: ServerDependencies): Server {
  const server = new Server({ name: "planctl", version: "0.1.0" }, { capabilities: { tools: {} } });
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
