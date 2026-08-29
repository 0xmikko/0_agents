export type FocusStatus = "focused" | "unassigned" | "plan_drift" | "awaiting_owner";

export interface FocusTaskView {
  readonly id: string;
  readonly story: string;
  readonly writes: readonly string[];
  readonly how: string;
  readonly red: string;
}

export interface FocusView {
  readonly source: string;
  readonly status: FocusStatus;
  readonly evidence: string;
  readonly goal: string;
  readonly currentTask: FocusTaskView | null;
  readonly nextReadyTaskIds: readonly string[];
  readonly completionPercent: number;
  readonly completedTasks: number;
  readonly totalTasks: number;
  readonly remainingActiveMinutes: number;
  readonly criticalPathMinutes: number;
  readonly estimatedDeliveryAt: string | null;
  readonly ownerWaitReason: string | null;
}

export interface ProgressPlanView {
  readonly planId: string;
  readonly status: string;
  readonly completionPercent: number;
  readonly completedTasks: number;
  readonly totalTasks: number;
  readonly remainingActiveMinutes: number;
  readonly criticalPathMinutes: number;
  readonly estimatedDeliveryAt: string | null;
}

export interface ProgressView {
  readonly source: string;
  readonly status: "available" | "offline";
  readonly evidence: string;
  readonly plans: readonly ProgressPlanView[];
}

function percentage(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error("completion percent is invalid");
  return `${value.toFixed(1)}%`;
}

function taskLines(task: FocusTaskView | null): readonly string[] {
  if (task === null) return ["Current Task: none"];
  return [
    `Current Task: ${task.id} — ${task.story}`,
    `Writes: ${task.writes.join(", ")}`,
    `How: ${task.how}`,
    `RED: ${task.red}`,
  ];
}

/** @tested-by: tst_cli_planctl_focus_001 */
export function renderFocus(view: FocusView): string {
  const eta = view.estimatedDeliveryAt === null
    ? "ETA: unknown while owner response is required"
    : `ETA: ${view.estimatedDeliveryAt}`;
  const owner = view.ownerWaitReason === null ? [] : [`Owner response needed: ${view.ownerWaitReason}`];
  return [
    "planctl focus",
    `Source: ${view.source}`,
    `Status: ${view.status}`,
    `Evidence: ${view.evidence}`,
    `Goal: ${view.goal}`,
    ...taskLines(view.currentTask),
    `Next ready: ${view.nextReadyTaskIds.length === 0 ? "none" : view.nextReadyTaskIds.join(", ")}`,
    `Progress: ${percentage(view.completionPercent)} (${view.completedTasks}/${view.totalTasks} Tasks)`,
    `Remaining: ${view.remainingActiveMinutes} active min; ${view.criticalPathMinutes} critical-path min`,
    eta,
    ...owner,
  ].join("\n");
}

/** @tested-by: tst_cli_planctl_focus_001 */
export function renderProgress(view: ProgressView): string {
  const plans = view.plans.length === 0
    ? ["Plans: none"]
    : view.plans.map((plan) => [
      `${plan.planId} — ${plan.status}`,
      `  Progress: ${percentage(plan.completionPercent)} (${plan.completedTasks}/${plan.totalTasks} Tasks)`,
      `  Remaining: ${plan.remainingActiveMinutes} active min; ${plan.criticalPathMinutes} critical-path min`,
      `  ETA: ${plan.estimatedDeliveryAt ?? "unknown"}`,
    ].join("\n"));
  return [
    "planctl progress",
    `Source: ${view.source}`,
    `Status: ${view.status}`,
    `Evidence: ${view.evidence}`,
    ...plans,
  ].join("\n");
}
