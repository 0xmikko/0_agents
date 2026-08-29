import { projectPlanProgress } from "./plan-progress";
import { stageInputs } from "./plan-update";

export type ForecastTaskState = "working" | "awaiting_owner" | "stale";

export interface ActiveTaskForecastInput {
  readonly taskId: string;
  readonly state: ForecastTaskState;
  readonly elapsedActiveMinutes: number;
}

export interface CompletedTaskSample {
  readonly predictedActiveMinutes: number;
  readonly actualActiveMinutes: number;
}

export interface DeliveryForecastInput {
  readonly now: string;
  readonly activeTasks: readonly ActiveTaskForecastInput[];
  readonly completedTaskSamples: readonly CompletedTaskSample[];
}

export interface DeliveryForecast {
  readonly completionPercent: number;
  readonly remainingActiveMinutes: number;
  readonly remainingCriticalPathMinutes: number;
  readonly calibratedCriticalPathMinutes: number;
  readonly estimatedDeliveryAt: string | null;
  readonly blockedByOwner: number;
  readonly calibration: {
    readonly factor: number;
    readonly completedTaskSamples: number;
    readonly confidence: "low" | "medium" | "high";
  };
}

function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("median requires at least one value");
  const ordered = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const upper = ordered[middle];
  if (upper === undefined) throw new Error("median sample is missing");
  if (ordered.length % 2 === 1) return upper;
  const lower = ordered[middle - 1];
  if (lower === undefined) throw new Error("median lower sample is missing");
  return (lower + upper) / 2;
}

function calibration(samples: readonly CompletedTaskSample[]): DeliveryForecast["calibration"] {
  for (const sample of samples) {
    if (sample.predictedActiveMinutes <= 0 || sample.actualActiveMinutes < 0) {
      throw new Error("calibration samples require positive predictions and non-negative actuals");
    }
  }
  const factor = samples.length < 3
    ? 1
    : Math.min(3, Math.max(0.5, median(samples.map((sample) =>
      sample.actualActiveMinutes / sample.predictedActiveMinutes
    ))));
  const confidence = samples.length < 3 ? "low" : samples.length < 10 ? "medium" : "high";
  return { factor, completedTaskSamples: samples.length, confidence };
}

function criticalPath(
  stages: ReturnType<typeof stageInputs>,
  weights: ReadonlyMap<string, number>,
): number {
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  const memo = new Map<string, number>();
  const endingAt = (stageId: string): number => {
    const cached = memo.get(stageId);
    if (cached !== undefined) return cached;
    const stage = byId.get(stageId);
    if (stage === undefined) throw new Error(`forecast names unknown Stage ${stageId}`);
    const dependencyPath = stage.depends.length === 0
      ? 0
      : Math.max(...stage.depends.map((dependency) => endingAt(dependency)));
    const value = (weights.get(stageId) ?? 0) + dependencyPath;
    memo.set(stageId, value);
    return value;
  };
  return Math.max(...stages.map((stage) => endingAt(stage.id)));
}

/**
 * @tested-by: tst_unit_planctl_eta_001
 * @invariant: CTL-005 ETA is calibrated remaining dependency critical path, never work divided by agent count.
 * @invariant: CTL-006 a structured owner wait makes calendar ETA unknown.
 */
export function forecastDelivery(body: string, input: DeliveryForecastInput): DeliveryForecast {
  const now = Date.parse(input.now);
  if (!Number.isFinite(now)) throw new Error("forecast now must be an ISO timestamp");
  const progress = projectPlanProgress(body);
  const stages = stageInputs(body).filter((stage) => stage.deliveryId === progress.deliveryId);
  const tasks = stages.flatMap((stage) => stage.tasks.map((task) => ({ stageId: stage.id, task })));
  const activeByTask = new Map<string, ActiveTaskForecastInput>();
  for (const active of input.activeTasks) {
    if (active.elapsedActiveMinutes < 0) throw new Error(`Task ${active.taskId} has negative active time`);
    if (activeByTask.has(active.taskId)) throw new Error(`Task ${active.taskId} has duplicate active timing`);
    const task = tasks.find((entry) => entry.task.id === active.taskId)?.task;
    if (task === undefined || task.completed) throw new Error(`active timing names unavailable Task ${active.taskId}`);
    activeByTask.set(active.taskId, active);
  }

  const observedCalibration = calibration(input.completedTaskSamples);
  const rawWeights = new Map<string, number>();
  const calibratedWeights = new Map<string, number>();
  let remainingActiveMinutes = 0;
  for (const stage of stages) {
    let rawStage = 0;
    let calibratedStage = 0;
    for (const task of stage.tasks) {
      if (task.completed) continue;
      const active = activeByTask.get(task.id);
      const elapsed = active?.elapsedActiveMinutes ?? 0;
      const raw = Math.max(0, task.predictedActiveMinutes - elapsed);
      const calibrated = Math.max(0, task.predictedActiveMinutes * observedCalibration.factor - elapsed);
      rawStage += raw;
      calibratedStage += calibrated;
      remainingActiveMinutes += raw;
    }
    rawWeights.set(stage.id, rawStage);
    calibratedWeights.set(stage.id, calibratedStage);
  }

  const remainingCriticalPathMinutes = criticalPath(stages, rawWeights);
  const calibratedCriticalPathMinutes = criticalPath(stages, calibratedWeights);
  const blockedByOwner = input.activeTasks.filter((task) => task.state === "awaiting_owner").length;
  return {
    completionPercent: progress.completionPercent,
    remainingActiveMinutes,
    remainingCriticalPathMinutes,
    calibratedCriticalPathMinutes,
    estimatedDeliveryAt: blockedByOwner > 0
      ? null
      : new Date(now + calibratedCriticalPathMinutes * 60_000).toISOString(),
    blockedByOwner,
    calibration: observedCalibration,
  };
}
