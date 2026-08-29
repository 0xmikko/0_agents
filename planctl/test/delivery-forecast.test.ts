import { describe, expect, it } from "bun:test";

import { forecastDelivery } from "../src/core/delivery-forecast";
import {
  approvePlan,
  createDraftPlan,
  lockPlanSpec,
  putDelivery,
  putStage,
} from "../src/core/plan-update";

import type { StageInput, TaskInput } from "../src/core/plan-update";

function task(id: string, minutes: number): TaskInput {
  return {
    id,
    story: `produce observable delivery state for ${id}`,
    writes: [`src/${id.toLowerCase()}.ts`],
    predictedActiveMinutes: minutes,
    predictedCredits: 1,
    how: `implement src/${id.toLowerCase()}.ts through the forecast fixture`,
    red: "bun run agent:test:backend -- test/delivery-forecast.test.ts",
  };
}

function stage(
  id: string,
  taskInput: TaskInput,
  depends: readonly string[],
  parallelWith: readonly string[],
): StageInput {
  return {
    id,
    deliveryId: "D1",
    title: `Forecast ${id}`,
    owner: "core-agent",
    profile: "strong",
    depends,
    parallelWith,
    writes: taskInput.writes,
    tempRoot: `.tmp/code-production/forecast/${id}`,
    predictedActiveMinutes: taskInput.predictedActiveMinutes,
    predictedCredits: taskInput.predictedCredits,
    tasks: [taskInput],
    criteria: ["`true` exits 0 — forecast is deterministic", "Commit"],
  };
}

function forecastPlan(): string {
  let body = createDraftPlan("Forecast fixture");
  body = lockPlanSpec(body, "owner").body;
  body = putDelivery(body, {
    id: "D1",
    title: "Forecast delivery",
    branch: "feat/forecast",
    depends: [],
    gate: ["scripts"],
    active: true,
    stageGraph: "D1-S1 -> (D1-S2 || D1-S3) -> D1-S4",
  }).body;
  body = putStage(body, stage("D1-S1", task("ETA_001", 20), [], [])).body;
  body = putStage(body, stage("D1-S2", task("ETA_002", 30), ["D1-S1"], ["D1-S3"])).body;
  body = putStage(body, stage("D1-S3", task("ETA_003", 10), ["D1-S1"], ["D1-S2"])).body;
  body = putStage(body, stage("D1-S4", task("ETA_004", 15), ["D1-S2", "D1-S3"], [])).body;
  return approvePlan(body, "owner").body.replace("- [ ] ETA_001", "- [x] ETA_001");
}

describe("delivery forecast", () => {
  /**
   * @test-id: tst_unit_planctl_eta_001
   * @scenario: scn_planctl_eta_001
   * @covers: planctl/src/core/delivery-forecast.ts::forecastDelivery
   * @deterministic: yes
   * @fixtures: fixed dependency DAG, active timing and completed calibration samples
   *
   * Test environment: pure forecast projection with injected UTC time
   * Clients: direct calls
   * Mocks: none
   * Data: one completed Task, two parallel branches and one join Stage
   */
  it("tst_unit_planctl_eta_001 uses calibrated critical path and nulls owner-blocked calendar ETA", () => {
    const input = {
      now: "2026-08-29T00:00:00.000Z",
      activeTasks: [{ taskId: "ETA_002", state: "working" as const, elapsedActiveMinutes: 10 }],
      completedTaskSamples: [
        { predictedActiveMinutes: 10, actualActiveMinutes: 20 },
        { predictedActiveMinutes: 20, actualActiveMinutes: 30 },
        { predictedActiveMinutes: 10, actualActiveMinutes: 10 },
      ],
    };

    const forecast = forecastDelivery(forecastPlan(), input);

    expect(forecast.remainingActiveMinutes).toBe(45);
    expect(forecast.remainingCriticalPathMinutes).toBe(35);
    expect(forecast.calibratedCriticalPathMinutes).toBe(57.5);
    expect(forecast.estimatedDeliveryAt).toBe("2026-08-29T00:57:30.000Z");
    expect(forecast.calibration).toEqual({ factor: 1.5, completedTaskSamples: 3, confidence: "medium" });
    expect(forecast.blockedByOwner).toBe(0);

    const waiting = forecastDelivery(forecastPlan(), {
      ...input,
      activeTasks: [{ taskId: "ETA_002", state: "awaiting_owner", elapsedActiveMinutes: 10 }],
    });
    expect(waiting.estimatedDeliveryAt).toBeNull();
    expect(waiting.blockedByOwner).toBe(1);
  });
});
