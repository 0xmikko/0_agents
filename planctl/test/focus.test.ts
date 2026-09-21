import { describe, expect, it } from "bun:test";

import { renderFocus, renderProgress, type FocusView } from "../src/cli/render";
import { readServerProgress } from "../src/cli/server-client";

const FOCUSED: FocusView = {
  source: "local plan docs/plans/observer.md",
  status: "focused",
  evidence: "TaskRun receipt matches HEAD ancestry and the locked implementation revision",
  goal: "Keep coding agents focused on an approved long-term Goal.",
  currentTask: {
    id: "PLCTL_013",
    story: "show an agent its exact approved work",
    writes: ["planctl/src/cli/main.ts"],
    how: "project the canonical plan read model",
    red: "bun test test/focus.test.ts",
  },
  nextReadyTaskIds: ["PLCTL_015"],
  completionPercent: 40,
  completedTasks: 4,
  totalTasks: 10,
  remainingActiveMinutes: 210,
  criticalPathMinutes: 120,
  estimatedDeliveryAt: "2026-08-29T22:00:00.000Z",
  ownerWaitReason: null,
};

describe("planctl focus and progress", () => {
  /*
   * @test-id: tst_cli_planctl_focus_001
   * @scenario: scn_planctl_agent_focus_001
   * @covers: planctl/src/cli/render.ts::renderFocus
   * @deterministic: yes
   * @fixtures: typed local and server view models
   * Test environment: Bun unit test
   * Clients: planctl CLI renderer
   * Mocks: injected FetchLike at the HTTP boundary
   * Data: focused, unassigned, drifted, offline-server and owner-blocked evidence
   */
  it("tst_cli_planctl_focus_001 names the evidence for every attention view", async () => {
    const focused = renderFocus(FOCUSED);
    expect(focused).toContain("Status: focused");
    expect(focused).toContain("Evidence: TaskRun receipt matches HEAD ancestry");
    expect(focused).toContain("Goal: Keep coding agents focused");
    expect(focused).toContain("Current Task: PLCTL_013");
    expect(focused).toContain("Writes: planctl/src/cli/main.ts");
    expect(focused).toContain("Next ready: PLCTL_015");

    const unassigned = renderFocus({
      ...FOCUSED,
      status: "unassigned",
      evidence: "no Task was selected and no TaskRun receipt was addressed",
      currentTask: null,
    });
    expect(unassigned).toContain("Status: unassigned");
    expect(unassigned).toContain("Evidence: no Task was selected");

    const drifted = renderFocus({
      ...FOCUSED,
      source: "server plan repository/docs/plans/observer.md",
      status: "plan_drift",
      evidence: "local revision aaaa differs from server revision bbbb",
    });
    expect(drifted).toContain("Status: plan_drift");
    expect(drifted).toContain("local revision aaaa differs from server revision bbbb");

    const ownerBlocked = renderFocus({
      ...FOCUSED,
      status: "awaiting_owner",
      evidence: "structured owner-wait receipt started at 2026-08-29T20:00:00.000Z",
      ownerWaitReason: "Choose the public hostname",
      estimatedDeliveryAt: null,
    });
    expect(ownerBlocked).toContain("Status: awaiting_owner");
    expect(ownerBlocked).toContain("Owner response needed: Choose the public hostname");
    expect(ownerBlocked).toContain("ETA: unknown while owner response is required");

    const offline = renderProgress({
      source: "server https://planctl.example.test",
      status: "offline",
      evidence: "request exceeded the configured 250 ms timeout",
      plans: [],
    });
    expect(offline).toContain("Status: offline");
    expect(offline).toContain("Evidence: request exceeded the configured 250 ms timeout");

    const remote = await readServerProgress({
      baseUrl: "https://planctl.example.test",
      machineId: "machine-a",
      token: "machine-token",
      connectTimeoutMs: 50,
      requestTimeoutMs: 250,
      fetch: async (_input, init) => {
        const headers = new Headers(init?.headers);
        expect(headers.get("x-planctl-machine-id")).toBe("machine-a");
        expect(headers.get("authorization")).toBe("Bearer machine-token");
        return new Response(JSON.stringify({
          generatedAt: "2026-08-29T20:00:00.000Z",
          plans: [{
            planId: "fixture/repository:docs/plans/observer.md",
            planRevision: "a".repeat(64),
            goal: "Keep coding agents focused",
            completionPercent: 40,
            tasks: { completed: 4, total: 10 },
            activeMinutes: { completed: 90, remaining: 60, total: 150 },
            attention: { ownerWait: 0, stale: 0, unassigned: 0 },
            remainingActiveMinutes: 45,
            criticalPathMinutes: 35,
            calibratedCriticalPathMinutes: 57.5,
            estimatedDeliveryAt: "2026-08-29T20:57:30.000Z",
          }],
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(remote.generatedAt).toBe("2026-08-29T20:00:00.000Z");
    expect(remote.plans[0]?.remainingActiveMinutes).toBe(45);

    await expect(readServerProgress({
      baseUrl: "https://planctl.example.test",
      machineId: "machine-a",
      token: "machine-token",
      connectTimeoutMs: 5,
      requestTimeoutMs: 500,
      fetch: (_input, init) => new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal === null || signal === undefined) throw new Error("bounded request signal is missing");
        const aborted = (): void => reject(signal.reason);
        if (signal.aborted) aborted();
        else signal.addEventListener("abort", aborted, { once: true });
      }),
    })).rejects.toThrow("connection timeout");

    await expect(readServerProgress({
      baseUrl: "https://planctl.example.test",
      machineId: "machine-a",
      token: "machine-token",
      connectTimeoutMs: 5,
      requestTimeoutMs: 20,
      fetch: async (_input, init) => {
        const signal = init?.signal;
        if (signal === null || signal === undefined) throw new Error("bounded request signal is missing");
        return new Response(new ReadableStream({
          start: (controller) => {
            const aborted = (): void => controller.error(signal.reason);
            if (signal.aborted) aborted();
            else signal.addEventListener("abort", aborted, { once: true });
          },
        }), { headers: { "content-type": "application/json" } });
      },
    })).rejects.toThrow("timed out");
  });
});

describe("planctl focus --brief", () => {
  /*
   * @test-id: tst_focus_brief_001
   * @covers: planctl/src/cli/main.ts::focus --brief
   * @deterministic: yes
   * @fixtures: a temporary repository with one plan in each state
   * @invariant: the brief is at most twelve lines, comes from the plan's own
   * state, and says in each state where the agent is and what it can do next
   * with the exact commands; without a plan it says so in one line.
   */
  it("tst_focus_brief_001 prints the position and the next commands for a draft, an approved plan and no plan", async () => {
    const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { execFileSync, spawnSync } = await import("node:child_process");
    const root = mkdtempSync(join(tmpdir(), "planctl-brief-"));
    const git = (...args: readonly string[]): string =>
      execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
    const run = (...args: readonly string[]) =>
      spawnSync("bun", [join(import.meta.dir, "../src/cli/main.ts"), ...args], { cwd: root, encoding: "utf8" });
    try {
      git("init", "-q");
      git("config", "user.email", "t@t");
      git("config", "user.name", "t");
      git("commit", "-q", "--allow-empty", "-m", "the repository");
      mkdirSync(join(root, "docs", "plans"), { recursive: true });

      // no plan on this branch
      const none = run("focus", "--brief");
      expect(none.status).toBe(0);
      expect(none.stdout.trim().split("\n")).toHaveLength(1);
      expect(none.stdout).toContain("No plan here");
      expect(none.stdout).toContain("/blueprint");

      // a draft
      const plan = "docs/plans/fixture.md";
      expect(run("init", plan, "--title", "Fixture plan").status).toBe(0);
      git("commit", "-qm", "open the plan");
      const draft = run("focus", "--brief");
      expect(draft.status).toBe(0);
      const draftLines = draft.stdout.trim().split("\n");
      expect(draftLines.length).toBeLessThanOrEqual(12);
      expect(draft.stdout).toContain("SPEC_DRAFT");
      expect(draft.stdout).toContain("set-spec");
      expect(draft.stdout).toContain("approve-spec");
      expect(draft.stdout).toContain("owner's word");

      // approved, one Task started
      writeFileSync(join(root, "spec.md"), readFileSync(join(import.meta.dir, "fixtures/plan-lint.md"), "utf8").replace("Reduce invalid changes from three per release to zero.", "Ship one observable result."));
      expect(run("set-spec", plan, "--from", "spec.md").status).toBe(0);
      git("commit", "-qam", "spec");
      expect(run("approve-spec", plan, "--owner-word", "yes").status).toBe(0);
      writeFileSync(join(root, "delivery.json"), JSON.stringify({
        id: "D1", title: "writer", branch: "feat/writer", depends: [], gate: ["backend"], active: true,
        stageGraph: "D1-S1 -> D1-S2", predictedExternalWaitMinutes: 0,
        description: "What changed for people. One.\n\nWhat changed in the code. Two.\n\nHow it was proven. Three.",
      }));
      const stage = (id: string, depends: string[], task: string) => ({
        id, deliveryId: "D1", title: `Stage ${id}`, owner: "agent-1", profile: "fast", depends, parallelWith: [],
        writes: ["scripts/"], tempRoot: `.tmp/code-production/fixture/${id}`,
        predictedActiveMinutes: 0, predictedCredits: 0, verifyActiveMinutes: 0, verifyCredits: 0,
        description: "What this Stage solves. A.\n\nWhat is built. B.\n\nHow it is proven. C.\n\nCommit. feat: x",
        tasks: [{ id: task, story: `Stage ${id} writes one file under scripts/ that prints its own id`, writes: ["scripts/"], predictedActiveMinutes: 0, predictedCredits: 0,
          how: "do it", red: "bun run agent:test:backend -- test/x.test.ts" }],
        criteria: ["`true` exits 0 — proven", "Commit"],
      });
      writeFileSync(join(root, "s1.json"), JSON.stringify(stage("D1-S1", [], "T_001")));
      writeFileSync(join(root, "s2.json"), JSON.stringify(stage("D1-S2", ["D1-S1"], "T_002")));
      for (const step of [
        run("put-delivery", plan, "--from", "delivery.json"),
        run("put-stage", plan, "--from", "s1.json"),
        run("put-stage", plan, "--from", "s2.json"),
        run("approve-plan", plan, "--owner-word", "yes"),
      ]) expect(step.status, `${step.stdout}\n${step.stderr}`).toBe(0);
      git("commit", "-qam", "approve");
      expect(run("start-task", plan, "--task", "T_001").status).toBe(0);

      const working = run("focus", "--brief");
      expect(working.status, `${working.stdout}\n${working.stderr}`).toBe(0);
      const lines = working.stdout.trim().split("\n");
      expect(lines.length).toBeLessThanOrEqual(12);
      expect(working.stdout).toContain("APPROVED. Done: 0 of 2 Stages.");
      expect(working.stdout).toContain("D1-S1");
      expect(working.stdout).toContain("T_001");
      expect(working.stdout).toContain("bun run agent:test:backend -- test/x.test.ts");
      expect(working.stdout).toContain("complete-task");
      expect(working.stdout).toContain("add-deviation");
      expect(working.stdout).toContain("Waiting: D1-S2");
      expect(working.stdout).toContain("Without the owner:");
      expect(working.stdout).toContain("Owner's word only:");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);
});
