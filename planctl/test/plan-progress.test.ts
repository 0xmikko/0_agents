import { describe, expect, it } from "bun:test";

import { planProgress, progressNote, projectPlanProgress } from "../src/core/plan-progress";
import {
  approvePlan,
  createDraftPlan,
  lockPlanSpec,
  putDelivery,
  putStage,
  taskRunPath,
} from "../src/core/plan-update";
import { decodeTaskRun } from "../src/core/task-run";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { StageInput, TaskInput } from "../src/core/plan-update";

function task(id: string, minutes: number, credits: number): TaskInput {
  return {
    id,
    story: `produce observable progress for ${id} in src/${id.toLowerCase()}.ts`,
    writes: [`src/${id.toLowerCase()}.ts`],
    predictedActiveMinutes: minutes,
    predictedCredits: credits,
    how: `implement src/${id.toLowerCase()}.ts through the canonical projection`,
    red: "bun run agent:test:backend -- test/plan-progress.test.ts",
  };
}

function stage(
  id: string,
  tasks: readonly TaskInput[],
  depends: readonly string[],
  parallelWith: readonly string[],
): StageInput {
  return {
    id,
    deliveryId: "D1",
    title: `Progress ${id}`,
    owner: "core-agent",
    profile: "strong",
    depends,
    parallelWith,
    writes: tasks.flatMap((entry) => entry.writes),
    tempRoot: `.tmp/code-production/progress/${id}`,
    predictedActiveMinutes: tasks.reduce((sum, entry) => sum + entry.predictedActiveMinutes, 0),
    predictedCredits: tasks.reduce((sum, entry) => sum + entry.predictedCredits, 0),
    verifyActiveMinutes: 0,
    verifyCredits: 0,
    description: "What this Stage solves. Progress fixture.",
    tasks,
    criteria: ["`true` exits 0 — progress is deterministic", "Commit"],
  };
}

function partiallyCompletePlan(): string {
  let body = createDraftPlan("Progress fixture");
  body = lockPlanSpec(body, "owner").body;
  body = putDelivery(body, {
    id: "D1",
    title: "Progress delivery",
    branch: "feat/progress",
    depends: [],
    gate: ["scripts"],
    active: true,
    stageGraph: "D1-S1 -> (D1-S2 || D1-S3)",
    predictedExternalWaitMinutes: 0,
    description: "What changed for people. Progress fixture.",
  }).body;
  body = putStage(body, stage("D1-S1", [task("PROG_001", 20, 2), task("PROG_002", 40, 4)], [], [])).body;
  body = putStage(body, stage("D1-S2", [task("PROG_003", 30, 3)], ["D1-S1"], ["D1-S3"])).body;
  body = putStage(body, stage("D1-S3", [task("PROG_004", 10, 1)], ["D1-S1"], ["D1-S2"])).body;
  return approvePlan(body, "owner").body.replace("- [ ] PROG_001", "- [x] PROG_001");
}

describe("plan progress", () => {
  /**
   * @test-id: tst_unit_planctl_progress_001
   * @scenario: scn_planctl_progress_001
   * @covers: planctl/src/core/plan-progress.ts::projectPlanProgress
   * @deterministic: yes
   * @fixtures: canonical approved plan with partial and parallel Stages
   *
   * Test environment: pure canonical plan parser and progress projection
   * Clients: direct calls
   * Mocks: none
   * Data: four weighted Tasks across three dependency-linked Stages
   */
  it("tst_unit_planctl_progress_001 projects weighted completion and remaining forecasts", () => {
    const progress = projectPlanProgress(partiallyCompletePlan());

    expect(progress.deliveryId).toBe("D1");
    expect(progress.tasks).toEqual({ completed: 1, total: 4 });
    expect(progress.activeMinutes).toEqual({ completed: 20, remaining: 80, total: 100 });
    expect(progress.credits).toEqual({ completed: 2, remaining: 8, total: 10 });
    expect(progress.completionPercent).toBe(20);
    expect(progress.stages.map((entry) => ({ id: entry.id, percent: entry.completionPercent }))).toEqual([
      { id: "D1-S1", percent: 20 / 60 * 100 },
      { id: "D1-S2", percent: 0 },
      { id: "D1-S3", percent: 0 },
    ]);
    expect(progress.stages[1]?.parallelWith).toEqual(["D1-S3"]);
    expect(progress.stages.map((entry) => entry.remainingTasks)).toEqual([
      [{ taskId: "PROG_002", predictedActiveMinutes: 40 }],
      [{ taskId: "PROG_003", predictedActiveMinutes: 30 }],
      [{ taskId: "PROG_004", predictedActiveMinutes: 10 }],
    ]);
  });
});

describe("where am I", () => {
  function twoDeliveries(): string {
    let body = createDraftPlan("Progress fixture");
    body = lockPlanSpec(body, "owner").body;
    body = putDelivery(body, {
      id: "D1", title: "First delivery", branch: "feat/progress", depends: [], gate: ["scripts"], active: true,
      stageGraph: "D1-S1", predictedExternalWaitMinutes: 0, description: "What changed for people. Progress fixture.",
    }).body;
    body = putDelivery(body, {
      id: "D2", title: "Second delivery", branch: "feat/progress-2", depends: ["D1"], gate: ["scripts"], active: false,
      stageGraph: "D2-S1 -> D2-S2", predictedExternalWaitMinutes: 0, description: "What changed for people. Progress fixture.",
    }).body;
    body = putStage(body, stage("D1-S1", [task("PROG_001", 20, 2), task("PROG_002", 40, 4)], [], [])).body;
    body = putStage(body, { ...stage("D2-S1", [task("PROG_003", 30, 3), task("PROG_004", 10, 1), task("PROG_005", 10, 1)], [], []), deliveryId: "D2" }).body;
    body = putStage(body, { ...stage("D2-S2", [task("PROG_006", 10, 1), task("PROG_007", 10, 1), task("PROG_008", 10, 1)], ["D2-S1"], []), deliveryId: "D2" }).body;
    return approvePlan(body, "owner").body.replace("- [ ] PROG_001", "- [x] PROG_001").replace("- [ ] PROG_002", "- [x] PROG_002");
  }

  function repository(body: string, branch: string): string {
    const root = mkdtempSync(join(tmpdir(), "plan-progress-"));
    const git = (...args: readonly string[]): string => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    git("init", "-q", "-b", branch);
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    mkdirSync(join(root, "docs/plans"), { recursive: true });
    writeFileSync(join(root, "docs/plans/2026-09-25-progress.md"), body);
    git("add", "-A");
    git("commit", "-qm", "plan");
    return root;
  }

  const green = (branch: string) => ({ prUrl: `https://example.test/pr/${branch}`, ci: "green" as const, headSha: "c".repeat(40), runId: "9", attempt: 1, merged: false });

  /**
   * @test-id: tst_unit_planctl_progress_002
   * @scenario: scn_planctl_progress_screen_001
   * @covers: planctl/src/core/plan-progress.ts::planProgress,progressNote
   * @deterministic: yes
   * @invariant: whole-plan and Delivery counts are separate; missing parts are marked unavailable and nothing throws; the plan is found by branch.
   */
  it("tst_unit_planctl_progress_002 shows 2 of 8 beside 2 of 2, the observed PR, the runtime and the note", async () => {
    const root = repository(twoDeliveries(), "feat/progress");
    try {
      const plan = "docs/plans/2026-09-25-progress.md";
      const runPath = taskRunPath(root, plan, "PROG_003");
      mkdirSync(dirname(runPath), { recursive: true });
      const startedAt = new Date().toISOString();
      writeFileSync(runPath, JSON.stringify({ version: 1, plan, deliveryId: "D2", stageId: "D2-S1", taskId: "PROG_003", startedAt, baseHead: "a".repeat(40) }));
      mkdirSync(join(root, ".agents/code-production"), { recursive: true });
      writeFileSync(join(root, ".agents/code-production/manifest.json"), JSON.stringify({ version: 1, commit: "a".repeat(40), files: [] }));

      const view = await planProgress(root, { plan: null, publication: green, sourceCommit: "b".repeat(40), decodeRun: decodeTaskRun });
      if (view === null) throw new Error("plan not found by branch");
      expect(view.plan).toBe(plan);
      expect(view.state).toBe("APPROVED");
      expect(view.wholePlan).toEqual({ completedTasks: 2, totalTasks: 8, deliveries: [{ id: "D1", state: "published" }, { id: "D2", state: "not_started" }] });
      expect(view.delivery).toEqual({ id: "D1", completedTasks: 2, totalTasks: 2, closedStages: [], openStages: ["D1-S1"] });
      expect(view.publication).toEqual(green("feat/progress"));
      expect(view.runtime).toEqual({ installed: "a".repeat(40), source: "b".repeat(40), stale: true });
      expect(view.currentTask).toEqual({ id: "PROG_003", startedAt, checkpoint: null });
      expect(view.next).toEqual({ taskId: null, blockedBy: null });
      expect(progressNote(view)).toBe(`Task PROG_003 running since ${startedAt}; checkpoint: none. The owner's message decides.`);

      const failing = await planProgress(root, { plan, publication: () => { throw new Error("gh: not logged in"); }, sourceCommit: null, decodeRun: decodeTaskRun });
      expect(failing?.publication).toEqual({ error: "gh: not logged in" });
      rmSync(join(root, ".agents"), { recursive: true, force: true });
      const bare = await planProgress(root, { plan, publication: () => null, sourceCommit: "b".repeat(40), decodeRun: decodeTaskRun });
      expect(bare?.runtime).toBeNull();
      expect(bare?.publication).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /**
   * @test-id: tst_unit_planctl_progress_003
   * @scenario: scn_planctl_progress_screen_002
   * @covers: planctl/src/core/plan-progress.ts::planProgress,projectPlanProgress
   * @deterministic: yes
   * @invariant: a staged draft, a branch without a plan and zero totals answer without throwing.
   */
  it("tst_unit_planctl_progress_003 answers for a draft, for a branch without a plan and for zero totals", async () => {
    const root = repository(createDraftPlan("Draft fixture"), "feat/progress");
    try {
      const draft = await planProgress(root, { plan: null, publication: () => null, sourceCommit: null, decodeRun: decodeTaskRun });
      expect(draft?.state).toBe("SPEC_DRAFT");
      expect(draft?.delivery).toBeNull();
      expect(draft?.wholePlan).toEqual({ completedTasks: 0, totalTasks: 0, deliveries: [] });
      expect(draft?.next).toEqual({ taskId: null, blockedBy: null });
      expect(progressNote(draft)).toBeNull();
      execFileSync("git", ["checkout", "-qb", "feat/elsewhere"], { cwd: root });
      expect(await planProgress(root, { plan: null, publication: () => null, sourceCommit: null, decodeRun: decodeTaskRun })).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    let zero = createDraftPlan("Zero fixture");
    zero = lockPlanSpec(zero, "owner").body;
    zero = putDelivery(zero, { id: "D1", title: "Zero", branch: "feat/zero", depends: [], gate: ["scripts"], active: true, stageGraph: "D1-S1", predictedExternalWaitMinutes: 0, description: "What changed for people. Zero fixture." }).body;
    zero = putStage(zero, stage("D1-S1", [task("ZERO_001", 0, 0)], [], [])).body;
    const projected = projectPlanProgress(approvePlan(zero, "owner").body);
    expect(projected.completionPercent).toBe(0);
    expect(projected.activeMinutes).toEqual({ completed: 0, remaining: 0, total: 0 });
    expect(projected.wholePlan).toEqual({ completed: 0, total: 1 });
  });
});
