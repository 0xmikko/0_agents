import { describe, expect, it } from "bun:test";

import { renderProgress } from "../src/cli/render";
import { readServerProgress } from "../src/cli/server-client";

describe("planctl progress", () => {
  /**
   * @test-id: tst_cli_planctl_progress_001
   * @scenario: scn_planctl_progress_001
   * @covers: planctl/src/cli/render.ts::renderProgress
   * @covers: planctl/src/cli/server-client.ts::readServerProgress
   * @deterministic: yes
   * @fixtures: injected FetchLike with bounded response and connection deadlines
   */
  it("tst_cli_planctl_progress_001 reports offline evidence and bounds authenticated reads", async () => {
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
