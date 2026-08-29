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

export interface OwnerWaitReceipt extends OwnerWaitMarker {
  readonly version: 1;
  readonly plan: string;
  readonly taskId: string;
}

export interface OwnerWaitInput {
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
}

export type TaskRun = TaskRunV1 | TaskRunV2;

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
export function decodeTaskRun(input: unknown): TaskRun {
  const value = record(input, "TaskRun");
  const base = baseFields(value);
  if (value.version === 1) return { version: 1, ...base };
  if (value.version !== 2) throw new Error("TaskRun version is unsupported");
  const worktree = text(value.worktree, "TaskRunV2 worktree");
  if (!isAbsolute(worktree)) throw new Error("TaskRunV2 worktree must be absolute");
  return {
    version: 2,
    ...base,
    machineId: text(value.machineId, "TaskRunV2 machineId", /^[a-z0-9][a-z0-9-]{0,62}$/),
    agentId: text(value.agentId, "TaskRunV2 agentId", /^(codex|claude):[^\s:][^\s]*$/),
    repositoryId: text(value.repositoryId, "TaskRunV2 repositoryId"),
    worktree,
    branch: text(value.branch, "TaskRunV2 branch"),
    planRevision: text(value.planRevision, "TaskRunV2 planRevision", /^[0-9a-f]{64}$/),
    ownerWait: decodeOwnerWaitMarker(value.ownerWait),
  };
}

export function taskRunCorrelation(run: TaskRun): TaskRunCorrelation | null {
  if (run.version === 1) return null;
  return {
    machineId: run.machineId,
    agentId: run.agentId,
    repositoryId: run.repositoryId,
    worktree: run.worktree,
    branch: run.branch,
    planRevision: run.planRevision,
  };
}

function assertExactKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  name: string,
): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) throw new Error(`${name} has unknown key(s): ${unexpected.join(", ")}`);
}

export function decodeOwnerWait(input: unknown): OwnerWaitReceipt {
  const value = record(input, "owner wait receipt");
  assertExactKeys(value, ["version", "plan", "taskId", "reason", "startedAt"], "owner wait receipt");
  if (value.version !== 1) throw new Error("owner wait receipt version is unsupported");
  const marker = decodeOwnerWaitMarker({ reason: value.reason, startedAt: value.startedAt });
  if (marker === null) throw new Error("owner wait receipt marker is missing");
  return {
    version: 1,
    plan: text(value.plan, "owner wait plan", /^docs\/plans\/[a-z0-9][a-z0-9-]*\.md$/),
    taskId: text(value.taskId, "owner wait taskId", /^[A-Z][A-Z0-9_-]*$/),
    ...marker,
  };
}

export function ownerWaitPath(gitCommonDir: string, plan: string, taskId: string): string {
  if (!isAbsolute(gitCommonDir)) throw new Error("Git common directory must be absolute");
  const validated = decodeOwnerWait({
    version: 1,
    plan,
    taskId,
    reason: "path-validation",
    startedAt: "1970-01-01T00:00:00.000Z",
  });
  const planKey = createHash("sha256").update(validated.plan).digest("hex").slice(0, 12);
  return join(gitCommonDir, "planctl", "owner-waits", `${planKey}-${validated.taskId}.json`);
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
