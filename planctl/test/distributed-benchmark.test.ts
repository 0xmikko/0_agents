import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runDistributedBenchmark } from "../bench/distributed-benchmark";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("distributed scale certificate", () => {
  /**
   * @test-id: tst_cert_planctl_scale_001
   * @scenario: scn_planctl_scale_001
   * @covers: planctl/bench/distributed-benchmark.ts::runDistributedBenchmark
   * @deterministic: cardinality yes; host timings are reported, never asserted
   * @fixtures: fixed 100-machine/1,000-agent synthetic snapshot set
   * Test environment: real SQLite ingest and progress query
   * Clients: benchmark operator
   * Mocks: fixed clock only
   * Data: ten agents per machine reporting one canonical plan revision
   */
  it("tst_cert_planctl_scale_001 proves exact fixture and read-model cardinality without timing thresholds", () => {
    const root = mkdtempSync(join(tmpdir(), "planctl-scale-"));
    roots.push(root);
    const result = runDistributedBenchmark(root, "2026-08-29T20:00:00.000Z");

    expect(result.machineCount).toBe(100);
    expect(result.agentCount).toBe(1_000);
    expect(result.persistedMachineCount).toBe(100);
    expect(result.progressAgentCount).toBe(1_000);
    expect(result.planCount).toBe(1);
    expect(result.totalSnapshotBytes).toBeGreaterThan(0);
    expect(result.averageSnapshotBytes).toBeGreaterThan(0);
    expect(result.ingest.p50Milliseconds).toBeGreaterThanOrEqual(0);
    expect(result.ingest.p95Milliseconds).toBeGreaterThanOrEqual(result.ingest.p50Milliseconds);
    expect(result.progressQuery.p95Milliseconds).toBeGreaterThanOrEqual(result.progressQuery.p50Milliseconds);
  });
});
