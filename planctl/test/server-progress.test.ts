import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NestFactory } from "@nestjs/core";

import { MachineAdminService } from "../src/server/admin/machine-admin.service";
import { ServerAppModule } from "../src/server/app.module";
import { IngestService } from "../src/server/ingest/ingest.service";
import { ServerStore } from "../src/server/persistence/server-store";
import { ProgressController } from "../src/server/progress/progress.controller";
import { TransitionService } from "../src/server/transitions/transition.service";

import type { INestApplicationContext } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import type { AddressInfo } from "node:net";
import type { AgentSnapshot, MachineSnapshot, ReportedPlanProgress } from "../src/core/snapshot-protocol";

const PLAN_ID = "0xmikko/0_agents:docs/plans/example.md";
const CANONICAL_REVISION = "a".repeat(64);
const DRIFT_REVISION = "b".repeat(64);
const roots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "planctl-server-progress-"));
  roots.push(root);
  mkdirSync(join(root, "state"), { recursive: true });
  return root;
}

function plan(planRevision: string): ReportedPlanProgress {
  return {
    planId: PLAN_ID,
    planRevision,
    goal: "Ship trustworthy distributed tracking",
    completedTaskSamples: [],
    progress: {
      deliveryId: "D1",
      tasks: { completed: 1, total: 4 },
      activeMinutes: { completed: 20, remaining: 55, total: 75 },
      credits: { completed: 5, remaining: 15, total: 20 },
      completionPercent: 20 / 75 * 100,
      stages: [{
        id: "D1-S1",
        depends: [],
        parallelWith: [],
        tasks: { completed: 1, total: 1 },
        activeMinutes: { completed: 20, remaining: 0, total: 20 },
        credits: { completed: 5, remaining: 0, total: 5 },
        completionPercent: 100,
        remainingTasks: [],
      }, {
        id: "D1-S2",
        depends: ["D1-S1"],
        parallelWith: ["D1-S3"],
        tasks: { completed: 0, total: 1 },
        activeMinutes: { completed: 0, remaining: 30, total: 30 },
        credits: { completed: 0, remaining: 6, total: 6 },
        completionPercent: 0,
        remainingTasks: [{ taskId: "PLAN_002", predictedActiveMinutes: 30 }],
      }, {
        id: "D1-S3",
        depends: ["D1-S1"],
        parallelWith: ["D1-S2"],
        tasks: { completed: 0, total: 1 },
        activeMinutes: { completed: 0, remaining: 10, total: 10 },
        credits: { completed: 0, remaining: 3, total: 3 },
        completionPercent: 0,
        remainingTasks: [{ taskId: "PLAN_003", predictedActiveMinutes: 10 }],
      }, {
        id: "D1-S4",
        depends: ["D1-S2", "D1-S3"],
        parallelWith: [],
        tasks: { completed: 0, total: 1 },
        activeMinutes: { completed: 0, remaining: 15, total: 15 },
        credits: { completed: 0, remaining: 6, total: 6 },
        completionPercent: 0,
        remainingTasks: [{ taskId: "PLAN_004", predictedActiveMinutes: 15 }],
      }],
    },
  };
}

function agent(
  agentId: string,
  state: AgentSnapshot["state"],
  planRevision: string,
  taskId: string,
): AgentSnapshot {
  return {
    agentId,
    provider: "codex",
    state,
    repositoryId: "0xmikko/0_agents",
    worktree: `/work/${agentId.replace(":", "-")}`,
    branch: "feat/example",
    planId: PLAN_ID,
    planRevision,
    taskId,
    lastActivityAt: "2026-08-29T00:00:00.000Z",
    idleSeconds: state === "stale" ? 900 : 0,
    elapsedActiveMinutes: 10,
    ownerWaitReason: state === "awaiting_owner" ? "Approve the production host" : null,
    ownerWaitStartedAt: state === "awaiting_owner" ? "2026-08-28T23:55:00.000Z" : null,
  };
}

function snapshot(
  machineId: string,
  sequence: number,
  agents: readonly AgentSnapshot[],
  revision: string,
): MachineSnapshot {
  return {
    heartbeat: {
      protocolVersion: 1,
      machineId,
      sequence,
      observedAt: "2026-08-29T00:00:00.000Z",
      snapshotHash: `${machineId === "machine-a" ? "a" : machineId === "machine-b" ? "b" : "c"}${sequence}`
        .padEnd(64, "0"),
    },
    agents,
    plans: [plan(revision)],
  };
}

async function server(root: string, clock: { value: string }): Promise<INestApplicationContext> {
  return await NestFactory.createApplicationContext(ServerAppModule.register({
    databasePath: join(root, "state/server.sqlite"),
    machineOfflineAfterSeconds: 60,
    historyRetentionDays: 90,
    transitionScanMs: null,
    now: () => clock.value,
  }), { logger: false });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("central progress read model", () => {
  /**
   * @test-id: tst_int_planctl_progress_auth_001
   * @scenario: scn_planctl_progress_auth_001
   * @covers: planctl/src/server/auth/progress-auth.guard.ts::ProgressAuthGuard
   * @deterministic: yes
   * @fixtures: temporary SQLite and one enrolled machine credential
   */
  it("tst_int_planctl_progress_auth_001 protects HTTP progress with machine identity and bearer auth", async () => {
    const root = fixtureRoot();
    const app: INestApplication = await NestFactory.create(ServerAppModule.register({
      databasePath: join(root, "state/server.sqlite"),
      machineOfflineAfterSeconds: 60,
      historyRetentionDays: 90,
      transitionScanMs: null,
      now: () => "2026-08-30T00:00:00.000Z",
    }), { logger: false });
    try {
      app.get(MachineAdminService).registerMachine("machine-a", "fixture-progress-token");
      await app.listen(0, "127.0.0.1");
      const address = app.getHttpServer().address() as AddressInfo;
      const url = `http://127.0.0.1:${address.port}/v1/progress`;
      expect((await fetch(url)).status).toBe(401);
      expect((await fetch(url, {
        headers: { authorization: "Bearer wrong", "x-planctl-machine-id": "machine-a" },
      })).status).toBe(401);
      const accepted = await fetch(url, {
        headers: { authorization: "Bearer fixture-progress-token", "x-planctl-machine-id": "machine-a" },
      });
      expect(accepted.status).toBe(200);
      expect(await accepted.json()).toEqual({
        generatedAt: "2026-08-30T00:00:00.000Z",
        plans: [],
        agents: [],
      });
    } finally {
      await app.close();
    }
  });

  /**
   * @test-id: tst_int_planctl_active_eta_001
   * @scenario: scn_planctl_active_eta_001
   * @covers: planctl/src/server/progress/progress.service.ts::ProgressService.portfolio
   * @invariant: CTL-005 active Task elapsed time reduces raw and calibrated critical-path forecasts exactly once
   * @deterministic: yes
   * @fixtures: temporary SQLite, one active Task and three fixed calibration samples
   */
  it("tst_int_planctl_active_eta_001 subtracts active Task elapsed time from server forecasts", async () => {
    const root = fixtureRoot();
    const clock = { value: "2026-08-29T00:00:00.000Z" };
    const app = await server(root, clock);
    try {
      const admin = app.get(MachineAdminService);
      const ingest = app.get(IngestService);
      const store = app.get(ServerStore);
      const controller = app.get(ProgressController);
      admin.registerMachine("machine-a", "fixture-token-for-machine-a");
      ingest.accept("machine-a", { kind: "snapshot", snapshot: snapshot("machine-a", 1, [
        agent("codex:active", "working", CANONICAL_REVISION, "PLAN_002"),
      ], CANONICAL_REVISION) }, "machine-a");
      store.recordCalibrationSample("0xmikko/0_agents", "sample-1", 10, 20, clock.value);
      store.recordCalibrationSample("0xmikko/0_agents", "sample-2", 20, 30, clock.value);
      store.recordCalibrationSample("0xmikko/0_agents", "sample-3", 10, 10, clock.value);

      const view = controller.portfolio().plans[0];
      if (view === undefined) throw new Error("fixture plan is missing");
      expect(view.activeMinutes.remaining).toBe(55);
      expect(view.remainingActiveMinutes).toBe(45);
      expect(view.criticalPathMinutes).toBe(35);
      expect(view.calibratedCriticalPathMinutes).toBe(57.5);
      expect(view.estimatedDeliveryAt).toBe("2026-08-29T00:57:30.000Z");
    } finally {
      await app.close();
    }
  });

  /**
   * @test-id: tst_int_planctl_progress_001
   * @scenario: scn_planctl_progress_001
   * @covers: planctl/src/server/progress/progress.service.ts::ProgressService.portfolio
   * @covers: planctl/src/server/progress/progress.controller.ts::ProgressController
   * @deterministic: yes
   * @fixtures: temporary SQLite and a fixed four-Stage dependency DAG
   *
   * Test environment: real Nest services over persisted multi-machine snapshots
   * Clients: direct in-process read controller
   * Mocks: injected clock only
   * Data: canonical/drift revisions, owner wait, stale/offline agents and calibration samples
   */
  it("tst_int_planctl_progress_001 serves exact portfolio and per-plan attention plus calibrated critical path", async () => {
    const root = fixtureRoot();
    const clock = { value: "2026-08-29T00:00:00.000Z" };
    const app = await server(root, clock);
    try {
      const admin = app.get(MachineAdminService);
      const ingest = app.get(IngestService);
      const store = app.get(ServerStore);
      const transitions = app.get(TransitionService);
      const controller = app.get(ProgressController);
      for (const machineId of ["machine-a", "machine-b", "machine-c"]) {
        admin.registerMachine(machineId, `fixture-token-for-${machineId}`);
      }

      ingest.accept("machine-a", { kind: "snapshot", snapshot: snapshot("machine-a", 1, [
        agent("codex:waiting", "awaiting_owner", CANONICAL_REVISION, "PLAN_002"),
        agent("codex:stale", "stale", CANONICAL_REVISION, "PLAN_003"),
      ], CANONICAL_REVISION) }, "machine-a");
      ingest.accept("machine-b", { kind: "snapshot", snapshot: snapshot("machine-b", 1, [
        agent("codex:drift", "working", DRIFT_REVISION, "PLAN_004"),
      ], DRIFT_REVISION) }, "machine-b");
      ingest.accept("machine-c", { kind: "snapshot", snapshot: snapshot("machine-c", 1, [
        agent("codex:offline", "working", CANONICAL_REVISION, "PLAN_002"),
      ], CANONICAL_REVISION) }, "machine-c");
      store.recordCalibrationSample("0xmikko/0_agents", "sample-1", 10, 20, clock.value);
      store.recordCalibrationSample("0xmikko/0_agents", "sample-2", 20, 30, clock.value);
      store.recordCalibrationSample("0xmikko/0_agents", "sample-3", 10, 10, clock.value);

      clock.value = "2026-08-29T00:01:00.000Z";
      transitions.evaluate();
      const portfolio = controller.portfolio();
      expect(portfolio.generatedAt).toBe(clock.value);
      expect(portfolio.plans).toHaveLength(1);
      const view = portfolio.plans[0];
      if (view === undefined) throw new Error("fixture plan is missing");
      expect(view.planId).toBe(PLAN_ID);
      expect(view.planRevision).toBe(CANONICAL_REVISION);
      expect(view.tasks).toEqual({ completed: 1, total: 4 });
      expect(view.activeMinutes).toEqual({ completed: 20, remaining: 55, total: 75 });
      expect(view.remainingActiveMinutes).toBe(35);
      expect(view.criticalPathMinutes).toBe(35);
      expect(view.calibratedCriticalPathMinutes).toBe(57.5);
      expect(view.estimatedDeliveryAt).toBeNull();
      expect(view.calibration).toEqual({ factor: 1.5, completedTaskSamples: 3, confidence: "medium" });
      expect(view.attention).toEqual({
        ownerWait: 1,
        stale: 1,
        unassigned: 0,
        machineOffline: 3,
        planDrift: 1,
      });
      expect(view.activeAgents.map((entry) => entry.state)).toEqual([
        "awaiting_owner",
        "stale",
        "plan_drift",
        "working",
      ]);
      expect(controller.plan(encodeURIComponent(PLAN_ID))).toEqual(view);
      expect(() => controller.plan(encodeURIComponent("missing:docs/plans/missing.md"))).toThrow("not found");
    } finally {
      await app.close();
    }
  });
});
