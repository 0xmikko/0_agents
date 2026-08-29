import type { PlanProgressSnapshot } from "./plan-progress";

export const SNAPSHOT_PROTOCOL_VERSION = 1 as const;

export type AgentProvider = "codex" | "claude";
export type AgentState = "working" | "awaiting_owner" | "stale" | "unassigned" | "finished";

export interface MachineHeartbeat {
  readonly protocolVersion: typeof SNAPSHOT_PROTOCOL_VERSION;
  readonly machineId: string;
  readonly sequence: number;
  readonly observedAt: string;
  readonly snapshotHash: string;
}

export interface AgentSnapshot {
  readonly agentId: string;
  readonly provider: AgentProvider;
  readonly state: AgentState;
  readonly repositoryId: string | null;
  readonly worktree: string | null;
  readonly branch: string | null;
  readonly planId: string | null;
  readonly planRevision: string | null;
  readonly taskId: string | null;
  readonly lastActivityAt: string;
  readonly idleSeconds: number;
  readonly elapsedActiveMinutes: number | null;
  readonly ownerWaitReason: string | null;
}

export interface ReportedPlanProgress {
  readonly planId: string;
  readonly planRevision: string;
  readonly goal: string;
  readonly progress: PlanProgressSnapshot;
}

export interface MachineSnapshot {
  readonly heartbeat: MachineHeartbeat;
  readonly agents: readonly AgentSnapshot[];
  readonly plans: readonly ReportedPlanProgress[];
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

function nullableText(value: unknown, name: string): string | null {
  return value === null ? null : text(value, name);
}

function nonNegative(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${name} is invalid`);
  return value;
}

function percentage(value: unknown, name: string): number {
  const number = nonNegative(value, name);
  if (number > 100) throw new Error(`${name} exceeds 100`);
  return number;
}

function count(input: unknown, name: string): { readonly completed: number; readonly total: number } {
  const value = record(input, name);
  const completed = nonNegative(value.completed, `${name} completed`);
  const total = nonNegative(value.total, `${name} total`);
  if (!Number.isSafeInteger(completed) || !Number.isSafeInteger(total) || completed > total) {
    throw new Error(`${name} is inconsistent`);
  }
  return { completed, total };
}

function amount(
  input: unknown,
  name: string,
): { readonly completed: number; readonly remaining: number; readonly total: number } {
  const value = record(input, name);
  const completed = nonNegative(value.completed, `${name} completed`);
  const remaining = nonNegative(value.remaining, `${name} remaining`);
  const total = nonNegative(value.total, `${name} total`);
  if (Math.abs(completed + remaining - total) > Number.EPSILON) throw new Error(`${name} is inconsistent`);
  return { completed, remaining, total };
}

function stringArray(input: unknown, name: string): readonly string[] {
  if (!Array.isArray(input) || !input.every((entry) => typeof entry === "string")) {
    throw new Error(`${name} must be a string array`);
  }
  return input;
}

function progressSnapshot(input: unknown): PlanProgressSnapshot {
  const value = record(input, "plan progress");
  if (!Array.isArray(value.stages)) throw new Error("plan progress stages must be an array");
  return {
    deliveryId: text(value.deliveryId, "plan progress deliveryId", /^D[1-9]\d*$/),
    tasks: count(value.tasks, "plan progress tasks"),
    activeMinutes: amount(value.activeMinutes, "plan progress activeMinutes"),
    credits: amount(value.credits, "plan progress credits"),
    completionPercent: percentage(value.completionPercent, "plan progress completionPercent"),
    stages: value.stages.map((entry) => {
      const stage = record(entry, "Stage progress");
      return {
        id: text(stage.id, "Stage progress id", /^D[1-9]\d*-S[1-9]\d*$/),
        depends: stringArray(stage.depends, "Stage progress depends"),
        parallelWith: stringArray(stage.parallelWith, "Stage progress parallelWith"),
        tasks: count(stage.tasks, "Stage progress tasks"),
        activeMinutes: amount(stage.activeMinutes, "Stage progress activeMinutes"),
        credits: amount(stage.credits, "Stage progress credits"),
        completionPercent: percentage(stage.completionPercent, "Stage progress completionPercent"),
      };
    }),
  };
}

function timestamp(value: unknown, name: string): string {
  const parsed = text(value, name);
  if (!Number.isFinite(Date.parse(parsed))) throw new Error(`${name} is invalid`);
  return parsed;
}

function heartbeat(input: unknown): MachineHeartbeat {
  const value = record(input, "heartbeat");
  if (value.protocolVersion !== SNAPSHOT_PROTOCOL_VERSION) throw new Error("heartbeat protocolVersion is unsupported");
  const sequence = nonNegative(value.sequence, "heartbeat sequence");
  if (!Number.isSafeInteger(sequence)) throw new Error("heartbeat sequence must be an integer");
  return {
    protocolVersion: SNAPSHOT_PROTOCOL_VERSION,
    machineId: text(value.machineId, "heartbeat machineId", /^[a-z0-9][a-z0-9-]{0,62}$/),
    sequence,
    observedAt: timestamp(value.observedAt, "heartbeat observedAt"),
    snapshotHash: text(value.snapshotHash, "heartbeat snapshotHash", /^[0-9a-f]{64}$/),
  };
}

function agent(input: unknown): AgentSnapshot {
  const value = record(input, "agent snapshot");
  const provider = value.provider;
  if (provider !== "codex" && provider !== "claude") throw new Error("agent provider is invalid");
  const state = value.state;
  if (state !== "working" && state !== "awaiting_owner" && state !== "stale"
    && state !== "unassigned" && state !== "finished") throw new Error("agent state is invalid");
  const elapsed = value.elapsedActiveMinutes === null
    ? null
    : nonNegative(value.elapsedActiveMinutes, "agent elapsedActiveMinutes");
  const ownerWaitReason = nullableText(value.ownerWaitReason, "agent ownerWaitReason");
  if (ownerWaitReason?.includes("\n") === true || (ownerWaitReason?.length ?? 0) > 240) {
    throw new Error("agent ownerWaitReason must be one safe line");
  }
  return {
    agentId: text(value.agentId, "agent agentId", /^(codex|claude):[^\s:][^\s]*$/),
    provider,
    state,
    repositoryId: nullableText(value.repositoryId, "agent repositoryId"),
    worktree: nullableText(value.worktree, "agent worktree"),
    branch: nullableText(value.branch, "agent branch"),
    planId: nullableText(value.planId, "agent planId"),
    planRevision: value.planRevision === null
      ? null
      : text(value.planRevision, "agent planRevision", /^[0-9a-f]{64}$/),
    taskId: nullableText(value.taskId, "agent taskId"),
    lastActivityAt: timestamp(value.lastActivityAt, "agent lastActivityAt"),
    idleSeconds: nonNegative(value.idleSeconds, "agent idleSeconds"),
    elapsedActiveMinutes: elapsed,
    ownerWaitReason,
  };
}

/**
 * @tested-by: tst_unit_planctl_task_run_001
 * @invariant: CTL-003 every wire snapshot declares protocol version, stable machine identity and monotonic sequence.
 * @invariant: CTL-004 agent activity, owner wait, stale, unassigned and finished states remain explicit evidence.
 * @invariant: CTL-010 plan revisions are mandatory on reported progress and never silently combined.
 */
export function decodeMachineSnapshot(input: unknown): MachineSnapshot {
  const value = record(input, "machine snapshot");
  if (!Array.isArray(value.agents)) throw new Error("machine snapshot agents must be an array");
  if (!Array.isArray(value.plans)) throw new Error("machine snapshot plans must be an array");
  return {
    heartbeat: heartbeat(value.heartbeat),
    agents: value.agents.map(agent),
    plans: value.plans.map((entry) => {
      const plan = record(entry, "reported plan progress");
      return {
        planId: text(plan.planId, "reported planId"),
        planRevision: text(plan.planRevision, "reported planRevision", /^[0-9a-f]{64}$/),
        goal: text(plan.goal, "reported plan goal"),
        progress: progressSnapshot(plan.progress),
      };
    }),
  };
}
