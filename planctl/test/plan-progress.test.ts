import { describe, expect, it } from "bun:test";

import { projectPlanProgress } from "../src/core/plan-progress";
import {
  approvePlan,
  createDraftPlan,
  lockPlanSpec,
  putDelivery,
  putStage,
} from "../src/core/plan-update";

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
