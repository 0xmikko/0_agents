import { createHash } from "node:crypto";

import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";

import type { AgentSnapshot, MachineHeartbeat, MachineSnapshot, ReportedPlanProgress } from "../core/snapshot-protocol";
import type { MachineStore } from "./state/machine-store";

export const COLLECTOR_OPTIONS = Symbol("COLLECTOR_OPTIONS");

export interface CollectorClock {
  now(): Date;
}

export interface CollectorScheduler {
  every(milliseconds: number, task: () => void): unknown;
  cancel(handle: unknown): void;
}

export interface MachineObservation {
  readonly agents: readonly AgentSnapshot[];
  readonly plans: readonly ReportedPlanProgress[];
  readonly sourceIssues: readonly string[];
}

export interface CollectorObservationSource {
  scan(now: Date): MachineObservation | Promise<MachineObservation>;
}

export interface CollectorTransport {
  sendSnapshot(snapshot: MachineSnapshot): Promise<void>;
  sendHeartbeat(heartbeat: MachineHeartbeat): Promise<void>;
}

export interface CollectorOptions {
  readonly machineId: string;
  readonly scanMs: number;
  readonly heartbeatMs: number;
  readonly store: MachineStore;
  readonly source: CollectorObservationSource;
  readonly transport: CollectorTransport;
  readonly clock: CollectorClock;
  readonly scheduler: CollectorScheduler;
}

export interface CollectorHealth {
  readonly status: "healthy" | "degraded";
  readonly running: boolean;
  readonly pendingSnapshot: boolean;
  readonly consecutiveSendFailures: number;
  readonly sourceIssues: readonly string[];
  readonly lastScanAt: string | null;
  readonly lastSuccessfulSendAt: string | null;
}

function positiveMilliseconds(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function sortedObservation(observation: MachineObservation): Omit<MachineObservation, "sourceIssues"> {
  return {
    agents: [...observation.agents].sort((left, right) => left.agentId.localeCompare(right.agentId)),
    plans: [...observation.plans].sort((left, right) => left.planId.localeCompare(right.planId)),
  };
}

export function observationHash(observation: MachineObservation): string {
  return createHash("sha256").update(JSON.stringify(sortedObservation(observation))).digest("hex");
}

function due(timestamp: string | null, now: Date): boolean {
  return timestamp === null || Date.parse(timestamp) <= now.getTime();
}

function nextRetryAt(now: Date, sequence: number, attempts: number): string {
  const exponential = Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
  const deterministicJitter = sequence % 251;
  return new Date(now.getTime() + exponential + deterministicJitter).toISOString();
}

@Injectable()
export class CollectorService implements OnModuleInit, OnModuleDestroy {
  readonly #options: CollectorOptions;
  #scheduleHandle: unknown | null = null;
  #collecting = false;
  #consecutiveSendFailures = 0;
  #sourceIssues: readonly string[] = [];
  #lastScanAt: string | null = null;
  #lastSuccessfulSendAt: string | null = null;
  #lastHeartbeatAt: number;

  constructor(@Inject(COLLECTOR_OPTIONS) options: CollectorOptions) {
    positiveMilliseconds(options.scanMs, "collector scan interval");
    positiveMilliseconds(options.heartbeatMs, "collector heartbeat interval");
    this.#options = options;
    this.#lastHeartbeatAt = options.clock.now().getTime();
  }

  onModuleInit(): void {
    this.start();
  }

  onModuleDestroy(): void {
    this.stop();
  }

  start(): void {
    if (this.#scheduleHandle !== null) return;
    this.#scheduleHandle = this.#options.scheduler.every(this.#options.scanMs, () => {
      void this.collectOnce();
    });
  }

  stop(): void {
    if (this.#scheduleHandle === null) return;
    this.#options.scheduler.cancel(this.#scheduleHandle);
    this.#scheduleHandle = null;
  }

  health(): CollectorHealth {
    const pendingSnapshot = this.#options.store.outboxCount() > 0;
    return {
      status: this.#consecutiveSendFailures > 0 || this.#sourceIssues.length > 0 || pendingSnapshot
        ? "degraded"
        : "healthy",
      running: this.#scheduleHandle !== null,
      pendingSnapshot,
      consecutiveSendFailures: this.#consecutiveSendFailures,
      sourceIssues: this.#sourceIssues,
      lastScanAt: this.#lastScanAt,
      lastSuccessfulSendAt: this.#lastSuccessfulSendAt,
    };
  }

  /**
   * @tested-by: tst_svc_planctld_collector_001
   * @invariant: CTL-002 telemetry failures are captured as health and never escape into local plan execution.
   * @invariant: CTL-007 disconnected scans coalesce to one latest snapshot and retry on a deterministic bounded schedule.
   */
  async collectOnce(): Promise<CollectorHealth> {
    if (this.#collecting) return this.health();
    this.#collecting = true;
    const now = this.#options.clock.now();
    this.#lastScanAt = now.toISOString();
    try {
      const observation = await this.#options.source.scan(now);
      this.#sourceIssues = observation.sourceIssues;
      const hash = observationHash(observation);
      if (hash !== this.#options.store.latestSnapshotHash()) {
        const safe = sortedObservation(observation);
        this.#options.store.queueLatest({
          machineId: this.#options.machineId,
          observedAt: now.toISOString(),
          snapshotHash: hash,
          agents: safe.agents,
          plans: safe.plans,
        });
      }

      const pending = this.#options.store.pendingSnapshot();
      if (pending !== null && due(pending.nextAttemptAt, now)) {
        try {
          await this.#options.transport.sendSnapshot(pending.snapshot);
          this.#options.store.acknowledge(pending.snapshot.heartbeat.sequence);
          this.#consecutiveSendFailures = 0;
          this.#lastSuccessfulSendAt = now.toISOString();
          this.#lastHeartbeatAt = now.getTime();
        } catch {
          this.#consecutiveSendFailures += 1;
          this.#options.store.recordSendFailure(pending.snapshot.heartbeat.sequence, {
            attemptedAt: now.toISOString(),
            nextAttemptAt: nextRetryAt(now, pending.snapshot.heartbeat.sequence, pending.attempts),
            errorCode: "server_unavailable",
          });
        }
      } else if (pending === null && now.getTime() - this.#lastHeartbeatAt >= this.#options.heartbeatMs) {
        const heartbeat = this.#options.store.nextHeartbeat(this.#options.machineId, now.toISOString());
        try {
          await this.#options.transport.sendHeartbeat(heartbeat);
          this.#consecutiveSendFailures = 0;
          this.#lastSuccessfulSendAt = now.toISOString();
        } catch {
          this.#consecutiveSendFailures += 1;
        } finally {
          this.#lastHeartbeatAt = now.getTime();
        }
      }
    } catch {
      this.#sourceIssues = ["observation_scan_failed"];
    } finally {
      this.#collecting = false;
    }
    return this.health();
  }
}
