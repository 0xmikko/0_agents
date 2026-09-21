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

/** @tested-by: tst_cli_planctl_progress_001 */
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
