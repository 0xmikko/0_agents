import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NestFactory } from "@nestjs/core";

import { CollectorService } from "../src/machine/collector.service";
import { MachineStore } from "../src/machine/state/machine-store";
import { ServerClient } from "../src/machine/transport/server-client";
import { MachineAdminService } from "../src/server/admin/machine-admin.service";
import { ServerAppModule } from "../src/server/app.module";
import { MachineAuthGuard } from "../src/server/auth/machine-auth.guard";
import { IngestService } from "../src/server/ingest/ingest.service";
import { ServerStore } from "../src/server/persistence/server-store";
import { ProgressController } from "../src/server/progress/progress.controller";
import { ProgressService } from "../src/server/progress/progress.service";
import { TransitionService } from "../src/server/transitions/transition.service";
import { CommandsService } from "../src/telegram/commands.service";
import { NotifierService } from "../src/telegram/notifier.service";

import type {
  CollectorClock,
  CollectorObservationSource,
  CollectorScheduler,
  MachineObservation,
} from "../src/machine/collector.service";
import type { AgentSnapshot, ReportedPlanProgress } from "../src/core/snapshot-protocol";
import type { TelegramSender, TelegramUpdate } from "../src/telegram/telegram-client";

const PLAN_ID = "0xmikko/0_agents:docs/plans/distributed.md";
const CANONICAL_REVISION = "a".repeat(64);
const DRIFT_REVISION = "b".repeat(64);
const roots: string[] = [];

class FixtureClock implements CollectorClock {
  #value = new Date("2026-08-29T20:00:00.000Z");

  now(): Date {
    return new Date(this.#value);
  }

  iso(): string {
    return this.#value.toISOString();
  }

  advance(milliseconds: number): void {
    this.#value = new Date(this.#value.getTime() + milliseconds);
  }
}

class FixtureScheduler implements CollectorScheduler {
  every(): object {
    return {};
  }

  cancel(): void {}
}

class FixtureSource implements CollectorObservationSource {
  constructor(public observation: MachineObservation) {}

  scan(): MachineObservation {
    return this.observation;
  }
}

class RecordingSender implements TelegramSender {
  readonly messages: string[] = [];

  async sendMessage(_chatId: number, text: string): Promise<void> {
    this.messages.push(text);
  }
}

interface FixtureMachine {
  readonly machineId: string;
  readonly token: string;
  readonly source: FixtureSource;
  readonly store: MachineStore;
  readonly collector: CollectorService;
}

function reportedPlan(revision: string): ReportedPlanProgress {
  return {
    planId: PLAN_ID,
    planRevision: revision,
    goal: "Keep distributed coding agents focused and observable",
    completedTaskSamples: [],
    progress: {
      deliveryId: "D1",
      tasks: { completed: 1, total: 3 },
      activeMinutes: { completed: 20, remaining: 40, total: 60 },
      credits: { completed: 5, remaining: 10, total: 15 },
      completionPercent: 100 / 3,
      stages: [{
        id: "D1-S1",
        depends: [],
        parallelWith: [],
        tasks: { completed: 1, total: 3 },
        activeMinutes: { completed: 20, remaining: 40, total: 60 },
        credits: { completed: 5, remaining: 10, total: 15 },
        completionPercent: 100 / 3,
        remainingTasks: [{
          taskId: "PLAN_002",
          predictedActiveMinutes: 20,
        }, {
          taskId: "PLAN_003",
          predictedActiveMinutes: 20,
        }],
      }],
    },
  };
}

function observedAgent(
  agentId: string,
  state: AgentSnapshot["state"],
  revision: string,
  taskId: string,
): AgentSnapshot {
  return {
    agentId,
    provider: "codex",
    state,
    repositoryId: "0xmikko/0_agents",
    worktree: `/fixture/${agentId.replace(":", "-")}`,
    branch: "feat/distributed",
    planId: PLAN_ID,
    planRevision: revision,
    taskId,
    lastActivityAt: "2026-08-29T19:50:00.000Z",
    idleSeconds: state === "stale" ? 900 : 0,
    elapsedActiveMinutes: 20,
    ownerWaitReason: state === "awaiting_owner" ? "Approve the production hostname" : null,
    ownerWaitStartedAt: state === "awaiting_owner" ? "2026-08-29T19:45:00.000Z" : null,
  };
}

function unboundStaleAgent(): AgentSnapshot {
  return {
    agentId: "claude:unbound-stale",
    provider: "claude",
    state: "stale",
    repositoryId: "0xmikko/0_agents",
    worktree: "/fixture/unbound-stale",
    branch: "feat/unbound",
    planId: null,
    planRevision: null,
    taskId: null,
    lastActivityAt: "2026-08-29T19:40:00.000Z",
    idleSeconds: 1_200,
    elapsedActiveMinutes: null,
    ownerWaitReason: null,
    ownerWaitStartedAt: null,
  };
}

function observation(agent: AgentSnapshot, revision: string): MachineObservation {
  return { agents: [agent], plans: [reportedPlan(revision)], sourceIssues: [] };
}

function command(text: string): TelegramUpdate {
  return { updateId: 1, userId: 101, chatId: 101, text };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("distributed planctl observer", () => {
  /**
   * @test-id: tst_int_planctl_unassigned_visibility_001
   * @scenario: scn_planctl_unassigned_visibility_001
   * @covers: planctl/src/server/progress/progress.service.ts::ProgressService.portfolio
   * @covers: planctl/src/telegram/commands.service.ts::CommandsService.handle
   * @invariant: CTL-004 unbound stale agents remain globally visible without entering plan ETA
   * @deterministic: yes
   * @fixtures: real collector/server SQLite, one bound agent and one unbound stale agent
   */
  it("tst_int_planctl_unassigned_visibility_001 reports unbound stale agents without changing plan ETA", async () => {
    const root = mkdtempSync(join(tmpdir(), "planctl-unassigned-e2e-"));
    roots.push(root);
    mkdirSync(join(root, "server"), { recursive: true });
    const clock = new FixtureClock();
    const app = await NestFactory.createApplicationContext(ServerAppModule.register({
      databasePath: join(root, "server/server.sqlite"),
      machineOfflineAfterSeconds: 60,
      transitionScanMs: null,
      now: () => clock.iso(),
    }), { logger: false });
    const machineStore = new MachineStore(join(root, "machine.sqlite"));
    try {
      const machineId = "machine-a";
      const token = "machine-a-private-token-001";
      const tokenFile = join(root, "machine.token");
      writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
      app.get(MachineAdminService).registerMachine(machineId, token);
      const guard = app.get(MachineAuthGuard);
      const ingest = app.get(IngestService);
      const client = new ServerClient({
        machineId,
        baseUrl: "https://planctl.fixture.test",
        tokenFile,
        requestTimeoutMs: 500,
        fetch: async (request) => {
          const subject = guard.authorize(machineId, request.headers.get("authorization") ?? undefined);
          const acknowledgement = ingest.accept(machineId, JSON.parse(await request.text()), subject);
          return new Response(JSON.stringify(acknowledgement), { status: 200 });
        },
      });
      const collector = new CollectorService({
        machineId,
        scanMs: 5_000,
        heartbeatMs: 15_000,
        store: machineStore,
        source: new FixtureSource({
          agents: [
            observedAgent("codex:bound", "working", CANONICAL_REVISION, "PLAN_002"),
            unboundStaleAgent(),
          ],
          plans: [reportedPlan(CANONICAL_REVISION)],
          sourceIssues: [],
        }),
        transport: client,
        clock,
        scheduler: new FixtureScheduler(),
      });
      expect((await collector.collectOnce()).status).toBe("healthy");
      const progress = app.get(ProgressService);
      const portfolio = progress.portfolio();
      expect(portfolio.plans[0]?.activeAgents).toHaveLength(1);
      expect(portfolio.plans[0]?.criticalPathMinutes).toBe(20);
      const commands = new CommandsService(progress, { allowedUserIds: [101] });
      expect(commands.handle(command("/agents"))).toContain(
        "machine-a · claude:unbound-stale · unassigned · stale",
      );
      expect(commands.handle(command("/stale"))).toContain(
        "STALE machine-a · claude:unbound-stale · unassigned",
      );
    } finally {
      machineStore.close();
      await app.close();
    }
  });

  /**
   * @test-id: tst_int_planctl_distributed_001
   * @scenario: scn_planctl_distributed_001
   * @covers: planctl/src/machine/collector.service.ts::CollectorService
   * @covers: planctl/src/machine/transport/server-client.ts::ServerClient
   * @covers: planctl/src/server/ingest/ingest.service.ts::IngestService.accept
   * @covers: planctl/src/server/progress/progress.service.ts::ProgressService.portfolio
   * @covers: planctl/src/server/transitions/transition.service.ts::TransitionService.evaluate
   * @covers: planctl/src/telegram/commands.service.ts::CommandsService.handle
   * @covers: planctl/src/telegram/notifier.service.ts::NotifierService.deliverPending
   * @deterministic: yes
   * @fixtures: three real SQLite outboxes, real server SQLite, fixed clocks and synthetic privacy-safe observations
   * Test environment: real Nest server context with in-process authenticated HTTP boundary
   * Clients: three machine collectors, progress/attention readers and Telegram owner surface
   * Mocks: outage switch, scheduler and Telegram delivery boundary only
   * Data: owner wait, stale, offline and plan-drift edges followed by complete recovery
   */
  it("tst_int_planctl_distributed_001 recovers three collectors and reports each attention edge without secrets", async () => {
    const root = mkdtempSync(join(tmpdir(), "planctl-distributed-e2e-"));
    roots.push(root);
    mkdirSync(join(root, "server"), { recursive: true });
    const clock = new FixtureClock();
    const app = await NestFactory.createApplicationContext(ServerAppModule.register({
      databasePath: join(root, "server/server.sqlite"),
      machineOfflineAfterSeconds: 60,
      transitionScanMs: null,
      now: () => clock.iso(),
    }), { logger: false });
    const machineStores: MachineStore[] = [];
    try {
      const admin = app.get(MachineAdminService);
      const guard = app.get(MachineAuthGuard);
      const ingest = app.get(IngestService);
      const store = app.get(ServerStore);
      const transitions = app.get(TransitionService);
      const progress = app.get(ProgressController);
      const progressService = app.get(ProgressService);
      let serverAvailable = false;
      const requestBodies: string[] = [];
      const definitions = [
        {
          machineId: "machine-a",
          token: "machine-a-private-token-001",
          value: observation(observedAgent("codex:waiting", "awaiting_owner", CANONICAL_REVISION, "PLAN_002"), CANONICAL_REVISION),
        },
        {
          machineId: "machine-b",
          token: "machine-b-private-token-002",
          value: observation(observedAgent("codex:stale", "stale", CANONICAL_REVISION, "PLAN_003"), CANONICAL_REVISION),
        },
        {
          machineId: "machine-c",
          token: "machine-c-private-token-003",
          value: observation(observedAgent("codex:drift", "working", DRIFT_REVISION, "PLAN_004"), DRIFT_REVISION),
        },
      ] as const;

      const machines: FixtureMachine[] = definitions.map((definition) => {
        admin.registerMachine(definition.machineId, definition.token);
        const machineRoot = join(root, definition.machineId);
        mkdirSync(machineRoot, { recursive: true });
        const tokenFile = join(machineRoot, "machine.token");
        writeFileSync(tokenFile, `${definition.token}\n`, { mode: 0o600 });
        const machineStore = new MachineStore(join(machineRoot, "machine.sqlite"));
        machineStores.push(machineStore);
        const source = new FixtureSource(definition.value);
        const client = new ServerClient({
          machineId: definition.machineId,
          baseUrl: "https://planctl.fixture.test",
          tokenFile,
          requestTimeoutMs: 500,
          fetch: async (request) => {
            if (!serverAvailable) throw new Error("fixture server outage");
            const path = new URL(request.url).pathname;
            const match = /^\/v1\/machines\/([^/]+)\/snapshots$/.exec(path);
            const machineId = match?.[1] === undefined ? "" : decodeURIComponent(match[1]);
            const subject = guard.authorize(machineId, request.headers.get("authorization") ?? undefined);
            const bodyText = await request.text();
            requestBodies.push(bodyText);
            const acknowledgement = ingest.accept(machineId, JSON.parse(bodyText), subject);
            return new Response(JSON.stringify(acknowledgement), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          },
        });
        return {
          machineId: definition.machineId,
          token: definition.token,
          source,
          store: machineStore,
          collector: new CollectorService({
            machineId: definition.machineId,
            scanMs: 5_000,
            heartbeatMs: 15_000,
            store: machineStore,
            source,
            transport: client,
            clock,
            scheduler: new FixtureScheduler(),
          }),
        };
      });

      for (const machine of machines) {
        expect((await machine.collector.collectOnce()).status).toBe("degraded");
        expect(machine.store.outboxCount()).toBe(1);
      }
      expect(store.currentMachines()).toHaveLength(0);

      clock.advance(2_000);
      serverAvailable = true;
      for (const machine of machines) {
        expect((await machine.collector.collectOnce()).status).toBe("healthy");
      }
      expect(store.currentMachines()).toHaveLength(3);
      expect(progress.portfolio().plans[0]?.attention).toEqual({
        ownerWait: 1,
        stale: 1,
        unassigned: 0,
        machineOffline: 0,
        planDrift: 1,
      });
      expect(progress.portfolio().plans[0]?.estimatedDeliveryAt).toBeNull();

      clock.advance(60_000);
      await machines[0]?.collector.collectOnce();
      await machines[1]?.collector.collectOnce();
      transitions.evaluate();
      const attention = progress.portfolio().plans[0]?.attention;
      expect(attention).toEqual({ ownerWait: 1, stale: 1, unassigned: 0, machineOffline: 1, planDrift: 1 });

      const commands = new CommandsService(progressService, { allowedUserIds: [101] });
      const progressReply = commands.handle(command("/progress"));
      const staleReply = commands.handle(command("/stale"));
      const waitingReply = commands.handle(command("/waiting"));
      expect(progressReply).toContain("owner 1 · stale 1 · offline 1 · drift 1");
      expect(staleReply).toContain("STALE machine-b · codex:stale");
      expect(staleReply).toContain("OFFLINE machine-c");
      expect(waitingReply).toContain("Approve the production hostname");

      const sender = new RecordingSender();
      const notifier = new NotifierService(store, sender, {
        defaultChatId: 101,
        claimLeaseSeconds: 60,
        scanMilliseconds: null,
        now: () => clock.iso(),
      });
      expect((await notifier.deliverPending()).sent).toBeGreaterThanOrEqual(3);
      expect(await notifier.deliverPending()).toEqual({ sent: 0, failed: 0 });
      expect(sender.messages.some((message) => message.startsWith("OWNER RESPONSE NEEDED"))).toBeTrue();
      expect(sender.messages.some((message) => message.startsWith("STALE"))).toBeTrue();
      expect(sender.messages.some((message) => message.includes("MACHINE OFFLINE\nMachine: machine-c"))).toBeTrue();

      const recoveredAgentIds = ["codex:waiting", "codex:stale", "codex:drift"] as const;
      const recoveredTaskIds = ["PLAN_002", "PLAN_003", "PLAN_002"] as const;
      for (const [index, machine] of machines.entries()) {
        const recoveredAgentId = recoveredAgentIds[index];
        const recoveredTaskId = recoveredTaskIds[index];
        if (recoveredAgentId === undefined) throw new Error("fixture recovery identity is missing");
        if (recoveredTaskId === undefined) throw new Error("fixture recovery Task is missing");
        machine.source.observation = observation(
          observedAgent(recoveredAgentId, "working", CANONICAL_REVISION, recoveredTaskId),
          CANONICAL_REVISION,
        );
        await machine.collector.collectOnce();
      }
      transitions.evaluate();
      const recovered = progress.portfolio().plans[0];
      expect(recovered?.attention).toEqual({
        ownerWait: 0,
        stale: 0,
        unassigned: 0,
        machineOffline: 0,
        planDrift: 0,
      });
      expect(recovered?.estimatedDeliveryAt).not.toBeNull();
      expect((await notifier.deliverPending()).sent).toBeGreaterThanOrEqual(3);
      expect(await notifier.deliverPending()).toEqual({ sent: 0, failed: 0 });

      const observableOutput = [progressReply, staleReply, waitingReply, ...sender.messages, ...requestBodies].join("\n");
      for (const machine of machines) expect(observableOutput).not.toContain(machine.token);
    } finally {
      for (const machineStore of machineStores) machineStore.close();
      await app.close();
    }
  });
});
