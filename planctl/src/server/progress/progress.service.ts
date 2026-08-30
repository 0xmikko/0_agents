import { Inject, Injectable } from "@nestjs/common";

import { SERVER_STORE_OPTIONS, ServerStore } from "../persistence/server-store";

import type { AgentState } from "../../core/snapshot-protocol";
import type { PlanProgressSnapshot, ProgressAmount, TaskCount } from "../../core/plan-progress";
import type {
  CalibrationSampleRecord,
  CanonicalPlanRecord,
  ServerStoreOptions,
  StoredAgentObservation,
} from "../persistence/server-store";

export type ProgressAgentState = AgentState | "plan_drift";

export interface ProgressAgentView {
  readonly machineId: string;
  readonly machineState: "online" | "offline";
  readonly agentId: string;
  readonly state: ProgressAgentState;
  readonly taskId: string | null;
  readonly planRevision: string | null;
  readonly lastActivityAt: string;
  readonly idleSeconds: number;
  readonly elapsedActiveMinutes: number | null;
  readonly ownerWaitReason: string | null;
  readonly ownerWaitStartedAt: string | null;
}

export interface PlanAttentionView {
  readonly ownerWait: number;
  readonly stale: number;
  readonly unassigned: number;
  readonly machineOffline: number;
  readonly planDrift: number;
}

export interface PlanProgressView {
  readonly planId: string;
  readonly planRevision: string;
  readonly goal: string;
  readonly updatedAt: string;
  readonly completionPercent: number;
  readonly tasks: TaskCount;
  readonly activeMinutes: ProgressAmount;
  readonly credits: ProgressAmount;
  readonly activeAgents: readonly ProgressAgentView[];
  readonly attention: PlanAttentionView;
  readonly remainingActiveMinutes: number;
  readonly criticalPathMinutes: number;
  readonly calibratedCriticalPathMinutes: number;
  readonly estimatedDeliveryAt: string | null;
  readonly calibration: {
    readonly factor: number;
    readonly completedTaskSamples: number;
    readonly confidence: "low" | "medium" | "high";
  };
}

export interface PortfolioProgressView {
  readonly generatedAt: string;
  readonly plans: readonly PlanProgressView[];
}

function median(values: readonly number[]): number {
  const ordered = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const upper = ordered[middle];
  if (upper === undefined) throw new Error("calibration median requires a sample");
  if (ordered.length % 2 === 1) return upper;
  const lower = ordered[middle - 1];
  if (lower === undefined) throw new Error("calibration median lower sample is missing");
  return (lower + upper) / 2;
}

function calibration(samples: readonly CalibrationSampleRecord[]): PlanProgressView["calibration"] {
  const factor = samples.length < 3
    ? 1
    : Math.min(3, Math.max(0.5, median(samples.map((sample) =>
      sample.actualActiveMinutes / sample.predictedActiveMinutes
    ))));
  return {
    factor,
    completedTaskSamples: samples.length,
    confidence: samples.length < 3 ? "low" : samples.length < 10 ? "medium" : "high",
  };
}

function dependencyCriticalPath(
  progress: PlanProgressSnapshot,
  stageWeights: ReadonlyMap<string, number>,
): number {
  const stages = new Map(progress.stages.map((stage) => [stage.id, stage]));
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const endingAt = (stageId: string): number => {
    const known = memo.get(stageId);
    if (known !== undefined) return known;
    if (visiting.has(stageId)) throw new Error(`progress Stage graph contains a cycle at ${stageId}`);
    const stage = stages.get(stageId);
    if (stage === undefined) throw new Error(`progress names unknown Stage ${stageId}`);
    visiting.add(stageId);
    const dependencyPath = stage.depends.length === 0
      ? 0
      : Math.max(...stage.depends.map((dependency) => endingAt(dependency)));
    visiting.delete(stageId);
    const result = dependencyPath + (stageWeights.get(stageId) ?? 0);
    memo.set(stageId, result);
    return result;
  };
  return Math.max(...progress.stages.map((stage) => endingAt(stage.id)));
}

function activeElapsedByTask(
  agents: readonly StoredAgentObservation[],
): ReadonlyMap<string, number> {
  const elapsedByTask = new Map<string, number>();
  for (const agent of agents) {
    if (agent.taskId === null || agent.elapsedActiveMinutes === null) continue;
    elapsedByTask.set(
      agent.taskId,
      Math.max(elapsedByTask.get(agent.taskId) ?? 0, agent.elapsedActiveMinutes),
    );
  }
  return elapsedByTask;
}

function stageForecastWeights(
  progress: PlanProgressSnapshot,
  calibrationFactor: number,
  elapsedByTask: ReadonlyMap<string, number>,
): { readonly raw: ReadonlyMap<string, number>; readonly calibrated: ReadonlyMap<string, number> } {
  const raw = new Map<string, number>();
  const calibrated = new Map<string, number>();
  for (const stage of progress.stages) {
    let rawMinutes = 0;
    let calibratedMinutes = 0;
    for (const task of stage.remainingTasks) {
      const elapsed = elapsedByTask.get(task.taskId) ?? 0;
      rawMinutes += Math.max(0, task.predictedActiveMinutes - elapsed);
      calibratedMinutes += Math.max(0, task.predictedActiveMinutes * calibrationFactor - elapsed);
    }
    raw.set(stage.id, rawMinutes);
    calibrated.set(stage.id, calibratedMinutes);
  }
  return { raw, calibrated };
}

function statePriority(agent: ProgressAgentView): number {
  if (agent.state === "awaiting_owner") return 0;
  if (agent.state === "stale") return 1;
  if (agent.state === "plan_drift") return 2;
  if (agent.state === "unassigned") return 3;
  if (agent.machineState === "offline") return 4;
  if (agent.state === "working") return 5;
  return 6;
}

function attentionScore(attention: PlanAttentionView): number {
  return attention.ownerWait * 100_000
    + attention.planDrift * 10_000
    + attention.machineOffline * 1_000
    + attention.stale * 100
    + attention.unassigned * 10;
}

@Injectable()
export class ProgressService {
  constructor(
    private readonly store: ServerStore,
    @Inject(SERVER_STORE_OPTIONS) private readonly options: ServerStoreOptions,
  ) {}

  /**
   * @tested-by: tst_int_planctl_progress_001
   * @invariant: CTL-005 portfolio ETA is a calibrated dependency critical path and owner wait makes calendar time unknown.
   * @invariant: CTL-010 observations from a non-canonical plan revision are shown as drift and excluded from forecast inputs.
   */
  portfolio(): PortfolioProgressView {
    const generatedAt = this.options.now();
    if (!Number.isFinite(Date.parse(generatedAt))) throw new Error("progress clock must be an ISO timestamp");
    const plans = this.store.canonicalPlans().map((plan) => this.#plan(plan, generatedAt));
    plans.sort((left, right) => {
      const attention = attentionScore(right.attention) - attentionScore(left.attention);
      if (attention !== 0) return attention;
      const leftEta = left.estimatedDeliveryAt ?? "9999";
      const rightEta = right.estimatedDeliveryAt ?? "9999";
      return leftEta.localeCompare(rightEta) || left.planId.localeCompare(right.planId);
    });
    return { generatedAt, plans };
  }

  plan(planId: string): PlanProgressView | null {
    return this.portfolio().plans.find((plan) => plan.planId === planId) ?? null;
  }

  #plan(plan: CanonicalPlanRecord, generatedAt: string): PlanProgressView {
    const observations = this.store.agentObservations()
      .filter((agent) => agent.planId === plan.planId && agent.state !== "finished");
    const remainingTaskIds = new Set(plan.progress.stages.flatMap((stage) =>
      stage.remainingTasks.map((task) => task.taskId)
    ));
    const aligned = (agent: StoredAgentObservation): boolean =>
      agent.planRevision === plan.planRevision
      && agent.taskId !== null
      && remainingTaskIds.has(agent.taskId);
    const activeAgents = observations.map((agent): ProgressAgentView => ({
      machineId: agent.machineId,
      machineState: agent.machineState,
      agentId: agent.agentId,
      state: aligned(agent) ? agent.state : "plan_drift",
      taskId: agent.taskId,
      planRevision: agent.planRevision,
      lastActivityAt: agent.lastActivityAt,
      idleSeconds: agent.idleSeconds,
      elapsedActiveMinutes: agent.elapsedActiveMinutes,
      ownerWaitReason: agent.ownerWaitReason,
      ownerWaitStartedAt: agent.ownerWaitStartedAt,
    })).sort((left, right) => statePriority(left) - statePriority(right)
      || left.machineId.localeCompare(right.machineId)
      || left.agentId.localeCompare(right.agentId));
    const canonicalAgents = observations.filter(aligned);
    const repositoryId = canonicalAgents.map((agent) => agent.repositoryId)
      .find((candidate): candidate is string => candidate !== null) ?? plan.planId.split(":", 1)[0];
    if (repositoryId === undefined || repositoryId === "") throw new Error(`plan ${plan.planId} has no repository identity`);
    const observedCalibration = calibration(this.store.calibrationSamples(repositoryId));
    const elapsedByTask = activeElapsedByTask(canonicalAgents);
    const weights = stageForecastWeights(plan.progress, observedCalibration.factor, elapsedByTask);
    const remainingActiveMinutes = [...weights.raw.values()].reduce((total, value) => total + value, 0);
    const criticalPathMinutes = dependencyCriticalPath(plan.progress, weights.raw);
    const calibratedCriticalPathMinutes = dependencyCriticalPath(plan.progress, weights.calibrated);
    const attention: PlanAttentionView = {
      ownerWait: activeAgents.filter((agent) => agent.state === "awaiting_owner").length,
      stale: activeAgents.filter((agent) => agent.state === "stale").length,
      unassigned: activeAgents.filter((agent) => agent.state === "unassigned").length,
      machineOffline: new Set(activeAgents
        .filter((agent) => agent.machineState === "offline")
        .map((agent) => agent.machineId)).size,
      planDrift: activeAgents.filter((agent) => agent.state === "plan_drift").length,
    };
    return {
      planId: plan.planId,
      planRevision: plan.planRevision,
      goal: plan.goal,
      updatedAt: plan.updatedAt,
      completionPercent: plan.progress.completionPercent,
      tasks: plan.progress.tasks,
      activeMinutes: plan.progress.activeMinutes,
      credits: plan.progress.credits,
      activeAgents,
      attention,
      remainingActiveMinutes,
      criticalPathMinutes,
      calibratedCriticalPathMinutes,
      estimatedDeliveryAt: attention.ownerWait > 0
        ? null
        : new Date(Date.parse(generatedAt) + calibratedCriticalPathMinutes * 60_000).toISOString(),
      calibration: observedCalibration,
    };
  }
}
