import { afterEach, describe, expect, it } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NestFactory } from "@nestjs/core";

import { MachineAppModule } from "../src/machine/app.module";
import { CollectorService } from "../src/machine/collector.service";
import { MachineStore } from "../src/machine/state/machine-store";
import { ServerClient } from "../src/machine/transport/server-client";

import type {
  CollectorClock,
  CollectorObservationSource,
  CollectorScheduler,
  CollectorTransport,
  MachineObservation,
} from "../src/machine/collector.service";
import type { MachineSnapshot } from "../src/core/snapshot-protocol";
import type { MachineConfig } from "../src/config/config";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "planctld-collector-"));
  roots.push(root);
  return root;
}

class FakeClock implements CollectorClock {
  #now = new Date("2026-08-29T12:00:00.000Z");

  now(): Date {
    return new Date(this.#now);
  }

  advance(milliseconds: number): void {
    this.#now = new Date(this.#now.getTime() + milliseconds);
  }
}

class FakeScheduler implements CollectorScheduler {
  intervalMs: number | null = null;
  task: (() => void) | null = null;

  every(milliseconds: number, task: () => void): object {
    this.intervalMs = milliseconds;
    this.task = task;
    return {};
  }

  cancel(): void {
    this.task = null;
  }
}

class ChangingSource implements CollectorObservationSource {
  scans = 0;

  scan(now: Date): MachineObservation {
    this.scans += 1;
    return {
      agents: [{
        agentId: "codex:session-1",
        provider: "codex",
        state: "working",
        repositoryId: "repo-1",
        worktree: "/work/repo",
        branch: "feat/one",
        planId: "repo-1:docs/plans/one.md",
        planRevision: "a".repeat(64),
        taskId: "ONE_001",
        lastActivityAt: now.toISOString(),
        idleSeconds: 0,
        elapsedActiveMinutes: this.scans,
        ownerWaitReason: null,
        ownerWaitStartedAt: null,
      }],
      plans: [],
      sourceIssues: [],
    };
  }
}

class ScriptedTransport implements CollectorTransport {
  available = false;
  readonly snapshots: MachineSnapshot[] = [];
  heartbeats = 0;

  async sendSnapshot(snapshot: MachineSnapshot): Promise<void> {
    this.snapshots.push(snapshot);
    if (!this.available) throw new Error("scripted unavailable server");
  }

  async sendHeartbeat(): Promise<void> {
    this.heartbeats += 1;
    if (!this.available) throw new Error("scripted unavailable server");
  }
}

describe("planctld scheduled collector", () => {
  /**
   * @test-id: tst_svc_planctld_connect_timeout_001
   * @scenario: scn_planctld_connect_timeout_001
   * @covers: planctl/src/machine/app.module.ts::MachineAppModule.register
   * @covers: planctl/src/machine/transport/server-client.ts::ServerClient
   * @deterministic: yes
   * @fixtures: mode-0600 token and fetch boundary that never establishes a connection
   */
  it("tst_svc_planctld_connect_timeout_001 aborts connection establishment before the request deadline", async () => {
    const root = temporaryRoot();
    const envFile = join(root, ".env");
    writeFileSync(envFile, "PLANCTL_MACHINE_TOKEN=fixture-bearer-token\n", { mode: 0o600 });
    chmodSync(envFile, 0o600);
    const config: MachineConfig = {
      role: "machine",
      version: 1,
      machineId: "machine-a",
      repositoryIds: {},
      server: {
        url: "https://planctl.example.test",
        envFile,
        connectTimeoutMs: 5,
        requestTimeoutMs: 500,
      },
      collector: {
        scanSeconds: 5,
        heartbeatSeconds: 15,
        staleAfterSeconds: 900,
        sessionLookbackDays: 7,
        stateDb: join(root, "machine.sqlite"),
        watchRoots: [root],
        codexSessions: join(root, "codex"),
        claudeSessions: join(root, "claude"),
      },
    };
    let abortReason = "";
    const app = await NestFactory.createApplicationContext(MachineAppModule.register(
      config,
      (request) => new Promise((_resolve, reject) => {
        const aborted = (): void => reject(request.signal.reason);
        const recordReason = (): void => {
          abortReason = request.signal.reason instanceof Error ? request.signal.reason.message : String(request.signal.reason);
          aborted();
        };
        if (request.signal.aborted) recordReason();
        else request.signal.addEventListener("abort", recordReason, { once: true });
      }),
    ), { logger: false });
    try {
      const health = await app.get(CollectorService).collectOnce();
      expect(health.status).toBe("degraded");
      expect(abortReason).toContain("connection timeout");
    } finally {
      await app.close();
    }
  });

  /**
   * @test-id: tst_svc_planctld_collector_001
   * @scenario: scn_planctld_collector_001
   * @covers: planctl/src/machine/collector.service.ts::CollectorService
   * @covers: planctl/src/machine/transport/server-client.ts::ServerClient
   * @deterministic: yes
   * @fixtures: temporary SQLite database, mode-0600 token and scripted transport
   *
   * Test environment: direct Nest service with fake clock/scheduler and real SQLite outbox
   * Clients: direct calls and injected fetch function
   * Mocks: scripted observation source and transport
   * Data: twenty disconnected changing observations followed by reconnect
   */
  it("tst_svc_planctld_collector_001 coalesces in the background, reconnects, and sends bounded authenticated requests", async () => {
    const root = temporaryRoot();
    const clock = new FakeClock();
    const scheduler = new FakeScheduler();
    const source = new ChangingSource();
    const transport = new ScriptedTransport();
    const store = new MachineStore(join(root, "machine.sqlite"));
    const collector = new CollectorService({
      machineId: "machine-a",
      scanMs: 5_000,
      heartbeatMs: 15_000,
      store,
      source,
      transport,
      clock,
      scheduler,
    });
    collector.start();
    expect(scheduler.intervalMs).toBe(5_000);

    for (let scan = 0; scan < 20; scan += 1) await collector.collectOnce();
    expect(source.scans).toBe(20);
    expect(store.outboxCount()).toBe(1);
    expect(transport.snapshots).toHaveLength(1);
    expect(collector.health().status).toBe("degraded");

    transport.available = true;
    clock.advance(60_000);
    await collector.collectOnce();
    expect(store.outboxCount()).toBe(0);
    expect(transport.snapshots.at(-1)?.agents[0]?.elapsedActiveMinutes).toBe(21);
    expect(collector.health().status).toBe("healthy");

    await collector.collectOnce();
    expect(transport.snapshots.at(-1)?.agents[0]?.elapsedActiveMinutes).toBe(22);
    clock.advance(15_000);
    const stableObservation = transport.snapshots.at(-1);
    if (stableObservation === undefined) throw new Error("fixture snapshot is missing");
    const stableSource: CollectorObservationSource = {
      scan: () => ({ agents: stableObservation.agents, plans: stableObservation.plans, sourceIssues: [] }),
    };
    const heartbeatCollector = new CollectorService({
      machineId: "machine-a",
      scanMs: 5_000,
      heartbeatMs: 15_000,
      store,
      source: stableSource,
      transport,
      clock,
      scheduler,
    });
    await heartbeatCollector.collectOnce();
    clock.advance(15_000);
    await heartbeatCollector.collectOnce();
    expect(transport.heartbeats).toBe(1);
    heartbeatCollector.stop();
    collector.stop();

    const requests: Request[] = [];
    const client = new ServerClient({
      machineId: "machine-a",
      baseUrl: "https://planctl.example.test",
      token: "fixture-bearer-token",
      connectTimeoutMs: 100,
      requestTimeoutMs: 500,
      fetch: (request) => {
        requests.push(request);
        return Promise.resolve(new Response(JSON.stringify({
          machineId: "machine-a",
          sequence: stableObservation.heartbeat.sequence,
          snapshotHash: stableObservation.heartbeat.snapshotHash,
        }), { status: 200, headers: { "content-type": "application/json" } }));
      },
    });
    await client.sendSnapshot(stableObservation);
    expect(requests[0]?.url).toBe("https://planctl.example.test/v1/machines/machine-a/snapshots");
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer fixture-bearer-token");
    const requestBody = await requests[0]?.clone().text();
    expect(requestBody).toContain('"kind":"snapshot"');
    expect(requestBody).not.toContain("fixture-bearer-token");
    await client.sendHeartbeat(stableObservation.heartbeat);
    expect(requests[1]?.url).toBe("https://planctl.example.test/v1/machines/machine-a/snapshots");
    expect(await requests[1]?.clone().text()).toContain('"kind":"heartbeat"');
    store.close();
  });
});
