import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEvent, eventLogPath, readEvents, stats } from "../src/core/event-log";
import type { EventRecord } from "../src/core/event-log";
import { dispatchTool } from "../src/mcp/server";

function event(overrides: Partial<EventRecord>): EventRecord {
  return {
    at: "2026-09-25T10:00:00.000Z",
    repository: "/work/repo",
    worktree: "/work/repo",
    plan: "docs/plans/2026-09-25-fixture.md",
    revision: "r1",
    tool: "start_task",
    deliveryId: "D1",
    taskIds: [],
    forecastMinutes: null,
    prUrl: null,
    ciHeadSha: null,
    ciRunId: null,
    ciAttempt: null,
    outcome: "ok",
    reason: null,
    durationMs: 5,
    runtimeCommit: null,
    sourceCommit: "s".repeat(40),
    ...overrides,
  };
}

describe("the event log", () => {
  /**
   * @test-id: tst_unit_planctl_event_log_001
   * @scenario: scn_planctl_event_log_001
   * @covers: planctl/src/core/event-log.ts::appendEvent,readEvents,stats
   * @deterministic: yes
   * @invariant: one line per call; refusals carry reasons; the five tables count a batched completion per Task, a repeated start once, a repeated observation once and a rerun twice.
   */
  it("tst_unit_planctl_event_log_001 writes one line per call and answers the five questions", () => {
    const home = mkdtempSync(join(tmpdir(), "planctl-events-"));
    try {
      const path = eventLogPath(home);
      expect(path).toBe(join(home, ".local/share/planctl/events.jsonl"));
      const records: EventRecord[] = [
        event({ at: "2026-09-25T10:00:00.000Z", tool: "submit_spec", taskIds: [], deliveryId: null }),
        event({ at: "2026-09-25T10:05:00.000Z", tool: "submit_spec", taskIds: [], deliveryId: null }),
        event({ at: "2026-09-25T10:10:00.000Z", tool: "start_task", taskIds: ["T1"], forecastMinutes: 30 }),
        event({ at: "2026-09-25T10:12:00.000Z", tool: "start_task", taskIds: ["T1"], forecastMinutes: 30 }),
        event({ at: "2026-09-25T10:20:00.000Z", tool: "start_task", taskIds: ["T2"], forecastMinutes: 10 }),
        event({ at: "2026-09-25T10:30:00.000Z", tool: "needs_owner", taskIds: ["T1"] }),
        event({ at: "2026-09-25T10:45:00.000Z", tool: "resume_task", taskIds: ["T1"] }),
        event({ at: "2026-09-25T11:00:00.000Z", tool: "complete_task", taskIds: ["T1", "T2"] }),
        event({ at: "2026-09-25T11:01:00.000Z", tool: "complete_task", taskIds: ["T3"], outcome: "refused", reason: "Task T3 has no start record; run planctl start-task first" }),
        event({ at: "2026-09-25T11:10:00.000Z", tool: "progress", prUrl: "https://example.test/pr/1", ciHeadSha: "h".repeat(40), ciRunId: "77", ciAttempt: 1 }),
        event({ at: "2026-09-25T11:11:00.000Z", tool: "progress", prUrl: "https://example.test/pr/1", ciHeadSha: "h".repeat(40), ciRunId: "77", ciAttempt: 1 }),
        event({ at: "2026-09-25T11:20:00.000Z", tool: "progress", prUrl: "https://example.test/pr/1", ciHeadSha: "h".repeat(40), ciRunId: "77", ciAttempt: 2 }),
      ];
      for (const record of records) appendEvent(path, record);
      expect(readFileSync(path, "utf8").trim().split("\n")).toHaveLength(records.length);
      const read = readEvents(path, "2026-09-25T00:00:00.000Z");
      expect(read).toHaveLength(records.length);
      expect(read.find((entry) => entry.outcome === "refused")?.reason).toContain("no start record");

      const tables = stats(read);
      const bySource = tables.get("s".repeat(40));
      if (bySource === undefined) throw new Error("no tables for the source commit");
      expect(bySource.stops).toEqual([{ tool: "complete_task", reason: "Task T3 has no start record; run planctl start-task first", count: 1 }]);
      expect(bySource.submitRounds).toEqual([{ plan: "docs/plans/2026-09-25-fixture.md", rounds: 2 }]);
      expect(bySource.taskTime).toEqual([
        { plan: "docs/plans/2026-09-25-fixture.md", taskId: "T1", forecastMinutes: 30, minutes: 50 },
        { plan: "docs/plans/2026-09-25-fixture.md", taskId: "T2", forecastMinutes: 10, minutes: 40 },
      ]);
      expect(bySource.ownerWait).toEqual([{ plan: "docs/plans/2026-09-25-fixture.md", taskId: "T1", minutes: 15 }]);
      expect(bySource.publication).toEqual([{ plan: "docs/plans/2026-09-25-fixture.md", deliveryId: "D1", prs: 1, ciRuns: 2 }]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  /**
   * @test-id: tst_unit_planctl_event_log_002
   * @scenario: scn_planctl_event_log_002
   * @covers: planctl/src/mcp/server.ts::dispatchTool
   * @deterministic: yes
   * @invariant: a schema rejection before the handler and a refusal inside it both leave one refused line with a reason; a call that resolved no plan leaves the plan fields empty.
   */
  it("tst_unit_planctl_event_log_002 logs a schema rejection and a refusal as refused lines", async () => {
    const home = mkdtempSync(join(tmpdir(), "planctl-events-"));
    const root = mkdtempSync(join(tmpdir(), "planctl-events-repo-"));
    try {
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
      const deps = { cwd: home, publication: () => null, sourceCommit: "s".repeat(40), eventLog: eventLogPath(home) };
      const rejected = await dispatchTool(deps, "start_task", { plan: join(root, "docs/plans/none.md"), task: 42 });
      expect(rejected.isError).toBe(true);
      const unknown = await dispatchTool(deps, "no_such_tool", {});
      expect(unknown.isError).toBe(true);
      const refused = await dispatchTool(deps, "progress", { root });
      expect(refused.isError ?? false).toBe(false);
      const lines = readEvents(eventLogPath(home), "2000-01-01T00:00:00.000Z");
      expect(lines).toHaveLength(3);
      expect(lines[0]).toMatchObject({ tool: "start_task", outcome: "refused", plan: "docs/plans/none.md" });
      expect(lines[0]?.reason).toContain("task");
      expect(lines[1]).toMatchObject({ tool: "no_such_tool", outcome: "refused", plan: "" });
      expect(lines[2]).toMatchObject({ tool: "progress", outcome: "ok", plan: "", repository: root });
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });
});
