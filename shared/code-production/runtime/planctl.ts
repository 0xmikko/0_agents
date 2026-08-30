#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { createDraftPlan, replaceDraftSpec, taskExecutionBrief, verifyStagedPlan } from "./plan-update";
import { protocolLockViolations } from "./plan-gate";

import type { TaskExecutionBrief } from "./plan-update";

const GENERAL_HELP = `Usage: planctl <command> [arguments]

Small agent-facing CLI over one canonical writer: plan-update.
Plans are authored and advanced by commands; approved plan bytes are never
edited directly.

Authoring:
  init               Create and stage a SPEC_DRAFT plan
  set-spec           Replace and stage SPEC while it is still draft
  approve-spec       Lock SPEC after explicit owner approval
  put-delivery       Add or replace one draft PR Delivery from JSON
  put-stage          Add or replace one draft commit-sized Stage from JSON
  remove-stage       Remove one draft Stage
  approve-plan       Lock Delivery, Stage and Task meaning

Execution:
  start-task         Validate one approved Task, print its scope and start timing
  complete-task      Import a validated Stage result and close its Task(s)
  add-deviation      Append one scoped execution deviation
  close-stage        Prove and close a Stage's acceptance criteria
  amend              Apply an explicit owner amendment

Checks:
  verify             Verify SPEC and implementation locks
  verify-staged      Verify the staged mutation journal

Run planctl <command> --help for exact syntax and JSON contracts.
`;

const COMMAND_HELP: Readonly<Record<string, string>> = {
  init: `Usage: planctl init <plan.md> --title <text>

Creates the canonical SPEC_DRAFT skeleton and stages it. Commit it before
locking SPEC.
`,
  "set-spec": `Usage: planctl set-spec <plan.md> --from <spec.md>

Replaces only the marked SPEC in SPEC_DRAFT and stages the plan.
`,
  "approve-spec": `Usage: planctl approve-spec <plan.md> --owner-word <receipt>

Locks the exact SPEC bytes. Run only after explicit owner approval.
`,
  "put-delivery": `Usage: planctl put-delivery <plan.md> --from <delivery.json>

Delivery JSON uses the canonical plan-update DeliveryInput contract. IDs are
D1, D2, ...; a Delivery is one PR. Reusing an ID replaces its draft metadata
and preserves its existing Stage blocks.
`,
  "put-stage": `Usage: planctl put-stage <plan.md> --from <stage.json>

Add or replace a Stage while the plan is SPEC_LOCKED. Stage JSON is structured
input; planctl renders the Markdown. APPROVED plans remain immutable.

Good Task in a complete stage.json (copy this shape):
{
  "id": "D1-S1",
  "deliveryId": "D1",
  "title": "Reject overlapping scheduler work",
  "owner": "agent-1",
  "profile": "fast",
  "depends": [],
  "parallelWith": [],
  "writes": ["src/scheduler/parse-lanes.ts", "test/scheduler/parse-lanes.test.ts"],
  "tempRoot": ".tmp/code-production/scheduler-overlap/D1-S1",
  "predictedActiveMinutes": 12,
  "verifyActiveMinutes": 2,
  "verifyCredits": 1,
  "predictedCredits": 3,
  "tasks": [{
    "id": "PLANCTL_001",
    "story": "Reject overlapping Stage writes in src/scheduler/parse-lanes.ts and cover the refusal in test/scheduler/parse-lanes.test.ts.",
    "writes": ["src/scheduler/parse-lanes.ts", "test/scheduler/parse-lanes.test.ts"],
    "predictedActiveMinutes": 10,
    "predictedCredits": 2,
    "how": "change src/scheduler/parse-lanes.ts to compare exact Stage writes before assignment; add the overlap refusal case to test/scheduler/parse-lanes.test.ts",
    "red": "bun run agent:test:backend -- test/scheduler/parse-lanes.test.ts -t tst_scheduler_005"
  }],
  "criteria": ["\`bun run agent:test:backend -- test/scheduler/parse-lanes.test.ts\` exits 0 — overlap is rejected", "Commit"]
}

Bad Task (rejected):
{"id":"BAD_001","story":"Refactor scheduler","writes":[],"predictedActiveMinutes":0,"predictedCredits":0,"how":"","red":"echo done"}
`,
  "remove-stage": `Usage: planctl remove-stage <plan.md> --stage <D1-S1>

Removes one Stage while the plan is SPEC_LOCKED. APPROVED plans remain
immutable. Re-add or replace remaining Stage JSON before approve-plan.
`,
  "approve-plan": `Usage: planctl approve-plan <plan.md> --owner-word <receipt>

Locks the Delivery/Stage/Task contract after explicit owner approval.
`,
  "start-task": `Usage: planctl start-task <plan.md> --task <Task-ID>

Reads the Task from the committed or journal-verified staged APPROVED Markdown
source of truth, checks its Delivery and Stage dependencies, prints the exact
story/writes/forecast/How/RED contract, and stores only a Git-local start
receipt. It does not edit the plan. Run it before RED.
`,
  "complete-task": `Usage: planctl complete-task <plan.md> --from <stage-result.json>

Imports the canonical StageResultReceipt. It validates Task IDs, commit
ancestry and actual diff paths, declared tests, time/usage and temp cleanup.
Every addressed Task must have a start-task receipt; successful import consumes
those local timers, checks the Task boxes and appends Result rows.

Copy this stage-result.json shape after the work commit:
{
  "version": 1,
  "plan": "docs/plans/example.md",
  "deliveryId": "D1",
  "stageId": "D1-S1",
  "taskIds": ["PLANCTL_001"],
  "commit": "<work-commit-sha>",
  "startedAt": "<exact Started value from start-task>",
  "endedAt": "<UTC ISO timestamp>",
  "activeMinutes": 10,
  "elapsedMinutes": 12,
  "usage": {"kind":"unavailable","reason":"runner did not expose usage"},
  "paths": ["src/scheduler.ts", "test/scheduler.test.ts"],
  "tests": [{"id":"tst_scheduler_005","command":"bun run agent:test:backend -- test/scheduler.test.ts"}],
  "result": "Approved plan changes are rejected outside planctl.",
  "deviations": [],
  "tempRoots": [{"path":".tmp/code-production/scheduler-overlap/D1-S1","state":"absent"}]
}
`,
  "add-deviation": `Usage: planctl add-deviation <plan.md> --stage <D1-S1> --reason <text>

Appends a scoped deviation without changing approved Task meaning.
`,
  "close-stage": `Usage: planctl close-stage <plan.md> --stage <D1-S1>

Re-runs machinable criteria and closes only those proven on the current HEAD.
`,
  amend: `Usage: planctl amend <plan.md> --owner-word <receipt> --patch <patch.json>

Applies one exact owner-authorized replacement through the canonical writer.
`,
  verify: `Usage: planctl verify <plan.md>

Checks the canonical SPEC and implementation hashes. Exits non-zero on drift.
`,
  "verify-staged": `Usage: planctl verify-staged <plan.md>

Checks that staged plan bytes are exactly the script-produced journal head.
`,
  "clear-transaction": `Usage: planctl clear-transaction <plan.md> --commit <sha>

Internal post-commit cleanup for a spent mutation journal.
`,
};

interface TaskRun {
  readonly version: 1;
  readonly plan: string;
  readonly deliveryId: string;
  readonly stageId: string;
  readonly taskId: string;
  readonly startedAt: string;
  readonly baseHead: string;
}

interface CompletionHeader {
  readonly plan: string;
  readonly taskIds: readonly string[];
  readonly commit: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly elapsedMinutes: number;
}

const ENGINE_COMMANDS: Readonly<Record<string, string>> = {
  "approve-spec": "lock-spec",
  "put-delivery": "put-delivery",
  "put-stage": "put-stage",
  "remove-stage": "remove-stage",
  "approve-plan": "approve",
  "complete-task": "record-result",
  "add-deviation": "deviate",
  "close-stage": "close",
  amend: "amend",
  "verify-staged": "verify-staged",
  "clear-transaction": "clear-spent",
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function flag(args: readonly string[], name: string): string {
  const at = args.indexOf(name);
  const value = at === -1 ? undefined : args[at + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} is required`);
  return value;
}

function root(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
}

function git(rootPath: string, ...args: readonly string[]): string {
  return execFileSync("git", ["-C", rootPath, ...args], { encoding: "utf8" }).trim();
}

function addressedPath(rootPath: string, input: string): { readonly absolute: string; readonly relative: string } {
  const absolute = resolve(rootPath, input);
  const repoRelative = relative(rootPath, absolute);
  if (repoRelative === "" || repoRelative === ".." || repoRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    || isAbsolute(repoRelative)) {
    throw new Error("plan must be a file inside the repository");
  }
  return { absolute, relative: repoRelative };
}

function atomicWrite(path: string, body: string): void {
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true });
  const temporary = mkdtempSync(join(parent, ".planctl-"));
  const candidate = join(temporary, "plan.md");
  try {
    writeFileSync(candidate, body);
    renameSync(candidate, path);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function stage(rootPath: string, path: string): void {
  execFileSync("git", ["-C", rootPath, "add", "--", path]);
}

function taskRunPath(rootPath: string, plan: string, taskId: string): string {
  const common = git(rootPath, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const planKey = createHash("sha256").update(plan).digest("hex").slice(0, 12);
  return join(common, "planctl", "task-runs", `${planKey}-${taskId}.json`);
}

function taskRunFrom(value: unknown): TaskRun {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Task start receipt is invalid");
  const record = value as Readonly<Record<string, unknown>>;
  if (record.version !== 1 || typeof record.plan !== "string" || typeof record.deliveryId !== "string"
    || typeof record.stageId !== "string" || typeof record.taskId !== "string"
    || typeof record.startedAt !== "string" || typeof record.baseHead !== "string") {
    throw new Error("Task start receipt has an unsupported shape");
  }
  return {
    version: 1,
    plan: record.plan,
    deliveryId: record.deliveryId,
    stageId: record.stageId,
    taskId: record.taskId,
    startedAt: record.startedAt,
    baseHead: record.baseHead,
  };
}

function printTaskStart(brief: TaskExecutionBrief, run: TaskRun): void {
  console.log([
    `Task ${brief.id} STARTED`,
    `Source: ${run.plan}`,
    `Delivery / Stage: ${brief.deliveryId} / ${brief.stageId} — ${brief.stageTitle}`,
    `Owner / Profile: ${brief.owner} / ${brief.profile}`,
    `Started: ${run.startedAt}`,
    `Base: ${run.baseHead}`,
    `Forecast: ${brief.predictedActiveMinutes} active min / ${brief.predictedCredits} credits`,
    `Writes: ${brief.writes.join(", ")}`,
    `Temp root: ${brief.tempRoot} (clean before completion)`,
    `Story: ${brief.story}`,
    `How: ${brief.how}`,
    `RED: ${brief.red}`,
  ].join("\n"));
}

function startTask(args: readonly string[]): void {
  const plan = args[1];
  if (plan === undefined) throw new Error("plan path is required");
  const rootPath = root();
  const target = addressedPath(rootPath, plan);
  const body = readFileSync(target.absolute, "utf8");
  const committed = execFileSync("git", ["-C", rootPath, "show", `HEAD:${target.relative}`], { encoding: "utf8" });
  if (body !== committed) {
    try {
      verifyStagedPlan(target.relative);
    } catch {
      throw new Error("start-task requires a committed plan or a journal-verified staged result");
    }
  }
  const violations = protocolLockViolations(body);
  if (violations.length > 0) throw new Error(violations.join("; "));
  const brief = taskExecutionBrief(body, flag(args, "--task"));
  const path = taskRunPath(rootPath, target.relative, brief.id);
  if (existsSync(path)) {
    const existing = taskRunFrom(JSON.parse(readFileSync(path, "utf8")) as unknown);
    if (existing.plan !== target.relative || existing.taskId !== brief.id || existing.stageId !== brief.stageId) {
      throw new Error(`Task ${brief.id} has a conflicting start receipt`);
    }
    if (spawnSync("git", ["-C", rootPath, "merge-base", "--is-ancestor", existing.baseHead, "HEAD"]).status !== 0) {
      throw new Error(`Task ${brief.id} start base is not ancestral to HEAD`);
    }
    printTaskStart(brief, existing);
    return;
  }
  const run: TaskRun = {
    version: 1,
    plan: target.relative,
    deliveryId: brief.deliveryId,
    stageId: brief.stageId,
    taskId: brief.id,
    startedAt: new Date().toISOString(),
    baseHead: git(rootPath, "rev-parse", "HEAD"),
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(run, null, 2)}\n`);
  printTaskStart(brief, run);
}

function completionHeader(value: unknown): CompletionHeader {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Stage result must be an object");
  const record = value as Readonly<Record<string, unknown>>;
  if (typeof record.plan !== "string" || !Array.isArray(record.taskIds)
    || !record.taskIds.every((id) => typeof id === "string") || record.taskIds.length === 0
    || typeof record.commit !== "string" || typeof record.startedAt !== "string"
    || typeof record.endedAt !== "string" || typeof record.elapsedMinutes !== "number") {
    throw new Error("Stage result timing header is invalid");
  }
  return {
    plan: record.plan,
    taskIds: record.taskIds,
    commit: record.commit,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    elapsedMinutes: record.elapsedMinutes,
  };
}

function completeTask(args: readonly string[]): number {
  const plan = args[1];
  if (plan === undefined) throw new Error("plan path is required");
  const rootPath = root();
  const target = addressedPath(rootPath, plan);
  const receipt = completionHeader(JSON.parse(readFileSync(resolve(rootPath, flag(args, "--from")), "utf8")) as unknown);
  if (receipt.plan !== target.relative) throw new Error(`Stage result names ${receipt.plan}, expected ${target.relative}`);
  const runs = receipt.taskIds.map((taskId) => {
    const path = taskRunPath(rootPath, target.relative, taskId);
    if (!existsSync(path)) throw new Error(`Task ${taskId} has no start receipt; run planctl start-task first`);
    return { path, run: taskRunFrom(JSON.parse(readFileSync(path, "utf8")) as unknown) };
  });
  const earliest = runs.reduce((value, entry) => entry.run.startedAt < value ? entry.run.startedAt : value, runs[0]?.run.startedAt ?? "");
  if (receipt.startedAt !== earliest) throw new Error(`Stage result startedAt must equal the earliest start-task receipt (${earliest})`);
  const startedMs = Date.parse(receipt.startedAt);
  const endedMs = Date.parse(receipt.endedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs) || endedMs < startedMs) {
    throw new Error("Stage result UTC interval is invalid");
  }
  const measuredMinutes = (endedMs - startedMs) / 60_000;
  if (Math.abs(receipt.elapsedMinutes - measuredMinutes) > 1) {
    throw new Error(`Stage result elapsedMinutes differs from its UTC interval (${measuredMinutes.toFixed(2)} min)`);
  }
  for (const { run } of runs) {
    if (run.plan !== target.relative || run.taskId === "" || !receipt.taskIds.includes(run.taskId)) {
      throw new Error("Task start receipt does not match the Stage result");
    }
    if (spawnSync("git", ["-C", rootPath, "merge-base", "--is-ancestor", run.baseHead, receipt.commit]).status !== 0) {
      throw new Error(`Task ${run.taskId} result commit does not descend from its start base`);
    }
  }
  const status = runEngine(args, "record-result");
  if (status === 0) for (const { path } of runs) unlinkSync(path);
  return status;
}

function init(args: readonly string[]): void {
  const plan = args[1];
  if (plan === undefined) throw new Error("plan path is required");
  const rootPath = root();
  const target = addressedPath(rootPath, plan);
  if (existsSync(target.absolute)) throw new Error(`plan already exists: ${target.relative}`);
  atomicWrite(target.absolute, createDraftPlan(flag(args, "--title")));
  stage(rootPath, target.relative);
}

function setSpec(args: readonly string[]): void {
  const plan = args[1];
  if (plan === undefined) throw new Error("plan path is required");
  const rootPath = root();
  const target = addressedPath(rootPath, plan);
  const spec = readFileSync(resolve(rootPath, flag(args, "--from")), "utf8");
  const changed = replaceDraftSpec(readFileSync(target.absolute, "utf8"), spec);
  atomicWrite(target.absolute, changed.body);
  stage(rootPath, target.relative);
}

function verify(args: readonly string[]): void {
  const plan = args[1];
  if (plan === undefined) throw new Error("plan path is required");
  const body = readFileSync(resolve(root(), plan), "utf8");
  const violations = protocolLockViolations(body);
  if (violations.length > 0) throw new Error(violations.join("; "));
  console.log("planctl: locks verified");
}

function runEngine(args: readonly string[], engineCommand: string): number {
  const plan = args[1];
  if (plan === undefined) throw new Error("plan path is required");
  const result = spawnSync("bun", [join(import.meta.dir, "plan-update.ts"), plan, engineCommand, ...args.slice(2)], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  return result.status ?? 1;
}

function run(args: readonly string[]): number {
  const command = args[0];
  if (command === undefined || command === "--help" || command === "-h") {
    console.log(GENERAL_HELP);
    return 0;
  }
  if (args.includes("--help") || args.includes("-h")) {
    const help = COMMAND_HELP[command];
    if (help === undefined) throw new Error(`unknown command ${command}`);
    console.log(help);
    return 0;
  }
  if (command === "init") {
    init(args);
    return 0;
  }
  if (command === "set-spec") {
    setSpec(args);
    return 0;
  }
  if (command === "verify") {
    verify(args);
    return 0;
  }
  if (command === "start-task") {
    startTask(args);
    return 0;
  }
  if (command === "complete-task") return completeTask(args);
  const engineCommand = ENGINE_COMMANDS[command];
  if (engineCommand === undefined) throw new Error(`unknown command ${command}; run planctl --help`);
  return runEngine(args, engineCommand);
}

try {
  process.exitCode = run(process.argv.slice(2));
} catch (error: unknown) {
  console.error(`planctl: ${message(error)}`);
  process.exitCode = 1;
}
