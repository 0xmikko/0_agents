import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { deliveryMetas, goalLines, nextOpenTask, planState, runningTaskRecords, stageClosed, stageInputs } from "./plan-update";
import type { TaskRun } from "./task-run";

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
  readonly wholePlan: TaskCount;
  readonly activeMinutes: ProgressAmount;
  readonly credits: ProgressAmount;
  readonly completionPercent: number;
  readonly stages: readonly StageProgressSnapshot[];
}

function amount(completed: number, total: number): ProgressAmount {
  if (completed < 0 || total < 0 || completed > total) {
    throw new Error(`invalid progress amount ${completed}/${total}`);
  }
  return { completed, remaining: total - completed, total };
}

/** Zero of zero is zero percent: numbers never stop work, and a plan with no forecast still answers. */
function percent(completed: number, total: number): number {
  if (total < 0) throw new Error("progress total must be non-negative");
  return total === 0 ? 0 : completed / total * 100;
}

function taskCount(body: string, deliveryId: string | null): TaskCount {
  const tasks = stageInputs(body).filter((stage) => deliveryId === null || stage.deliveryId === deliveryId).flatMap((stage) => stage.tasks);
  return { completed: tasks.filter((task) => task.completed).length, total: tasks.length };
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
    wholePlan: taskCount(body, null),
    activeMinutes: amount(completedMinutes, totalMinutes),
    credits: amount(completedCredits, totalCredits),
    completionPercent: percent(completedMinutes, totalMinutes),
    stages: stageProgress,
  };
}

/** The "where am I" screen: whole plan and Delivery apart, the observed
 * publication, the installed runtime, the running Task and the next one.
 * Missing parts are marked unavailable; nothing throws. */
export interface ProgressView {
  readonly plan: string;
  readonly state: "SPEC_DRAFT" | "SPEC_LOCKED" | "APPROVED";
  readonly goal: readonly string[];
  readonly currentTask: {
    readonly id: string;
    readonly startedAt: string;
    readonly checkpoint: string | null;
  } | null;
  readonly delivery: {
    readonly id: string;
    readonly completedTasks: number;
    readonly totalTasks: number;
    readonly closedStages: readonly string[];
    readonly openStages: readonly string[];
  } | null;
  readonly wholePlan: {
    readonly completedTasks: number;
    readonly totalTasks: number;
    readonly deliveries: readonly {
      readonly id: string;
      readonly state: "not_started" | "in_work" | "published" | "merged";
    }[];
  };
  readonly publication: {
    readonly prUrl: string;
    readonly ci: "pending" | "green" | "red";
    readonly headSha: string;
    readonly runId: string;
    readonly attempt: number;
    readonly merged: boolean;
  } | {
    readonly error: string;
  } | null;
  readonly runtime: {
    readonly installed: string;
    readonly source: string;
    readonly stale: boolean;
  } | null;
  readonly next: {
    readonly taskId: string | null;
    readonly blockedBy: string | null;
  };
}

type Publication = ProgressView["publication"];

interface ProgressOptions {
  /** The plan file, or null to find docs/plans/*-<slug>.md from the branch. */
  readonly plan: string | null;
  /** What gh reports for a Delivery branch: a PR with its CI, null for none, or throws. */
  readonly publication: (branch: string) => Publication;
  /** HEAD of the checkout planctl runs from; null when unknown. */
  readonly sourceCommit: string | null;
  readonly decodeRun: (value: unknown) => TaskRun | Promise<TaskRun>;
}

function planByBranch(root: string): string | null {
  const branch = execFileSync("git", ["-C", root, "branch", "--show-current"], { encoding: "utf8" }).trim();
  const slug = branch.slice(branch.lastIndexOf("/") + 1).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const directory = resolve(root, "docs/plans");
  if (slug === "" || !existsSync(directory)) return null;
  const name = readdirSync(directory).find((entry) => entry === `${slug}.md` || entry.endsWith(`-${slug}.md`));
  return name === undefined ? null : `docs/plans/${name}`;
}

function observePublication(read: (branch: string) => Publication, branch: string): Publication {
  try {
    return read(branch);
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function installedRuntime(root: string, sourceCommit: string | null): ProgressView["runtime"] {
  const manifest = resolve(root, ".agents/code-production/manifest.json");
  if (!existsSync(manifest) || sourceCommit === null) return null;
  const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
  const installed = typeof parsed === "object" && parsed !== null && "commit" in parsed && typeof parsed.commit === "string" ? parsed.commit : null;
  if (installed === null) return null;
  return { installed, source: sourceCommit, stale: installed !== sourceCommit };
}

/** @tested-by: tst_unit_planctl_progress_002, tst_unit_planctl_progress_003 */
export async function planProgress(root: string, options: ProgressOptions): Promise<ProgressView | null> {
  const plan = options.plan ?? planByBranch(root);
  if (plan === null) return null;
  const body = readFileSync(resolve(root, plan), "utf8");
  const deliveries = deliveryMetas(body);
  const active = deliveries.find((delivery) => delivery.active) ?? null;
  const stages = stageInputs(body);
  const publication = active === null ? null : observePublication(options.publication, active.branch);
  const whole = taskCount(body, null);
  const runs = await runningTaskRecords(root, plan, options.decodeRun);
  const running = [...runs].sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
  return {
    plan,
    state: planState(body),
    goal: goalLines(body),
    currentTask: running === undefined ? null : { id: running.taskId, startedAt: running.startedAt, checkpoint: null },
    delivery: active === null ? null : (() => {
      const own = stages.filter((stage) => stage.deliveryId === active.id);
      const count = taskCount(body, active.id);
      return {
        id: active.id,
        completedTasks: count.completed,
        totalTasks: count.total,
        closedStages: own.filter((stage) => stageClosed(body, stage.id)).map((stage) => stage.id),
        openStages: own.filter((stage) => !stageClosed(body, stage.id)).map((stage) => stage.id),
      };
    })(),
    wholePlan: {
      completedTasks: whole.completed,
      totalTasks: whole.total,
      deliveries: deliveries.map((delivery) => {
        const count = taskCount(body, delivery.id);
        const observed = delivery.id === active?.id ? publication : null;
        const state = observed !== null && "merged" in observed
          ? (observed.merged ? "merged" : "published")
          : count.completed > 0 ? "in_work" : "not_started";
        return { id: delivery.id, state };
      }),
    },
    publication,
    runtime: installedRuntime(root, options.sourceCommit),
    next: nextOpenTask(body),
  };
}

/** One line after context compaction, only when a Task is running; otherwise nothing. */
export function progressNote(view: ProgressView | null): string | null {
  if (view === null || view.currentTask === null) return null;
  const checkpoint = view.currentTask.checkpoint ?? "none";
  return `Task ${view.currentTask.id} running since ${view.currentTask.startedAt}; checkpoint: ${checkpoint}. The owner's message decides.`;
}
