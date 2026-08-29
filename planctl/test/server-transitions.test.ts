import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NestFactory } from "@nestjs/core";

import { MachineAdminService } from "../src/server/admin/machine-admin.service";
import { ServerAppModule } from "../src/server/app.module";
import { IngestService } from "../src/server/ingest/ingest.service";
import { ServerStore } from "../src/server/persistence/server-store";
import { TransitionService } from "../src/server/transitions/transition.service";

import type { INestApplicationContext } from "@nestjs/common";
import type { AgentSnapshot, MachineSnapshot } from "../src/core/snapshot-protocol";

const roots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "planctl-server-transitions-"));
  roots.push(root);
  mkdirSync(join(root, "state"), { recursive: true });
  return root;
}

function agent(
  agentId: string,
  state: AgentSnapshot["state"],
  planRevision: string | null,
): AgentSnapshot {
  return {
    agentId,
    provider: "codex",
    state,
    repositoryId: planRevision === null ? null : "0xmikko/0_agents",
    worktree: `/work/${agentId.replace(":", "-")}`,
    branch: planRevision === null ? null : "feat/example",
    planId: planRevision === null ? null : "0xmikko/0_agents:docs/plans/example.md",
    planRevision,
    taskId: state === "unassigned" ? null : "PLAN_001",
    lastActivityAt: "2026-08-29T00:00:00.000Z",
    idleSeconds: state === "stale" ? 900 : 0,
    elapsedActiveMinutes: state === "unassigned" ? null : 10,
    ownerWaitReason: state === "awaiting_owner" ? "Choose the deployment host" : null,
  };
}

function progress(planRevision: string): MachineSnapshot["plans"][number] {
  return {
    planId: "0xmikko/0_agents:docs/plans/example.md",
    planRevision,
    goal: "Ship distributed plan tracking",
    progress: {
      deliveryId: "D1",
      tasks: { completed: 0, total: 1 },
      activeMinutes: { completed: 0, remaining: 20, total: 20 },
      credits: { completed: 0, remaining: 5, total: 5 },
      completionPercent: 0,
      stages: [{
        id: "D1-S1",
        depends: [],
        parallelWith: [],
        tasks: { completed: 0, total: 1 },
        activeMinutes: { completed: 0, remaining: 20, total: 20 },
        credits: { completed: 0, remaining: 5, total: 5 },
        completionPercent: 0,
      }],
    },
  };
}

function snapshot(
  machineId: string,
  sequence: number,
  observedAt: string,
  agents: readonly AgentSnapshot[],
  revision: string,
): MachineSnapshot {
  return {
    heartbeat: {
      protocolVersion: 1,
      machineId,
      sequence,
      observedAt,
      snapshotHash: `${machineId === "machine-a" ? "a" : "b"}${sequence}`.padEnd(64, "0"),
    },
    agents,
    plans: [progress(revision)],
  };
}

async function server(root: string, clock: { value: string }): Promise<INestApplicationContext> {
  return await NestFactory.createApplicationContext(ServerAppModule.register({
    databasePath: join(root, "state/server.sqlite"),
    machineOfflineAfterSeconds: 60,
    transitionScanMs: null,
    now: () => clock.value,
  }), { logger: false });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("persisted attention transitions", () => {
  /**
   * @test-id: tst_svc_planctl_transitions_001
   * @scenario: scn_planctl_transitions_001
   * @covers: planctl/src/server/transitions/transition.service.ts::TransitionService.evaluate
   * @covers: planctl/src/server/persistence/server-store.ts::ServerStore.changeObservedState
   * @deterministic: yes
   * @fixtures: temporary SQLite WAL and two fixed machine snapshots
   *
   * Test environment: real Nest services and temporary persistence
   * Clients: direct service calls
   * Mocks: injected mutable clock only
   * Data: offline threshold boundary, explicit agent states and conflicting plan revisions
   */
  it("tst_svc_planctl_transitions_001 records distinct attention and recovery edges once", async () => {
    const root = fixtureRoot();
    const clock = { value: "2026-08-29T00:00:00.000Z" };
    const app = await server(root, clock);
    try {
      const admin = app.get(MachineAdminService);
      const ingest = app.get(IngestService);
      const transitions = app.get(TransitionService);
      const store = app.get(ServerStore);
      admin.registerMachine("machine-a", "fixture-machine-a-token");
      admin.registerMachine("machine-b", "fixture-machine-b-token");
      const canonicalRevision = "a".repeat(64);
      const driftRevision = "b".repeat(64);

      ingest.accept("machine-a", { kind: "snapshot", snapshot: snapshot("machine-a", 1, clock.value, [
        agent("codex:stale", "stale", canonicalRevision),
        agent("codex:waiting", "awaiting_owner", canonicalRevision),
        agent("codex:unassigned", "unassigned", null),
      ], canonicalRevision) }, "machine-a");
      ingest.accept("machine-b", { kind: "snapshot", snapshot: snapshot("machine-b", 1, clock.value, [
        agent("codex:working", "working", driftRevision),
      ], driftRevision) }, "machine-b");
      transitions.evaluate();

      expect(store.transitions().map((event) => event.kind)).toEqual([
        "stale",
        "owner_wait",
        "unassigned",
        "plan_drift",
      ]);
      expect(store.canonicalPlans()[0]?.planRevision).toBe(canonicalRevision);

      clock.value = "2026-08-29T00:01:00.000Z";
      transitions.evaluate();
      transitions.evaluate();
      expect(store.transitions().filter((event) => event.kind === "machine_offline")).toHaveLength(2);
      expect(store.agentObservations().find((entry) => entry.agentId === "codex:stale")?.state).toBe("stale");
      expect(store.agentObservations().every((entry) => entry.machineState === "offline")).toBeTrue();

      clock.value = "2026-08-29T00:01:10.000Z";
      const recoveredAgents = [
        agent("codex:stale", "working", canonicalRevision),
        agent("codex:waiting", "working", canonicalRevision),
        agent("codex:unassigned", "working", canonicalRevision),
      ];
      ingest.accept("machine-a", {
        kind: "snapshot",
        snapshot: snapshot("machine-a", 2, clock.value, recoveredAgents, canonicalRevision),
      }, "machine-a");
      ingest.accept("machine-b", { kind: "snapshot", snapshot: snapshot("machine-b", 2, clock.value, [
        agent("codex:working", "working", canonicalRevision),
      ], canonicalRevision) }, "machine-b");
      transitions.evaluate();
      transitions.evaluate();

      const events = store.transitions();
      expect(events.filter((event) => event.kind === "recovery")).toHaveLength(5);
      expect(events).toHaveLength(11);
      expect(new Set(events.map((event) => event.transitionKey)).size).toBe(events.length);
      expect(events.find((event) => event.kind === "owner_wait")?.detail).toEqual({
        ownerWaitReason: "Choose the deployment host",
        state: "awaiting_owner",
      });
    } finally {
      await app.close();
    }
  });
});
