import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ServerStore } from "../src/server/persistence/server-store";
import { NotifierService } from "../src/telegram/notifier.service";

import type { TelegramSender } from "../src/telegram/telegram-client";

const roots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "planctl-telegram-alerts-"));
  roots.push(root);
  mkdirSync(join(root, "state"), { recursive: true });
  return root;
}

function store(path: string): ServerStore {
  return new ServerStore({
    databasePath: path,
    machineOfflineAfterSeconds: 60,
    historyRetentionDays: 90,
    transitionScanMs: null,
    now: () => "2026-08-29T20:00:00.000Z",
  });
}

class RecordingSender implements TelegramSender {
  readonly messages: string[] = [];
  failOwnerOnce = true;

  async sendMessage(_chatId: number, text: string): Promise<void> {
    if (this.failOwnerOnce && text.includes("OWNER RESPONSE NEEDED")) {
      this.failOwnerOnce = false;
      throw new Error("fixture Telegram outage");
    }
    this.messages.push(text);
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Telegram transition alerts", () => {
  /**
   * @test-id: tst_svc_planctl_alerts_001
   * @scenario: scn_planctl_alerts_001
   * @covers: planctl/src/server/persistence/server-store.ts::ServerStore.claimPendingAlerts
   * @covers: planctl/src/telegram/notifier.service.ts::NotifierService.deliverPending
   * @deterministic: yes
   * @fixtures: temporary SQLite WAL with fixed transition edges
   * Test environment: real persistence and fake Telegram sender
   * Clients: notifier worker
   * Mocks: Telegram send boundary and injected clock
   * Data: stale, owner-wait, machine-offline and recovery transitions with one failed send
   */
  it("tst_svc_planctl_alerts_001 sends each persisted edge once across failure, duplicate scans and restart", async () => {
    const root = fixtureRoot();
    const database = join(root, "state/server.sqlite");
    const firstStore = store(database);
    firstStore.changeObservedState({
      entityKey: "agent:machine-a:codex-stale",
      currentState: "stale",
      attentionKind: "stale",
      machineId: "machine-a",
      agentId: "codex:stale",
      planId: "repo:docs/plans/example.md",
      taskId: "PLCTL_001",
      occurredAt: "2026-08-29T19:55:00.000Z",
      detail: { state: "stale" },
    });
    firstStore.changeObservedState({
      entityKey: "agent:machine-b:codex-waiting",
      currentState: "awaiting_owner",
      attentionKind: "owner_wait",
      machineId: "machine-b",
      agentId: "codex:waiting",
      planId: "repo:docs/plans/example.md",
      taskId: "PLCTL_002",
      occurredAt: "2026-08-29T19:56:00.000Z",
      detail: { state: "awaiting_owner", ownerWaitReason: "Choose the public hostname" },
    });
    firstStore.changeObservedState({
      entityKey: "machine:machine-c",
      currentState: "offline",
      attentionKind: "machine_offline",
      machineId: "machine-c",
      agentId: null,
      planId: null,
      taskId: null,
      occurredAt: "2026-08-29T19:57:00.000Z",
      detail: { state: "offline" },
    });
    firstStore.changeObservedState({
      entityKey: "agent:machine-a:codex-stale",
      currentState: "working",
      attentionKind: null,
      machineId: "machine-a",
      agentId: "codex:stale",
      planId: "repo:docs/plans/example.md",
      taskId: "PLCTL_001",
      occurredAt: "2026-08-29T19:58:00.000Z",
      detail: { state: "working" },
    });

    const sender = new RecordingSender();
    const first = new NotifierService(firstStore, sender, {
      defaultChatId: 501,
      claimLeaseSeconds: 60,
      scanMilliseconds: null,
      now: () => "2026-08-29T20:00:00.000Z",
    });
    expect(await first.deliverPending()).toEqual({ sent: 3, failed: 1 });
    firstStore.onModuleDestroy();

    const restartedStore = store(database);
    const restarted = new NotifierService(restartedStore, sender, {
      defaultChatId: 501,
      claimLeaseSeconds: 60,
      scanMilliseconds: null,
      now: () => "2026-08-29T20:00:01.000Z",
    });
    expect(await restarted.deliverPending()).toEqual({ sent: 1, failed: 0 });
    expect(await restarted.deliverPending()).toEqual({ sent: 0, failed: 0 });
    expect(sender.messages).toHaveLength(4);
    expect(sender.messages.filter((message) => message.startsWith("STALE"))).toHaveLength(1);
    expect(sender.messages.filter((message) => message.startsWith("OWNER RESPONSE NEEDED"))).toHaveLength(1);
    expect(sender.messages.filter((message) => message.startsWith("MACHINE OFFLINE"))).toHaveLength(1);
    expect(sender.messages.filter((message) => message.startsWith("RECOVERED"))).toHaveLength(1);
    expect(sender.messages.join("\n")).not.toContain("DO_NOT_UPLOAD");
    restartedStore.onModuleDestroy();
  });
});
