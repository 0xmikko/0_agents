import { isAbsolute, relative } from "node:path";

import type { AgentSnapshot, AgentProvider } from "../../core/snapshot-protocol";
import type { TaskRun } from "../../core/task-run";

export interface SessionActivity {
  readonly agentId: string;
  readonly provider: AgentProvider;
  readonly sessionId: string;
  readonly cwd: string;
  readonly sourcePath: string;
  readonly lastActivityAt: string;
}

export interface SessionFileCursor {
  readonly offset: number;
  readonly sessionId: string | null;
  readonly cwd: string | null;
  readonly lastActivityAt: string | null;
}

export interface SessionSourceIssue {
  readonly sourcePath: string;
  readonly code: "file_truncated" | "malformed_jsonl" | "missing_metadata" | "truncated_tail";
  readonly offset: number;
  readonly message: string;
}

export interface SessionFileScan {
  readonly activity: SessionActivity | null;
  readonly cursor: SessionFileCursor;
  readonly issues: readonly SessionSourceIssue[];
}

export interface AgentProcessIdentity {
  readonly pid: number;
  readonly provider: AgentProvider;
  readonly sessionId: string;
  readonly cwd: string;
}

export interface GitWorktreeIdentity {
  readonly path: string;
  readonly repositoryId: string;
  readonly branch: string;
}

export interface StructuredOwnerWait {
  readonly plan: string;
  readonly taskId: string;
  readonly reason: string;
  readonly startedAt: string;
  readonly agentId?: string;
}

export interface SessionClassificationInput {
  readonly activities: readonly SessionActivity[];
  readonly processes: readonly AgentProcessIdentity[];
  readonly worktrees: readonly GitWorktreeIdentity[];
  readonly taskRuns: readonly TaskRun[];
  readonly ownerWaits?: readonly StructuredOwnerWait[];
  readonly now: Date;
  readonly staleAfterSeconds: number;
}

export function emptySessionFileCursor(offset = 0): SessionFileCursor {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("session cursor offset must be non-negative");
  return { offset, sessionId: null, cwd: null, lastActivityAt: null };
}

export function sessionCursor(value: SessionFileCursor | number): SessionFileCursor {
  return typeof value === "number" ? emptySessionFileCursor(value) : value;
}

function contains(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return fromRoot === "" || (fromRoot !== ".." && !fromRoot.startsWith("../") && !isAbsolute(fromRoot));
}

function worktreeFor(cwd: string, worktrees: readonly GitWorktreeIdentity[]): GitWorktreeIdentity | null {
  return [...worktrees]
    .filter((worktree) => contains(worktree.path, cwd))
    .sort((left, right) => right.path.length - left.path.length)[0] ?? null;
}

function timestampMs(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} is invalid`);
  return parsed;
}

/**
 * @tested-by: tst_svc_planctld_sessions_001
 * @invariant: stale is exactly idleSeconds >= staleAfterSeconds and owner attention is accepted only from a structured TaskRun or owner-wait receipt.
 * @invariant: uninstrumented sessions remain visible but contribute no invented plan or task correlation.
 */
export function classifySessionActivities(input: SessionClassificationInput): readonly AgentSnapshot[] {
  if (!Number.isSafeInteger(input.staleAfterSeconds) || input.staleAfterSeconds <= 0) {
    throw new Error("staleAfterSeconds must be a positive integer");
  }
  const nowMs = input.now.getTime();
  if (!Number.isFinite(nowMs)) throw new Error("classification time is invalid");
  const liveAgents = new Set(input.processes.map((process) => `${process.provider}:${process.sessionId}`));
  const latestActivities = new Map<string, SessionActivity>();
  for (const activity of input.activities) {
    const existing = latestActivities.get(activity.agentId);
    if (existing === undefined
      || timestampMs(activity.lastActivityAt, "session lastActivityAt")
        > timestampMs(existing.lastActivityAt, "session lastActivityAt")) latestActivities.set(activity.agentId, activity);
  }
  return [...latestActivities.values()]
    .sort((left, right) => left.agentId.localeCompare(right.agentId))
    .map((activity) => {
      const lastActivityMs = timestampMs(activity.lastActivityAt, "session lastActivityAt");
      const idleSeconds = Math.max(0, Math.floor((nowMs - lastActivityMs) / 1_000));
      const run = input.taskRuns
        .filter((candidate) => candidate.version === 2 && candidate.agentId === activity.agentId)
        .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))[0];
      const discoveredWorktree = worktreeFor(activity.cwd, input.worktrees);
      const correlated = run?.version === 2 && contains(run.worktree, activity.cwd) ? run : null;
      const externalOwnerWait = correlated === null
        ? null
        : input.ownerWaits?.find((wait) => wait.plan === correlated.plan && wait.taskId === correlated.taskId
          && (wait.agentId === undefined || wait.agentId === activity.agentId)) ?? null;
      const ownerWait = externalOwnerWait ?? correlated?.ownerWait ?? null;
      const ownerWaitReason = ownerWait?.reason ?? null;
      const ownerWaitStartedAt = ownerWait?.startedAt ?? null;
      const stale = idleSeconds >= input.staleAfterSeconds;
      const state = ownerWaitReason !== null
        ? "awaiting_owner"
        : stale
          ? "stale"
          : correlated === null
            ? "unassigned"
            : "working";
      const processLive = liveAgents.has(activity.agentId);
      const elapsedActiveMinutes = correlated === null
        ? null
        : Math.max(0, (Math.min(nowMs, lastActivityMs) - timestampMs(correlated.startedAt, "TaskRun startedAt")) / 60_000);
      return {
        agentId: activity.agentId,
        provider: activity.provider,
        state,
        repositoryId: correlated?.repositoryId ?? discoveredWorktree?.repositoryId ?? null,
        worktree: correlated?.worktree ?? discoveredWorktree?.path ?? (processLive ? activity.cwd : null),
        branch: correlated?.branch ?? discoveredWorktree?.branch ?? null,
        planId: correlated === null ? null : `${correlated.repositoryId}:${correlated.plan}`,
        planRevision: correlated?.planRevision ?? null,
        taskId: correlated?.taskId ?? null,
        lastActivityAt: new Date(lastActivityMs).toISOString(),
        idleSeconds,
        elapsedActiveMinutes,
        ownerWaitReason,
        ownerWaitStartedAt,
      } satisfies AgentSnapshot;
    });
}
