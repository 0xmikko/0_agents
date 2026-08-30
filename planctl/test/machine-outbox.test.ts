import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MachineStore } from "../src/machine/state/machine-store";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function databasePath(): string {
  const root = mkdtempSync(join(tmpdir(), "planctld-outbox-"));
  roots.push(root);
  return join(root, "machine.sqlite");
}

describe("planctld SQLite outbox", () => {
  /**
   * @test-id: tst_svc_planctld_outbox_001
   * @scenario: scn_planctld_outbox_001
   * @covers: planctl/src/machine/state/machine-store.ts::MachineStore
   * @deterministic: yes
   * @fixtures: test-owned SQLite database and inline sanitized snapshots
   *
   * Test environment: real bun:sqlite WAL database in a temporary directory
   * Clients: direct calls
   * Mocks: none
   * Data: twenty sequential snapshots and one persisted JSONL cursor
   */
  it("tst_svc_planctld_outbox_001 coalesces disconnected snapshots and survives restart", () => {
    const path = databasePath();
    let store = new MachineStore(path);
    expect(store.journalMode()).toBe("wal");
    store.putSourceCursor("/sessions/codex.jsonl", {
      offset: 41,
      sessionId: "session-1",
      cwd: "/work/repo",
      lastActivityAt: "2026-08-29T12:00:00.000Z",
    });

    for (let index = 1; index <= 20; index += 1) {
      const agentWithPrivateInput = {
        agentId: "codex:session-1",
        provider: "codex" as const,
        state: "working" as const,
        repositoryId: "repo-1",
        worktree: "/work/repo",
        branch: "feat/one",
        planId: "repo-1:docs/plans/one.md",
        planRevision: "a".repeat(64),
        taskId: "ONE_001",
        lastActivityAt: new Date(Date.UTC(2026, 7, 29, 12, 0, index)).toISOString(),
        idleSeconds: 0,
        elapsedActiveMinutes: index,
        ownerWaitReason: null,
        ownerWaitStartedAt: null,
        transcriptPayload: "DO_NOT_PERSIST_TRANSCRIPT",
      };
      store.queueLatest({
        machineId: "machine-a",
        observedAt: new Date(Date.UTC(2026, 7, 29, 12, 0, index)).toISOString(),
        snapshotHash: index.toString(16).padStart(64, "0"),
        agents: [agentWithPrivateInput],
        plans: [],
      });
    }
    expect(store.outboxCount()).toBe(1);
    const latest = store.pendingSnapshot();
    expect(latest?.snapshot.heartbeat.sequence).toBe(20);
    expect(latest?.snapshot.heartbeat.snapshotHash).toBe("14".padStart(64, "0"));
    expect(JSON.stringify(latest)).not.toContain("DO_NOT_PERSIST_TRANSCRIPT");
    store.recordSendFailure(20, {
      attemptedAt: "2026-08-29T12:01:00.000Z",
      nextAttemptAt: "2026-08-29T12:01:02.000Z",
      errorCode: "server_unavailable",
    });
    store.close();

    store = new MachineStore(path);
    expect(store.sourceCursor("/sessions/codex.jsonl")?.offset).toBe(41);
    expect(store.pendingSnapshot()?.attempts).toBe(1);
    expect(store.acknowledge(19)).toBe(false);
    expect(store.outboxCount()).toBe(1);
    expect(store.acknowledge(20)).toBe(true);
    expect(store.outboxCount()).toBe(0);
    store.close();

    expect(readFileSync(path).includes(Buffer.from("DO_NOT_PERSIST_TRANSCRIPT"))).toBe(false);
  });
});
