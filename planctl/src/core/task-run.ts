import { isAbsolute } from "node:path";

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

function ownerWait(value: unknown): OwnerWaitMarker | null {
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
    ownerWait: ownerWait(value.ownerWait),
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
