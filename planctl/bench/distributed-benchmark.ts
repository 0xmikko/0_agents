import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { hostname, platform, arch, tmpdir } from "node:os";
import { join } from "node:path";

import { ServerStore } from "../src/server/persistence/server-store";
import { ProgressService } from "../src/server/progress/progress.service";

import type { AgentSnapshot, MachineSnapshot, ReportedPlanProgress } from "../src/core/snapshot-protocol";
import type { ServerStoreOptions } from "../src/server/persistence/server-store";

const MACHINE_COUNT = 100;
const AGENTS_PER_MACHINE = 10;
const PLAN_ID = "benchmark/repository:docs/plans/scale.md";
const PLAN_REVISION = "b".repeat(64);

export interface TimingSummary {
  readonly samples: number;
  readonly p50Milliseconds: number;
  readonly p95Milliseconds: number;
}

export interface DistributedBenchmarkResult {
  readonly host: {
    readonly hostname: string;
    readonly platform: string;
    readonly architecture: string;
    readonly bunVersion: string;
  };
  readonly machineCount: number;
  readonly agentCount: number;
  readonly persistedMachineCount: number;
  readonly progressAgentCount: number;
  readonly planCount: number;
  readonly totalSnapshotBytes: number;
  readonly averageSnapshotBytes: number;
  readonly ingest: TimingSummary;
  readonly progressQuery: TimingSummary;
}

function timing(samples: readonly number[]): TimingSummary {
  if (samples.length === 0) throw new Error("benchmark timing needs samples");
  const ordered = samples.slice().sort((left, right) => left - right);
  const percentile = (ratio: number): number => {
    const index = Math.max(0, Math.ceil(ordered.length * ratio) - 1);
    const value = ordered[index];
    if (value === undefined) throw new Error("benchmark percentile sample is missing");
    return value;
  };
  return { samples: ordered.length, p50Milliseconds: percentile(0.5), p95Milliseconds: percentile(0.95) };
}

function progress(): ReportedPlanProgress {
  return {
    planId: PLAN_ID,
    planRevision: PLAN_REVISION,
    goal: "Measure the distributed observer baseline",
    completedTaskSamples: [],
    progress: {
      deliveryId: "D1",
      tasks: { completed: 5, total: 10 },
      activeMinutes: { completed: 50, remaining: 50, total: 100 },
      credits: { completed: 20, remaining: 20, total: 40 },
      completionPercent: 50,
      stages: [{
        id: "D1-S1",
        depends: [],
        parallelWith: [],
        tasks: { completed: 5, total: 10 },
        activeMinutes: { completed: 50, remaining: 50, total: 100 },
        credits: { completed: 20, remaining: 20, total: 40 },
        completionPercent: 50,
        remainingTasks: Array.from({ length: 5 }, (_, index) => ({
          taskId: `BENCH_${String(index + 6).padStart(3, "0")}`,
          predictedActiveMinutes: 10,
        })),
      }],
    },
  };
}

function agent(machineIndex: number, agentIndex: number, observedAt: string): AgentSnapshot {
  return {
    agentId: `codex:benchmark-${machineIndex}-${agentIndex}`,
    provider: "codex",
    state: "working",
    repositoryId: "benchmark/repository",
    worktree: `/benchmark/machine-${machineIndex}/agent-${agentIndex}`,
    branch: "feat/scale",
    planId: PLAN_ID,
    planRevision: PLAN_REVISION,
    taskId: `BENCH_${String(agentIndex + 1).padStart(3, "0")}`,
    lastActivityAt: observedAt,
    idleSeconds: agentIndex,
    elapsedActiveMinutes: agentIndex + 1,
    ownerWaitReason: null,
    ownerWaitStartedAt: null,
  };
}

function snapshot(machineIndex: number, observedAt: string): MachineSnapshot {
  const machineId = `benchmark-${String(machineIndex).padStart(3, "0")}`;
  return {
    heartbeat: {
      protocolVersion: 1,
      machineId,
      sequence: 1,
      observedAt,
      snapshotHash: createHash("sha256").update(`snapshot:${machineId}`).digest("hex"),
    },
    agents: Array.from({ length: AGENTS_PER_MACHINE }, (_, agentIndex) => agent(machineIndex, agentIndex, observedAt)),
    plans: [progress()],
  };
}

/** @tested-by: tst_cert_planctl_scale_001 */
export function runDistributedBenchmark(root: string, now: string): DistributedBenchmarkResult {
  if (!Number.isFinite(Date.parse(now))) throw new Error("benchmark now must be an ISO timestamp");
  mkdirSync(root, { recursive: true });
  const options: ServerStoreOptions = {
    databasePath: join(root, "server.sqlite"),
    machineOfflineAfterSeconds: 60,
    transitionScanMs: null,
    now: () => now,
  };
  const store = new ServerStore(options);
  try {
    const ingestSamples: number[] = [];
    let totalSnapshotBytes = 0;
    for (let machineIndex = 0; machineIndex < MACHINE_COUNT; machineIndex += 1) {
      const value = snapshot(machineIndex, now);
      store.registerMachine(value.heartbeat.machineId, `benchmark-hash-${machineIndex}`);
      const body = JSON.stringify(value);
      totalSnapshotBytes += Buffer.byteLength(body);
      const started = performance.now();
      store.acceptSnapshot(value, now);
      ingestSamples.push(performance.now() - started);
    }
    const progressService = new ProgressService(store, options);
    const querySamples: number[] = [];
    let portfolio = progressService.portfolio();
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      portfolio = progressService.portfolio();
      querySamples.push(performance.now() - started);
    }
    const view = portfolio.plans[0];
    if (view === undefined) throw new Error("benchmark plan is missing");
    return {
      host: { hostname: hostname(), platform: platform(), architecture: arch(), bunVersion: Bun.version },
      machineCount: MACHINE_COUNT,
      agentCount: MACHINE_COUNT * AGENTS_PER_MACHINE,
      persistedMachineCount: store.currentMachines().length,
      progressAgentCount: view.activeAgents.length,
      planCount: portfolio.plans.length,
      totalSnapshotBytes,
      averageSnapshotBytes: totalSnapshotBytes / MACHINE_COUNT,
      ingest: timing(ingestSamples),
      progressQuery: timing(querySamples),
    };
  } finally {
    store.onModuleDestroy();
  }
}

if (import.meta.main) {
  const root = mkdtempSync(join(tmpdir(), "planctl-distributed-benchmark-"));
  try {
    process.stdout.write(`${JSON.stringify(runDistributedBenchmark(root, new Date().toISOString()), null, 2)}\n`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
