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
      token: "machine-token",
      requestTimeoutMs: 250,
      fetch: async () => new Response(JSON.stringify({ generatedAt: "2026-08-29T20:00:00.000Z", plans: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    });
    expect(remote.generatedAt).toBe("2026-08-29T20:00:00.000Z");
    expect(remote.plans).toEqual([]);
  });
});
