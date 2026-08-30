import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { CommandsService } from "../src/telegram/commands.service";
import { TelegramClient } from "../src/telegram/telegram-client";

import type { PlanProgressView, PortfolioProgressView } from "../src/server/progress/progress.service";
import type { ProgressReader } from "../src/telegram/commands.service";

const PLAN_ID = "0xmikko/0_agents:docs/plans/example.md";

const PLAN: PlanProgressView = {
  planId: PLAN_ID,
  planRevision: "a".repeat(64),
  goal: "Ship trustworthy distributed tracking",
  updatedAt: "2026-08-29T20:00:00.000Z",
  completionPercent: 40,
  tasks: { completed: 4, total: 10 },
  activeMinutes: { completed: 80, remaining: 120, total: 200 },
  credits: { completed: 20, remaining: 30, total: 50 },
  activeAgents: [{
    machineId: "machine-a",
    machineState: "online",
    agentId: "codex:waiting",
    state: "awaiting_owner",
    planDrift: true,
    planId: PLAN_ID,
    taskId: "PLCTL_011",
    planRevision: "a".repeat(64),
    lastActivityAt: "2026-08-29T19:55:00.000Z",
    idleSeconds: 300,
    elapsedActiveMinutes: 25,
    ownerWaitReason: "Choose the public hostname",
    ownerWaitStartedAt: "2026-08-29T19:45:00.000Z",
  }, {
    machineId: "machine-b",
    machineState: "online",
    agentId: "claude:stale",
    state: "stale",
    planDrift: true,
    planId: PLAN_ID,
    taskId: "PLCTL_012",
    planRevision: "a".repeat(64),
    lastActivityAt: "2026-08-29T19:40:00.000Z",
    idleSeconds: 1_200,
    elapsedActiveMinutes: 44,
    ownerWaitReason: null,
    ownerWaitStartedAt: null,
  }, {
    machineId: "machine-c",
    machineState: "offline",
    agentId: "codex:working",
    state: "working",
    planDrift: false,
    planId: PLAN_ID,
    taskId: "PLCTL_013",
    planRevision: "a".repeat(64),
    lastActivityAt: "2026-08-29T19:59:00.000Z",
    idleSeconds: 60,
    elapsedActiveMinutes: 10,
    ownerWaitReason: null,
    ownerWaitStartedAt: null,
  }],
  attention: { ownerWait: 1, stale: 1, unassigned: 0, machineOffline: 1, planDrift: 2 },
  remainingActiveMinutes: 120,
  criticalPathMinutes: 75,
  calibratedCriticalPathMinutes: 90,
  estimatedDeliveryAt: null,
  calibration: { factor: 1.2, completedTaskSamples: 5, confidence: "medium" },
};

const PORTFOLIO: PortfolioProgressView = {
  generatedAt: "2026-08-29T20:00:00.000Z",
  plans: [PLAN],
  agents: PLAN.activeAgents,
};

class FixtureProgress implements ProgressReader {
  portfolio(): PortfolioProgressView {
    return PORTFOLIO;
  }

  plan(planId: string): PlanProgressView | null {
    return planId === PLAN_ID ? PLAN : null;
  }
}

describe("Telegram progress commands", () => {
  /**
   * @test-id: tst_svc_planctl_telegram_001
   * @scenario: scn_planctl_telegram_001
   * @covers: planctl/src/telegram/telegram-client.ts::TelegramClient.getUpdates
   * @covers: planctl/src/telegram/commands.service.ts::CommandsService.handle
   * @deterministic: yes
   * @fixtures: fixtures/telegram/updates.json and typed multi-machine progress
   * Test environment: fake Telegram fetch and in-memory server read model
   * Clients: Telegram Bot API boundary
   * Mocks: injected fetch only
   * Data: five owner commands, one unauthorized chat and secret-bearing ignored payloads
   */
  it("tst_svc_planctl_telegram_001 authorizes and renders all five bounded commands without payload leakage", async () => {
    const fixture = readFileSync(new URL("../fixtures/telegram/updates.json", import.meta.url), "utf8");
    const client = new TelegramClient({
      token: "fixture-bot-token",
      longPollSeconds: 30,
      fetch: async () => new Response(fixture, { status: 200, headers: { "content-type": "application/json" } }),
    });
    const commands = new CommandsService(new FixtureProgress(), { allowedUserIds: [101] });
    const updates = await client.getUpdates(0, new AbortController().signal);
    const replies = updates.map((update) => commands.handle(update)).filter((reply): reply is string => reply !== null);

    expect(replies).toHaveLength(5);
    expect(replies[0]).toContain("Progress — 1 active plan");
    expect(replies[0]).toContain("40.0% · 4/10 Tasks · critical path 90 min · ETA unknown (owner wait)");
    expect(replies[1]).toContain("Goal: Ship trustworthy distributed tracking");
    expect(replies[1]).toContain("Blockers: owner 1 · stale 1 · offline machines 1 · drift 2");
    expect(replies[2]).toContain("machine-a · codex:waiting · PLCTL_011 · awaiting_owner · plan_drift");
    expect(replies[3]).toContain("STALE machine-b · claude:stale · PLCTL_012 · idle 1200s · plan_drift");
    expect(replies[3]).toContain("OFFLINE machine-c · agent codex:working remains working");
    expect(replies[4]).toContain("WAITING machine-a · codex:waiting · PLCTL_011 · plan_drift");
    expect(replies[4]).toContain("Reason: Choose the public hostname");
    expect(replies[4]).toContain("Wait duration: 15m");
    expect(replies.every((reply) => reply.length <= 4_096)).toBeTrue();
    expect(replies.join("\n")).not.toContain("DO_NOT_UPLOAD");
  });

  /**
   * @test-id: tst_svc_planctl_wait_duration_001
   * @scenario: scn_planctl_wait_duration_001
   * @covers: planctl/src/telegram/commands.service.ts::CommandsService.handle
   * @deterministic: yes
   * @fixtures: fixed server-generated time and structured owner-wait start
   */
  it("tst_svc_planctl_wait_duration_001 renders evidence-based owner wait duration", () => {
    const commands = new CommandsService(new FixtureProgress(), { allowedUserIds: [101] });
    const reply = commands.handle({ updateId: 99, userId: 101, chatId: 101, text: "/waiting" });
    expect(reply).toContain("Reason: Choose the public hostname");
    expect(reply).toContain("Wait duration: 15m");
  });
});
