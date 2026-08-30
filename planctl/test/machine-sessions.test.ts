import { afterEach, describe, expect, it } from "bun:test";
import {
  appendFileSync,
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { accountOwnerWait, decodeTaskRun } from "../src/core/task-run";
import { discoverGitWorktrees } from "../src/machine/discovery/git-worktree.source";
import { scanClaudeSessionFile } from "../src/machine/sessions/claude-session.source";
import { scanCodexSessionFile } from "../src/machine/sessions/codex-session.source";
import { readJsonlTail } from "../src/machine/sessions/jsonl-tail-reader";
import { discoverLinuxAgentProcesses } from "../src/machine/sessions/linux-process.source";
import { classifySessionActivities } from "../src/machine/sessions/session-source";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "planctld-sessions-"));
  roots.push(root);
  return root;
}

describe("planctld session discovery", () => {
  /**
   * @test-id: tst_svc_planctld_completed_session_001
   * @scenario: scn_planctld_completed_session_001
   * @covers: planctl/src/machine/sessions/codex-session.source.ts::scanCodexSessionFile
   * @invariant: a Codex task_complete terminal record cannot become a stale agent alert
   * @deterministic: yes
   * @fixtures: test-owned Codex JSONL ending in task_complete, then one resumed activity record
   *
   * Test environment: direct incremental JSONL scan
   * Clients: planctld collector
   * Mocks: none
   * Data: session metadata and terminal/activity timestamps only
   */
  it("tst_svc_planctld_completed_session_001 excludes completed Codex sessions until they resume", () => {
    const root = temporaryRoot();
    const sessionPath = join(root, "completed-codex.jsonl");
    writeFileSync(sessionPath, [
      JSON.stringify({
        type: "session_meta",
        timestamp: "2026-08-30T19:45:00.000Z",
        payload: { id: "completed-session", cwd: "/work/repo" },
      }),
      JSON.stringify({
        type: "event_msg",
        timestamp: "2026-08-30T19:46:56.441Z",
        payload: { type: "task_complete" },
      }),
      "",
    ].join("\n"));

    const completed = scanCodexSessionFile(sessionPath, 0);
    expect(completed.activity).toBeNull();

    appendFileSync(sessionPath, `${JSON.stringify({
      type: "event_msg",
      timestamp: "2026-08-30T20:10:00.000Z",
      payload: { type: "task_started" },
    })}\n`);
    const resumed = scanCodexSessionFile(sessionPath, completed.cursor);
    expect(resumed.activity?.lastActivityAt).toBe("2026-08-30T20:10:00.000Z");
  });

  /**
   * @test-id: tst_svc_planctld_active_pause_001
   * @scenario: scn_planctld_active_pause_001
   * @covers: planctl/src/core/task-run.ts::accountOwnerWait
   * @covers: planctl/src/machine/sessions/session-source.ts::classifySessionActivities
   * @invariant: CTL-005 structured owner-wait time is never reported as active Task time
   * @deterministic: yes
   * @fixtures: fixed TaskRunV2, owner-wait interval and post-resume activity
   */
  it("tst_svc_planctld_active_pause_001 excludes an idempotently accounted owner wait from active time", () => {
    const run = decodeTaskRun({
      version: 2,
      plan: "docs/plans/feature.md",
      deliveryId: "D1",
      stageId: "D1-S1",
      taskId: "FEATURE_001",
      startedAt: "2026-08-29T11:00:00.000Z",
      baseHead: "a".repeat(40),
      machineId: "machine-a",
      agentId: "codex:codex-session-1",
      repositoryId: "repo-1",
      worktree: "/work/repo/.worktrees/feature",
      branch: "feat/feature",
      planRevision: "b".repeat(64),
      ownerWait: null,
      accumulatedOwnerWaitSeconds: 0,
      lastAccountedOwnerWaitStartedAt: null,
    });
    const marker = {
      reason: "Choose the public endpoint",
      startedAt: "2026-08-29T11:10:00.000Z",
    };
    const resumed = accountOwnerWait(run, marker, "2026-08-29T12:10:00.000Z");
    expect(accountOwnerWait(resumed, marker, "2026-08-29T12:10:00.000Z")).toEqual(resumed);
    const agents = classifySessionActivities({
      activities: [{
        agentId: "codex:codex-session-1",
        provider: "codex",
        sessionId: "codex-session-1",
        cwd: "/work/repo/.worktrees/feature",
        sourcePath: "/sessions/codex-session-1.jsonl",
        lastActivityAt: "2026-08-29T12:20:00.000Z",
      }],
      processes: [],
      worktrees: [{
        path: "/work/repo/.worktrees/feature",
        repositoryId: "repo-1",
        branch: "feat/feature",
      }],
      taskRuns: [resumed],
      now: new Date("2026-08-29T12:20:00.000Z"),
      staleAfterSeconds: 900,
    });
    expect(agents[0]?.elapsedActiveMinutes).toBe(20);
  });

  /**
   * @test-id: tst_svc_planctld_sessions_001
   * @scenario: scn_planctld_sessions_001
   * @covers: planctl/src/machine/sessions/jsonl-tail-reader.ts::readJsonlTail
   * @covers: planctl/src/machine/sessions/codex-session.source.ts::scanCodexSessionFile
   * @covers: planctl/src/machine/sessions/claude-session.source.ts::scanClaudeSessionFile
   * @covers: planctl/src/machine/sessions/linux-process.source.ts::discoverLinuxAgentProcesses
   * @covers: planctl/src/machine/sessions/session-source.ts::classifySessionActivities
   * @covers: planctl/src/machine/discovery/git-worktree.source.ts::discoverGitWorktrees
   * @deterministic: yes
   * @fixtures: fixtures/sessions/codex-active.jsonl,fixtures/sessions/claude-active.jsonl,fixtures/sessions/truncated-tail.jsonl
   *
   * Test environment: test-owned JSONL, proc and Git metadata fixtures
   * Clients: direct calls
   * Mocks: none
   * Data: sanitized Codex/Claude metadata with payload secret markers
   */
  it("tst_svc_planctld_sessions_001 classifies metadata while keeping payloads private and truncated tails pending", () => {
    const root = temporaryRoot();
    const codexPath = join(root, "codex.jsonl");
    const claudePath = join(root, "claude.jsonl");
    const truncatedPath = join(root, "truncated.jsonl");
    cpSync(new URL("../fixtures/sessions/codex-active.jsonl", import.meta.url), codexPath);
    cpSync(new URL("../fixtures/sessions/claude-active.jsonl", import.meta.url), claudePath);
    const truncatedFixture = readFileSync(new URL("../fixtures/sessions/truncated-tail.jsonl", import.meta.url), "utf8");
    writeFileSync(truncatedPath, truncatedFixture.trimEnd());

    const codex = scanCodexSessionFile(codexPath, 0);
    const claude = scanClaudeSessionFile(claudePath, 0);
    expect(codex.activity).toEqual({
      agentId: "codex:codex-session-1",
      provider: "codex",
      sessionId: "codex-session-1",
      cwd: "/work/repo/.worktrees/feature",
      sourcePath: codexPath,
      lastActivityAt: "2026-08-29T12:04:50.000Z",
    });
    expect(claude.activity?.agentId).toBe("claude:claude-session-1");
    expect(JSON.stringify([codex, claude])).not.toContain("DO_NOT_UPLOAD");

    const truncated = readJsonlTail(truncatedPath, 0);
    expect(truncated.records).toHaveLength(1);
    expect(truncated.nextOffset).toBeGreaterThan(0);
    expect(truncated.pendingBytes).toBeGreaterThan(0);
    const savedOffset = truncated.nextOffset;
    appendFileSync(truncatedPath, '"}}\n');
    const completed = readJsonlTail(truncatedPath, savedOffset);
    expect(completed.records).toHaveLength(1);
    expect(completed.pendingBytes).toBe(0);

    const malformedPath = join(root, "malformed.jsonl");
    writeFileSync(malformedPath, "{not-json}\n");
    const malformed = scanCodexSessionFile(malformedPath, 0);
    expect(malformed.activity).toBeNull();
    expect(malformed.issues[0]?.code).toBe("malformed_jsonl");

    const procRoot = join(root, "proc");
    const processRoot = join(procRoot, "4321");
    mkdirSync(processRoot, { recursive: true });
    writeFileSync(join(processRoot, "environ"), "CODEX_SESSION_ID=codex-session-1\0");
    symlinkSync("/work/repo/.worktrees/feature", join(processRoot, "cwd"));
    expect(discoverLinuxAgentProcesses(procRoot)).toEqual([{
      pid: 4321,
      provider: "codex",
      sessionId: "codex-session-1",
      cwd: "/work/repo/.worktrees/feature",
    }]);
    const git = discoverGitWorktrees([root], { [root]: "repo-fixture" }, (_repository, args) => ({
      status: 0,
      stdout: args[0] === "worktree" ? `worktree ${root}\nHEAD ${"a".repeat(40)}\nbranch refs/heads/feat/fixture\n\n` : "",
      stderr: "",
    }));
    expect(git.worktrees).toEqual([{ path: root, repositoryId: "repo-fixture", branch: "feat/fixture" }]);

    const taskRun = decodeTaskRun({
      version: 2,
      plan: "docs/plans/feature.md",
      deliveryId: "D1",
      stageId: "D1-S1",
      taskId: "FEATURE_001",
      startedAt: "2026-08-29T11:00:00.000Z",
      baseHead: "a".repeat(40),
      machineId: "machine-a",
      agentId: "codex:codex-session-1",
      repositoryId: "repo-1",
      worktree: "/work/repo/.worktrees/feature",
      branch: "feat/feature",
      planRevision: "b".repeat(64),
      ownerWait: null,
      accumulatedOwnerWaitSeconds: 0,
      lastAccountedOwnerWaitStartedAt: null,
    });
    const agents = classifySessionActivities({
      activities: [codex.activity, claude.activity].filter((value) => value !== null),
      processes: discoverLinuxAgentProcesses(procRoot),
      worktrees: [
        { path: "/work/repo/.worktrees/feature", repositoryId: "repo-1", branch: "feat/feature" },
        { path: "/work/repo", repositoryId: "repo-1", branch: "main" },
      ],
      taskRuns: [taskRun],
      now: new Date("2026-08-29T12:05:00.000Z"),
      staleAfterSeconds: 15,
    });
    expect(agents.map(({ agentId, state, taskId }) => ({ agentId, state, taskId }))).toEqual([
      { agentId: "claude:claude-session-1", state: "unassigned", taskId: null },
      { agentId: "codex:codex-session-1", state: "working", taskId: "FEATURE_001" },
    ]);
    const awaitingOwner = classifySessionActivities({
      activities: [codex.activity].filter((value) => value !== null),
      processes: discoverLinuxAgentProcesses(procRoot),
      worktrees: [{ path: "/work/repo/.worktrees/feature", repositoryId: "repo-1", branch: "feat/feature" }],
      taskRuns: [taskRun],
      ownerWaits: [{
        plan: "docs/plans/feature.md",
        taskId: "FEATURE_001",
        reason: "Choose the public endpoint",
        startedAt: "2026-08-29T12:04:59.000Z",
      }],
      now: new Date("2026-08-29T12:05:00.000Z"),
      staleAfterSeconds: 15,
    });
    expect(awaitingOwner[0]?.state).toBe("awaiting_owner");
    expect(awaitingOwner[0]?.ownerWaitReason).toBe("Choose the public endpoint");
    const staleAgents = classifySessionActivities({
      activities: [codex.activity].filter((value) => value !== null),
      processes: [],
      worktrees: [{ path: "/work/repo/.worktrees/feature", repositoryId: "repo-1", branch: "feat/feature" }],
      taskRuns: [taskRun],
      now: new Date("2026-08-29T12:05:05.000Z"),
      staleAfterSeconds: 15,
    });
    expect(staleAgents[0]?.state).toBe("stale");
    expect(staleAgents[0]?.idleSeconds).toBe(15);
  });
});
