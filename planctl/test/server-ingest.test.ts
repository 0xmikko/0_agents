import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NestFactory } from "@nestjs/core";
import { HTTP_CODE_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import { SNAPSHOT_PROTOCOL_VERSION } from "../src/core/snapshot-protocol";
import { MachineAdminService } from "../src/server/admin/machine-admin.service";
import { ServerAppModule } from "../src/server/app.module";
import { MachineAuthGuard } from "../src/server/auth/machine-auth.guard";
import { IngestController } from "../src/server/ingest/ingest.controller";
import { ServerStore } from "../src/server/persistence/server-store";
import { ProgressService } from "../src/server/progress/progress.service";

import type { INestApplicationContext } from "@nestjs/common";

const roots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "planctl-server-ingest-"));
  roots.push(root);
  mkdirSync(join(root, "state"), { recursive: true });
  return root;
}

function snapshot(machineId: string, sequence: number, hash = sequence.toString(16).padStart(64, "0")): unknown {
  return {
    heartbeat: {
      protocolVersion: SNAPSHOT_PROTOCOL_VERSION,
      machineId,
      sequence,
      observedAt: `2026-08-29T00:00:${String(sequence).padStart(2, "0")}.000Z`,
      snapshotHash: hash,
    },
    agents: [{
      agentId: "codex:session-1",
      provider: "codex",
      state: "working",
      repositoryId: "0xmikko/0_agents",
      worktree: "/work/0_agents/.worktrees/example",
      branch: "feat/example",
      planId: null,
      planRevision: null,
      taskId: null,
      lastActivityAt: "2026-08-29T00:00:00.000Z",
      idleSeconds: 1,
      elapsedActiveMinutes: null,
      ownerWaitReason: null,
      ownerWaitStartedAt: null,
    }],
    plans: [],
  };
}

function snapshotRequest(machineId: string, sequence: number, hash?: string): unknown {
  return { kind: "snapshot", snapshot: snapshot(machineId, sequence, hash) };
}

function heartbeatRequest(machineId: string, sequence: number, snapshotHash: string): unknown {
  return {
    kind: "heartbeat",
    heartbeat: {
      protocolVersion: SNAPSHOT_PROTOCOL_VERSION,
      machineId,
      sequence,
      observedAt: `2026-08-29T00:00:${String(sequence).padStart(2, "0")}.000Z`,
      snapshotHash,
    },
  };
}

async function server(root: string): Promise<INestApplicationContext> {
  return await NestFactory.createApplicationContext(ServerAppModule.register({
    databasePath: join(root, "state/server.sqlite"),
    machineOfflineAfterSeconds: 60,
    transitionScanMs: null,
    now: () => "2026-08-29T00:01:00.000Z",
  }), { logger: false });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("authenticated snapshot ingest", () => {
  /**
   * @test-id: tst_int_planctl_calibration_001
   * @scenario: scn_planctl_calibration_001
   * @covers: planctl/src/server/persistence/server-store.ts::ServerStore.acceptSnapshot
   * @deterministic: yes
   * @fixtures: two monotonic snapshots carrying one stable completed-work sample
   */
  it("tst_int_planctl_calibration_001 ingests completed forecast evidence idempotently", async () => {
    const root = fixtureRoot();
    const app = await server(root);
    try {
      const admin = app.get(MachineAdminService);
      const controller = app.get(IngestController);
      const store = app.get(ServerStore);
      admin.registerMachine("machine-a", "fixture-bearer-secret");
      const request = { headers: {}, params: {}, machineSubject: "machine-a" };
      const calibrated = (sequence: number): unknown => ({
        kind: "snapshot",
        snapshot: {
          ...(snapshot("machine-a", sequence) as Readonly<Record<string, unknown>>),
          plans: [{
            planId: "fixture/repository:docs/plans/example.md",
            planRevision: "a".repeat(64),
            goal: "Calibrate delivery evidence",
            progress: {
              deliveryId: "D1",
              tasks: { completed: 1, total: 2 },
              activeMinutes: { completed: 10, remaining: 10, total: 20 },
              credits: { completed: 1, remaining: 1, total: 2 },
              completionPercent: 50,
              stages: [{
                id: "D1-S1", depends: [], parallelWith: [],
                tasks: { completed: 1, total: 2 },
                activeMinutes: { completed: 10, remaining: 10, total: 20 },
                credits: { completed: 1, remaining: 1, total: 2 },
                completionPercent: 50,
              }],
            },
            completedTaskSamples: [{
              sampleId: "D1-S1:a1b2c3d",
              predictedActiveMinutes: 10,
              actualActiveMinutes: 20,
              completedAt: "2026-08-29T00:00:00.000Z",
            }, {
              sampleId: "D1-S2:a1b2c3e",
              predictedActiveMinutes: 20,
              actualActiveMinutes: 30,
              completedAt: "2026-08-29T00:01:00.000Z",
            }, {
              sampleId: "D1-S3:a1b2c3f",
              predictedActiveMinutes: 10,
              actualActiveMinutes: 10,
              completedAt: "2026-08-29T00:02:00.000Z",
            }],
          }],
        },
      });
      controller.accept("machine-a", calibrated(1), request);
      controller.accept("machine-a", calibrated(2), request);
      expect(store.calibrationSamples("fixture/repository")).toEqual([{
        predictedActiveMinutes: 10,
        actualActiveMinutes: 20,
      }, {
        predictedActiveMinutes: 20,
        actualActiveMinutes: 30,
      }, {
        predictedActiveMinutes: 10,
        actualActiveMinutes: 10,
      }]);
      expect(app.get(ProgressService).plan("fixture/repository:docs/plans/example.md")?.calibration).toEqual({
        factor: 1.5,
        completedTaskSamples: 3,
        confidence: "medium",
      });
    } finally {
      await app.close();
    }
  });

  /**
   * @test-id: tst_int_planctl_ingest_001
   * @scenario: scn_planctl_ingest_001
   * @covers: planctl/src/server/auth/machine-auth.guard.ts::MachineAuthGuard.authorize
   * @covers: planctl/src/server/ingest/ingest.service.ts::IngestService.accept
   * @covers: planctl/src/server/persistence/server-store.ts::ServerStore.acceptSnapshot
   * @deterministic: yes
   * @fixtures: temporary SQLite WAL and inline protocol-version-1 snapshots
   *
   * Test environment: real Nest application context over temporary bun:sqlite
   * Clients: direct in-process HTTP controller call
   * Mocks: none
   * Data: fixed bearer token, machine identity, sequences, hashes and receipt clock
   */
  it("tst_int_planctl_ingest_001 authenticates identity and persists each monotonic snapshot exactly once", async () => {
    const root = fixtureRoot();
    const app = await server(root);
    try {
      const admin = app.get(MachineAdminService);
      const guard = app.get(MachineAuthGuard);
      const controller = app.get(IngestController);
      const store = app.get(ServerStore);
      admin.registerMachine("machine-a", "fixture-bearer-secret");

      expect(Reflect.getMetadata(PATH_METADATA, IngestController.prototype.accept)).toBe(":machineId/snapshots");
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, IngestController.prototype.accept)).toBe(200);

      expect(guard.authorize("machine-a", "Bearer fixture-bearer-secret")).toBe("machine-a");
      expect(() => guard.authorize("machine-b", "Bearer fixture-bearer-secret")).toThrow("identity");
      expect(() => guard.authorize("machine-a", "Bearer wrong-secret")).toThrow("credential");

      const request = { headers: {}, params: {}, machineSubject: "machine-a" };
      const accepted = controller.accept("machine-a", snapshotRequest("machine-a", 1), request);
      expect(accepted).toEqual({
        machineId: "machine-a",
        sequence: 1,
        snapshotHash: "1".padStart(64, "0"),
      });
      expect(store.journalMode()).toBe("wal");
      expect(store.latestSnapshot("machine-a")?.receivedAt).toBe("2026-08-29T00:01:00.000Z");
      expect(readFileSync(join(root, "state/server.sqlite"))).not.toContain("fixture-bearer-secret");

      expect(() => controller.accept("machine-a", snapshotRequest("machine-a", 1), request)).toThrow("sequence");
      expect(() => controller.accept("machine-a", snapshotRequest("machine-a", 0), request)).toThrow("sequence");

      const heartbeat = controller.accept(
        "machine-a",
        heartbeatRequest("machine-a", 2, "1".padStart(64, "0")),
        request,
      );
      expect(heartbeat).toEqual({
        machineId: "machine-a",
        sequence: 2,
        snapshotHash: "1".padStart(64, "0"),
      });
      expect(store.latestSnapshot("machine-a")?.snapshot.agents).toHaveLength(1);
      expect(() => controller.accept(
        "machine-a",
        heartbeatRequest("machine-a", 3, "f".repeat(64)),
        request,
      )).toThrow("does not match");
      expect(() => controller.accept("machine-a", snapshotRequest("machine-a", 3, "1".padStart(64, "0")), request))
        .toThrow("replayed");
      expect(controller.accept("machine-a", snapshotRequest("machine-a", 3), request).sequence).toBe(3);
      expect(() => controller.accept("machine-b", snapshotRequest("machine-b", 4), request)).toThrow("identity");
      expect(() => controller.accept("machine-a", {
        kind: "snapshot",
        snapshot: {
          ...(snapshot("machine-a", 4) as Readonly<Record<string, unknown>>),
          heartbeat: {
            ...((snapshot("machine-a", 4) as Readonly<Record<string, unknown>>).heartbeat as Readonly<Record<string, unknown>>),
            protocolVersion: 2,
          },
        },
      }, request)).toThrow("protocolVersion");
      expect(store.snapshotCount("machine-a")).toBe(2);
    } finally {
      await app.close();
    }

    const restarted = await server(root);
    try {
      expect(restarted.get(ServerStore).latestSnapshot("machine-a")?.sequence).toBe(3);
    } finally {
      await restarted.close();
    }
  });
});
