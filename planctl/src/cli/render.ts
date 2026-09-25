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

import type { ProgressView } from "../core/plan-progress";
import type { TaskBrief } from "../core/plan-update";

/** The observer's read model: where the numbers came from and the plans it saw. */
interface ProgressReport {
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
export function renderProgress(view: ProgressReport): string {
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

/** The "where am I" screen. @tested-by: tst_unit_planctl_progress_002 */
export function renderProgressView(view: ProgressView): string {
  const publication = view.publication === null
    ? "Publish   none observed"
    : "error" in view.publication
      ? `Publish   unavailable: ${view.publication.error}`
      : `Publish   ${view.publication.prUrl} · CI on ${view.publication.headSha.slice(0, 7)} ${view.publication.ci} (run ${view.publication.runId} attempt ${view.publication.attempt}) · merge: ${view.publication.merged ? "merged" : "not yet"}`;
  const runtime = view.runtime === null
    ? "Runtime   unavailable: no installed manifest"
    : `Runtime   installed ${view.runtime.installed.slice(0, 7)} · source ${view.runtime.source.slice(0, 7)}${view.runtime.stale ? " · stale" : ""}`;
  const delivery = view.delivery === null
    ? "Delivery  none active"
    : `Delivery  ${view.delivery.id} · ${view.delivery.completedTasks} of ${view.delivery.totalTasks} Tasks · closed ${view.delivery.closedStages.join(", ") || "none"} · open ${view.delivery.openStages.join(", ") || "none"}`;
  const eligible = view.next.taskId === null
    ? `Eligible  none${view.next.blockedBy === null ? "" : ` · blocked: ${view.next.blockedBy}`}`
    : `Eligible  ${view.next.taskId} · blocked: none`;
  return [
    `Plan      ${view.plan} (${view.state})`,
    ...view.goal.map((line) => `Goal      ${line}`),
    view.currentTask === null ? "Now       no Task running" : `Now       ${view.currentTask.id} since ${view.currentTask.startedAt}${view.currentTask.checkpoint === null ? "" : ` · ${view.currentTask.checkpoint}`}`,
    delivery,
    `Plan      ${view.wholePlan.completedTasks} of ${view.wholePlan.totalTasks} Tasks · ${view.wholePlan.deliveries.map((entry) => `${entry.id} ${entry.state}`).join(", ") || "no Deliveries"}`,
    publication,
    runtime,
    eligible,
  ].join("\n");
}

/** "What do I do now": the plan and the Goal first, then the Task's scope. */
export function renderTaskBrief(brief: TaskBrief, observer: string): string {
  return [
    `Plan: ${brief.plan}`,
    ...brief.goal.map((line) => `Goal: ${line}`),
    `Task ${brief.taskId} STARTED`,
    `Observer identity: ${observer}`,
    `Delivery / Stage: ${brief.deliveryId} / ${brief.stageId}`,
    `Stage description: ${brief.stageDescription}`,
    `Started: ${brief.startedAt}`,
    `Forecast: ${brief.forecastMinutes} active min`,
    `Folders: ${brief.folders.join(", ")}`,
    `Story: ${brief.story}`,
    `How: ${brief.how.join("; ")}`,
    `RED: ${brief.red}`,
    `Checkpoint: ${brief.checkpoint ?? "none"}`,
  ].join("\n");
}
