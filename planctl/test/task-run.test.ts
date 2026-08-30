import { describe, expect, it } from "bun:test";

import { decodeMachineSnapshot } from "../src/core/snapshot-protocol";
import { completedStageSamples } from "../src/core/plan-update";
import { decodeTaskRun, taskRunCorrelation } from "../src/core/task-run";

describe("Task run and snapshot contracts", () => {
  /**
   * @test-id: tst_unit_planctl_task_run_001
   * @scenario: scn_planctl_task_run_001
   * @covers: planctl/src/core/task-run.ts::decodeTaskRun,taskRunCorrelation
   * @covers: planctl/src/core/snapshot-protocol.ts::decodeMachineSnapshot
   * @deterministic: yes
   * @fixtures: inline version-1/version-2 receipts and protocol-version-1 snapshot
   *
   * Test environment: pure versioned contract decoders
   * Clients: direct calls
   * Mocks: none
   * Data: legacy local receipt and explicit distributed session identity
   */
  it("tst_unit_planctl_task_run_001 preserves legacy completion and requires explicit V2 correlation", () => {
    const legacy = decodeTaskRun({
      version: 1,
      plan: "docs/plans/example.md",
      deliveryId: "D1",
      stageId: "D1-S1",
      taskId: "TASK_001",
      startedAt: "2026-08-29T00:00:00.000Z",
      baseHead: "a".repeat(40),
    });
    expect(legacy.version).toBe(1);
    expect(taskRunCorrelation(legacy)).toBeNull();

    const distributed = decodeTaskRun({
      version: 2,
      plan: "docs/plans/example.md",
      deliveryId: "D1",
      stageId: "D1-S1",
      taskId: "TASK_001",
      startedAt: "2026-08-29T00:00:00.000Z",
      baseHead: "a".repeat(40),
      machineId: "u3775",
      agentId: "codex:session-1",
      repositoryId: "0xmikko/0_agents",
      worktree: "/work/0_agents/.worktrees/example",
      branch: "feat/example",
      planRevision: "b".repeat(64),
      ownerWait: null,
    });
    expect(taskRunCorrelation(distributed)).toEqual({
      machineId: "u3775",
      agentId: "codex:session-1",
      repositoryId: "0xmikko/0_agents",
      worktree: "/work/0_agents/.worktrees/example",
      branch: "feat/example",
      planRevision: "b".repeat(64),
    });
    expect(() => decodeTaskRun({ ...distributed, machineId: undefined })).toThrow("TaskRunV2 machineId");

    const resultPlan = [
      "<!-- plan:stage:D1-S1:start -->",
      '<!-- plan:stage-meta:{"deliveryId":"D1","depends":[],"parallelWith":[],"writes":["src/example.ts"],"tempRoot":".tmp/example"} -->',
      "#### Stage D1-S1 — Example",
      "",
      "Owner: agent; Profile: fast; Depends: none; Parallel with: none.",
      "Writes: `src/example.ts`.",
      "Temp root: `.tmp/example` (must be absent at handoff).",
      "Predict: 10 active min / 2 credits.",
      "",
      "##### Tasks",
      "",
      `- [x] TASK_001 — finish one measured task — ${"a".repeat(40)}`,
      "      Writes: `src/example.ts`.",
      "      Predict: 10 active min / 2 credits.",
      "      How: change the existing example through its canonical owner",
      "      RED: `bun run agent:test:backend -- test/example.test.ts`",
      "",
      "##### Acceptance criteria",
      "",
      "- [ ] Commit",
      "",
      "##### Results",
      "",
      "<!-- plan:results:D1-S1:start -->",
      "| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |",
      "|---|---|---|---:|---|---|",
      `| TASK_001 | ${"a".repeat(40)} | 2026-08-29T00:00:00.000Z–2026-08-29T00:20:00.000Z | 20 / 20 min | unavailable | done |`,
      "<!-- plan:results:D1-S1:end -->",
      "<!-- plan:stage:D1-S1:end -->",
    ].join("\n");
    expect(completedStageSamples(resultPlan)).toEqual([{
      sampleId: `D1-S1:${"a".repeat(40)}`,
      predictedActiveMinutes: 10,
      actualActiveMinutes: 20,
      completedAt: "2026-08-29T00:20:00.000Z",
    }]);

    const snapshot = decodeMachineSnapshot({
      heartbeat: {
        protocolVersion: 1,
        machineId: "u3775",
        sequence: 4,
        observedAt: "2026-08-29T00:00:15.000Z",
        snapshotHash: "c".repeat(64),
      },
      agents: [{
        agentId: "codex:session-1",
        provider: "codex",
        state: "unassigned",
        repositoryId: "0xmikko/0_agents",
        worktree: "/work/0_agents",
        branch: "feat/example",
        planId: null,
        planRevision: null,
        taskId: null,
        lastActivityAt: "2026-08-29T00:00:14.000Z",
        idleSeconds: 1,
        elapsedActiveMinutes: null,
        ownerWaitReason: null,
        ownerWaitStartedAt: null,
      }],
      plans: [{
        planId: "0xmikko/0_agents:docs/plans/example.md",
        planRevision: "b".repeat(64),
        goal: "Ship the fixture",
        completedTaskSamples: [],
        progress: {
          deliveryId: "D1",
          tasks: { completed: 0, total: 1 },
          activeMinutes: { completed: 0, remaining: 10, total: 10 },
          credits: { completed: 0, remaining: 1, total: 1 },
          completionPercent: 0,
          stages: [{
            id: "D1-S1",
            depends: [],
            parallelWith: [],
            tasks: { completed: 0, total: 1 },
            activeMinutes: { completed: 0, remaining: 10, total: 10 },
            credits: { completed: 0, remaining: 1, total: 1 },
            completionPercent: 0,
            remainingTasks: [{ taskId: "TASK_001", predictedActiveMinutes: 10 }],
          }],
        },
      }],
    });
    expect(snapshot.heartbeat.sequence).toBe(4);
    expect(snapshot.agents[0]?.state).toBe("unassigned");
    expect(snapshot.plans[0]?.planRevision).toBe("b".repeat(64));
    expect(() => decodeMachineSnapshot({ ...snapshot, heartbeat: { ...snapshot.heartbeat, protocolVersion: 2 } }))
      .toThrow("protocolVersion");
    expect(() => decodeMachineSnapshot({
      ...snapshot,
      agents: [{ ...snapshot.agents[0], state: "attention_guess" }],
    })).toThrow("agent state");
  });
});
