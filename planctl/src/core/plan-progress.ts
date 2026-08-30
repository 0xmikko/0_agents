import { deliveryMetas, stageInputs } from "./plan-update";

export interface ProgressAmount {
  readonly completed: number;
  readonly remaining: number;
  readonly total: number;
}

export interface TaskCount {
  readonly completed: number;
  readonly total: number;
}

export interface RemainingTaskForecast {
  readonly taskId: string;
  readonly predictedActiveMinutes: number;
}

export interface StageProgressSnapshot {
  readonly id: string;
  readonly depends: readonly string[];
  readonly parallelWith: readonly string[];
  readonly tasks: TaskCount;
  readonly activeMinutes: ProgressAmount;
  readonly credits: ProgressAmount;
  readonly completionPercent: number;
  readonly remainingTasks: readonly RemainingTaskForecast[];
}

export interface PlanProgressSnapshot {
  readonly deliveryId: string;
  readonly tasks: TaskCount;
  readonly activeMinutes: ProgressAmount;
  readonly credits: ProgressAmount;
  readonly completionPercent: number;
  readonly stages: readonly StageProgressSnapshot[];
}

function amount(completed: number, total: number): ProgressAmount {
  if (completed < 0 || total <= 0 || completed > total) {
    throw new Error(`invalid progress amount ${completed}/${total}`);
  }
  return { completed, remaining: total - completed, total };
}

function percent(completed: number, total: number): number {
  if (total <= 0) throw new Error("progress total must be positive");
  return completed / total * 100;
}

/**
 * @tested-by: tst_unit_planctl_progress_001
 * @invariant: CTL-001 every consumer derives weighted progress from the one canonical plan parser.
 */
export function projectPlanProgress(body: string): PlanProgressSnapshot {
  const activeDelivery = deliveryMetas(body).find((delivery) => delivery.active);
  if (activeDelivery === undefined) throw new Error("plan has no active Delivery");
  const stages = stageInputs(body).filter((stage) => stage.deliveryId === activeDelivery.id);
  if (stages.length === 0) throw new Error(`active Delivery ${activeDelivery.id} has no Stages`);

  const stageProgress = stages.map((stage): StageProgressSnapshot => {
    const completedTasks = stage.tasks.filter((task) => task.completed);
    const totalMinutes = stage.tasks.reduce((sum, task) => sum + task.predictedActiveMinutes, 0);
    const completedMinutes = completedTasks.reduce((sum, task) => sum + task.predictedActiveMinutes, 0);
    const totalCredits = stage.tasks.reduce((sum, task) => sum + task.predictedCredits, 0);
    const completedCredits = completedTasks.reduce((sum, task) => sum + task.predictedCredits, 0);
    return {
      id: stage.id,
      depends: stage.depends,
      parallelWith: stage.parallelWith,
      tasks: { completed: completedTasks.length, total: stage.tasks.length },
      activeMinutes: amount(completedMinutes, totalMinutes),
      credits: amount(completedCredits, totalCredits),
      completionPercent: percent(completedMinutes, totalMinutes),
      remainingTasks: stage.tasks
        .filter((task) => !task.completed)
        .map((task) => ({
          taskId: task.id,
          predictedActiveMinutes: task.predictedActiveMinutes,
        })),
    };
  });

  const tasks = stageProgress.reduce(
    (total, stage) => ({ completed: total.completed + stage.tasks.completed, total: total.total + stage.tasks.total }),
    { completed: 0, total: 0 },
  );
  const totalMinutes = stageProgress.reduce((sum, stage) => sum + stage.activeMinutes.total, 0);
  const completedMinutes = stageProgress.reduce((sum, stage) => sum + stage.activeMinutes.completed, 0);
  const totalCredits = stageProgress.reduce((sum, stage) => sum + stage.credits.total, 0);
  const completedCredits = stageProgress.reduce((sum, stage) => sum + stage.credits.completed, 0);

  return {
    deliveryId: activeDelivery.id,
    tasks,
    activeMinutes: amount(completedMinutes, totalMinutes),
    credits: amount(completedCredits, totalCredits),
    completionPercent: percent(completedMinutes, totalMinutes),
    stages: stageProgress,
  };
}
