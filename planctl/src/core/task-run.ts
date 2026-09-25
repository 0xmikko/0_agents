import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { dirname, join } from "node:path";

export interface TaskRunV1 {
  readonly version: 1;
  readonly plan: string;
  readonly deliveryId: string;
  readonly stageId: string;
  readonly taskId: string;
  readonly startedAt: string;
  readonly baseHead: string;
}

export interface OwnerWaitMarker {
  readonly reason: string;
  readonly startedAt: string;
}

/** The question form: what this is about, the options with their consequences, the recommendation, the form of the answer. */
export interface OwnerQuestion {
  readonly context: string;
  readonly options: readonly { readonly label: string; readonly consequence: string }[];
  readonly recommendation: string;
  readonly answerForm: string;
}

export interface OwnerWaitReceipt extends OwnerWaitMarker, OwnerQuestion {
  readonly version: 1;
  readonly plan: string;
  readonly taskId: string;
}

export interface OwnerWaitInput extends OwnerQuestion {
  readonly plan: string;
  readonly taskId: string;
  readonly reason: string;
  readonly startedAt: string;
}

export interface TaskRunV2 extends Omit<TaskRunV1, "version"> {
  readonly version: 2;
  readonly machineId: string;
  readonly agentId: string;
  readonly repositoryId: string;
  readonly worktree: string;
  readonly branch: string;
  readonly planRevision: string;
  readonly ownerWait: OwnerWaitMarker | null;
  readonly accumulatedOwnerWaitSeconds: number;
  readonly lastAccountedOwnerWaitStartedAt: string | null;
}

/** Who observes a run: the machine, the agent session, the repository and the plan revision. */
export interface TaskRunIdentity {
  readonly machineId: string;
  readonly agentId: string;
  readonly repositoryId: string;
  readonly planRevision: string;
}

/** The record a local clone writes: its worktree, a checkpoint, and an
 * observer identity only when observer configuration exists. */
export interface TaskRunV3 extends Omit<TaskRunV1, "version"> {
  readonly version: 3;
  readonly worktree: string;
  readonly branch: string;
  readonly checkpoint: string | null;
  readonly identity: TaskRunIdentity | null;
  readonly ownerWait: OwnerWaitMarker | null;
  readonly accumulatedOwnerWaitSeconds: number;
  readonly lastAccountedOwnerWaitStartedAt: string | null;
}

export type TaskRun = TaskRunV1 | TaskRunV2 | TaskRunV3;

export interface TaskRunCorrelation {
  readonly machineId: string;
  readonly agentId: string;
  readonly repositoryId: string;
  readonly worktree: string;
  readonly branch: string;
  readonly planRevision: string;
}

function record(value: unknown, name: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Readonly<Record<string, unknown>>;
}

function text(value: unknown, name: string, pattern?: RegExp): string {
  if (typeof value !== "string" || value === "" || (pattern !== undefined && !pattern.test(value))) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function timestamp(value: unknown, name: string): string {
  const parsed = text(value, name);
  if (!Number.isFinite(Date.parse(parsed))) throw new Error(`${name} is invalid`);
  return parsed;
}

function nonNegativeSeconds(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return value;
}

function baseFields(value: Readonly<Record<string, unknown>>): Omit<TaskRunV1, "version"> {
  return {
    plan: text(value.plan, "TaskRun plan", /^docs\/plans\/[a-z0-9][a-z0-9-]*\.md$/),
    deliveryId: text(value.deliveryId, "TaskRun deliveryId", /^D[1-9]\d*$/),
    stageId: text(value.stageId, "TaskRun stageId", /^D[1-9]\d*-S[1-9]\d*$/),
    taskId: text(value.taskId, "TaskRun taskId", /^[A-Z][A-Z0-9_-]*$/),
    startedAt: timestamp(value.startedAt, "TaskRun startedAt"),
    baseHead: text(value.baseHead, "TaskRun baseHead", /^[0-9a-f]{40}$/),
  };
}

function decodeOwnerWaitMarker(value: unknown): OwnerWaitMarker | null {
  if (value === null) return null;
  const wait = record(value, "TaskRunV2 ownerWait");
  const reason = text(wait.reason, "TaskRunV2 ownerWait reason");
  if (reason.includes("\n") || reason.length > 240) throw new Error("TaskRunV2 ownerWait reason must be one safe line");
  return { reason, startedAt: timestamp(wait.startedAt, "TaskRunV2 ownerWait startedAt") };
}

/**
 * @tested-by: tst_unit_planctl_task_run_001
 * @invariant: CTL-011 legacy receipts remain locally decodable without invented distributed identity.
 */
function decodeIdentity(value: unknown): TaskRunIdentity {
  const identity = record(value, "TaskRunV3 identity");
  return {
    machineId: text(identity.machineId, "TaskRunV3 machineId", /^[a-z0-9][a-z0-9-]{0,62}$/),
    agentId: text(identity.agentId, "TaskRunV3 agentId", /^(codex|claude):[^\s:][^\s]*$/),
    repositoryId: text(identity.repositoryId, "TaskRunV3 repositoryId"),
    planRevision: text(identity.planRevision, "TaskRunV3 planRevision", /^[0-9a-f]{64}$/),
  };
}

function decodeWaitAccounting(value: Readonly<Record<string, unknown>>, name: string): {
  readonly ownerWait: OwnerWaitMarker | null;
  readonly accumulatedOwnerWaitSeconds: number;
  readonly lastAccountedOwnerWaitStartedAt: string | null;
} {
  return {
    ownerWait: decodeOwnerWaitMarker(value.ownerWait),
    accumulatedOwnerWaitSeconds: nonNegativeSeconds(value.accumulatedOwnerWaitSeconds, `${name} accumulatedOwnerWaitSeconds`),
    lastAccountedOwnerWaitStartedAt: value.lastAccountedOwnerWaitStartedAt === null
      ? null
      : timestamp(value.lastAccountedOwnerWaitStartedAt, `${name} lastAccountedOwnerWaitStartedAt`),
  };
}

/** @tested-by: tst_unit_planctl_task_run_next */
function decodeTaskRunV3(value: Readonly<Record<string, unknown>>, base: Omit<TaskRunV1, "version">): TaskRunV3 {
  const worktree = text(value.worktree, "TaskRunV3 worktree");
  if (!isAbsolute(worktree)) throw new Error("TaskRunV3 worktree must be absolute");
  if (value.checkpoint !== null && typeof value.checkpoint !== "string") throw new Error("TaskRunV3 checkpoint must be a string or null");
  if (typeof value.checkpoint === "string" && /[\r\n]/.test(value.checkpoint)) throw new Error("TaskRunV3 checkpoint must be one line");
  const accounting = decodeWaitAccounting(value, "TaskRunV3");
  const result: TaskRunV3 = {
    version: 3,
    ...base,
    worktree,
    branch: text(value.branch, "TaskRunV3 branch"),
    checkpoint: value.checkpoint,
    identity: value.identity === null ? null : decodeIdentity(value.identity),
    ...accounting,
  };
  if (accounting.lastAccountedOwnerWaitStartedAt !== null
    && Date.parse(accounting.lastAccountedOwnerWaitStartedAt) < Date.parse(result.startedAt)) {
    throw new Error("TaskRunV3 accounted owner wait predates Task start");
  }
  return result;
}

export function decodeTaskRun(input: unknown): TaskRun {
  const value = record(input, "TaskRun");
  const base = baseFields(value);
  if (value.version === 1) return { version: 1, ...base };
  if (value.version === 3) return decodeTaskRunV3(value, base);
  if (value.version !== 2) throw new Error("TaskRun version is unsupported");
  const worktree = text(value.worktree, "TaskRunV2 worktree");
  if (!isAbsolute(worktree)) throw new Error("TaskRunV2 worktree must be absolute");
  const lastAccountedOwnerWaitStartedAt = value.lastAccountedOwnerWaitStartedAt === null
    ? null
    : timestamp(
      value.lastAccountedOwnerWaitStartedAt,
      "TaskRunV2 lastAccountedOwnerWaitStartedAt",
    );
  const result: TaskRunV2 = {
    version: 2,
    ...base,
    machineId: text(value.machineId, "TaskRunV2 machineId", /^[a-z0-9][a-z0-9-]{0,62}$/),
    agentId: text(value.agentId, "TaskRunV2 agentId", /^(codex|claude):[^\s:][^\s]*$/),
    repositoryId: text(value.repositoryId, "TaskRunV2 repositoryId"),
    worktree,
    branch: text(value.branch, "TaskRunV2 branch"),
    planRevision: text(value.planRevision, "TaskRunV2 planRevision", /^[0-9a-f]{64}$/),
    ownerWait: decodeOwnerWaitMarker(value.ownerWait),
    accumulatedOwnerWaitSeconds: nonNegativeSeconds(
      value.accumulatedOwnerWaitSeconds,
      "TaskRunV2 accumulatedOwnerWaitSeconds",
    ),
    lastAccountedOwnerWaitStartedAt,
  };
  if (lastAccountedOwnerWaitStartedAt !== null
    && Date.parse(lastAccountedOwnerWaitStartedAt) < Date.parse(result.startedAt)) {
    throw new Error("TaskRunV2 accounted owner wait predates Task start");
  }
  return result;
}

/**
 * @tested-by: tst_svc_planctld_active_pause_001
 * @invariant: CTL-005 a structured owner wait is accumulated once and never becomes active Task time.
 */
export function accountOwnerWait(
  run: TaskRun,
  markerInput: OwnerWaitMarker,
  resumedAtInput: string,
): TaskRun {
  if (run.version === 1) return run;
  const marker = decodeOwnerWaitMarker(markerInput);
  if (marker === null) throw new Error("owner wait marker is missing");
  const resumedAt = timestamp(resumedAtInput, "owner wait resumedAt");
  if (run.lastAccountedOwnerWaitStartedAt === marker.startedAt) return run;
  if (Date.parse(marker.startedAt) < Date.parse(run.startedAt)) {
    throw new Error("owner wait predates Task start");
  }
  if (run.lastAccountedOwnerWaitStartedAt !== null
    && Date.parse(marker.startedAt) <= Date.parse(run.lastAccountedOwnerWaitStartedAt)) {
    throw new Error("owner wait marker is older than the last accounted wait");
  }
  const durationSeconds = (Date.parse(resumedAt) - Date.parse(marker.startedAt)) / 1_000;
  if (durationSeconds < 0) throw new Error("owner wait resume predates its marker");
  return decodeTaskRun({
    ...run,
    accumulatedOwnerWaitSeconds: run.accumulatedOwnerWaitSeconds + durationSeconds,
    lastAccountedOwnerWaitStartedAt: marker.startedAt,
  });
}

/** The observer identity a record carries, whatever its version; a local V3 record has none. */
export function taskRunIdentity(run: TaskRun): TaskRunIdentity | null {
  if (run.version === 1) return null;
  if (run.version === 2) {
    return { machineId: run.machineId, agentId: run.agentId, repositoryId: run.repositoryId, planRevision: run.planRevision };
  }
  return run.identity;
}

/** The worktree a record belongs to; a legacy V1 record names none. */
export function taskRunWorktree(run: TaskRun): string | null {
  return run.version === 1 ? null : run.worktree;
}

export function taskRunCorrelation(run: TaskRun): TaskRunCorrelation | null {
  const identity = taskRunIdentity(run);
  if (identity === null || run.version === 1) return null;
  return { ...identity, worktree: run.worktree, branch: run.branch };
}

function assertExactKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  name: string,
): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) throw new Error(`${name} has unknown key(s): ${unexpected.join(", ")}`);
}

const PLAN_PATH = /^docs\/plans\/[a-z0-9][a-z0-9-]*\.md$/;
const TASK_ID = /^[A-Z][A-Z0-9_-]*$/;

function decodeOwnerQuestion(value: Readonly<Record<string, unknown>>): OwnerQuestion {
  if (!Array.isArray(value.options) || value.options.length === 0) throw new Error("owner question needs at least one option");
  return {
    context: text(value.context, "owner question context"),
    options: value.options.map((entry) => {
      const option = record(entry, "owner question option");
      return { label: text(option.label, "owner question option label"), consequence: text(option.consequence, "owner question option consequence") };
    }),
    recommendation: text(value.recommendation, "owner question recommendation"),
    answerForm: text(value.answerForm, "owner question answerForm"),
  };
}

export function decodeOwnerWait(input: unknown): OwnerWaitReceipt {
  const value = record(input, "owner wait receipt");
  assertExactKeys(value, ["version", "plan", "taskId", "reason", "startedAt", "context", "options", "recommendation", "answerForm"], "owner wait receipt");
  if (value.version !== 1) throw new Error("owner wait receipt version is unsupported");
  const marker = decodeOwnerWaitMarker({ reason: value.reason, startedAt: value.startedAt });
  if (marker === null) throw new Error("owner wait receipt marker is missing");
  return {
    version: 1,
    plan: text(value.plan, "owner wait plan", PLAN_PATH),
    taskId: text(value.taskId, "owner wait taskId", TASK_ID),
    ...marker,
    ...decodeOwnerQuestion(value),
  };
}

export function ownerWaitPath(gitCommonDir: string, plan: string, taskId: string): string {
  if (!isAbsolute(gitCommonDir)) throw new Error("Git common directory must be absolute");
  const planKey = createHash("sha256").update(text(plan, "owner wait plan", PLAN_PATH)).digest("hex").slice(0, 12);
  return join(gitCommonDir, "planctl", "owner-waits", `${planKey}-${text(taskId, "owner wait taskId", TASK_ID)}.json`);
}

/**
 * @tested-by: tst_cli_planctl_owner_wait_001
 * @invariant: CTL-004 awaiting_owner exists only as a validated structured receipt, never transcript inference.
 */
export function markOwnerWait(path: string, input: OwnerWaitInput): OwnerWaitReceipt {
  if (!isAbsolute(path)) throw new Error("owner wait path must be absolute");
  const receipt = decodeOwnerWait({ version: 1, ...input });
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true });
  const temporary = mkdtempSync(join(parent, ".owner-wait-"));
  const candidate = join(temporary, "receipt.json");
  try {
    writeFileSync(candidate, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    renameSync(candidate, path);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  return receipt;
}

export function readOwnerWait(path: string): OwnerWaitReceipt | null {
  if (!isAbsolute(path)) throw new Error("owner wait path must be absolute");
  if (!existsSync(path)) return null;
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return decodeOwnerWait(parsed);
}

export function clearOwnerWait(path: string): boolean {
  if (!isAbsolute(path)) throw new Error("owner wait path must be absolute");
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}
