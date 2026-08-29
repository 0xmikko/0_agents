import { Database } from "bun:sqlite";

import { Global, Inject, Injectable, Module } from "@nestjs/common";

import { decodeMachineSnapshot } from "../../core/snapshot-protocol";

import type { DynamicModule, OnModuleDestroy } from "@nestjs/common";
import type { AgentSnapshot, MachineHeartbeat, MachineSnapshot, ReportedPlanProgress } from "../../core/snapshot-protocol";

export const SERVER_STORE_OPTIONS = Symbol("SERVER_STORE_OPTIONS");

export interface ServerStoreOptions {
  readonly databasePath: string;
  readonly machineOfflineAfterSeconds: number;
  readonly transitionScanMs: number | null;
  readonly now: () => string;
}

export interface StoredMachineSnapshot {
  readonly machineId: string;
  readonly sequence: number;
  readonly snapshotHash: string;
  readonly observedAt: string;
  readonly receivedAt: string;
  readonly snapshot: MachineSnapshot;
}

export interface CurrentMachineState extends StoredMachineSnapshot {
  readonly machineState: "online" | "offline";
}

export interface CanonicalPlanRecord {
  readonly planId: string;
  readonly planRevision: string;
  readonly goal: string;
  readonly progress: ReportedPlanProgress["progress"];
  readonly updatedAt: string;
}

export interface CalibrationSampleRecord {
  readonly predictedActiveMinutes: number;
  readonly actualActiveMinutes: number;
}

export class SnapshotSequenceError extends Error {}
export class SnapshotReplayError extends Error {}

export interface StoredAgentObservation extends AgentSnapshot {
  readonly machineId: string;
  readonly machineState: "online" | "offline";
  readonly receivedAt: string;
}

export type TransitionKind = "machine_offline" | "stale" | "owner_wait" | "unassigned" | "recovery" | "plan_drift";

export type TransitionDetail = Readonly<Record<string, string | number | boolean | null>>;

export interface TransitionRecord {
  readonly transitionKey: string;
  readonly kind: TransitionKind;
  readonly entityKey: string;
  readonly machineId: string | null;
  readonly agentId: string | null;
  readonly planId: string | null;
  readonly taskId: string | null;
  readonly previousState: string | null;
  readonly currentState: string;
  readonly occurredAt: string;
  readonly detail: TransitionDetail;
}

export type AlertTransitionRecord = TransitionRecord & {
  readonly claimedAt: string;
};

export interface ObservedStateChange {
  readonly entityKey: string;
  readonly currentState: string;
  readonly attentionKind: Exclude<TransitionKind, "recovery"> | null;
  readonly machineId: string | null;
  readonly agentId: string | null;
  readonly planId: string | null;
  readonly taskId: string | null;
  readonly occurredAt: string;
  readonly detail: TransitionDetail;
}

interface MachineRow {
  readonly machine_id: string;
  readonly credential_hash: string;
  readonly last_sequence: number | null;
  readonly last_snapshot_hash: string | null;
  readonly last_observed_at: string | null;
  readonly last_received_at: string | null;
  readonly snapshot_json: string | null;
  readonly machine_state: "online" | "offline";
}

interface CountRow {
  readonly count: number;
}

interface JournalModeRow {
  readonly journal_mode: string;
}

interface CanonicalPlanRow {
  readonly plan_id: string;
  readonly plan_revision: string;
  readonly goal: string;
  readonly progress_json: string;
  readonly updated_at: string;
}

interface ObservedStateRow {
  readonly state: string;
  readonly version: number;
}

interface TransitionRow {
  readonly transition_key: string;
  readonly kind: TransitionKind;
  readonly entity_key: string;
  readonly machine_id: string | null;
  readonly agent_id: string | null;
  readonly plan_id: string | null;
  readonly task_id: string | null;
  readonly previous_state: string | null;
  readonly current_state: string;
  readonly occurred_at: string;
  readonly detail_json: string;
}

interface AlertTransitionRow extends TransitionRow {
  readonly claimed_at: string;
}

interface CalibrationRow {
  readonly predicted_active_minutes: number;
  readonly actual_active_minutes: number;
}

function requireTimestamp(value: string, name: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${name} must be an ISO timestamp`);
  return value;
}

function machineSnapshotFromRow(row: MachineRow): StoredMachineSnapshot | null {
  if (row.last_sequence === null || row.last_snapshot_hash === null || row.last_observed_at === null
    || row.last_received_at === null || row.snapshot_json === null) return null;
  const parsed: unknown = JSON.parse(row.snapshot_json);
  return {
    machineId: row.machine_id,
    sequence: row.last_sequence,
    snapshotHash: row.last_snapshot_hash,
    observedAt: row.last_observed_at,
    receivedAt: row.last_received_at,
    snapshot: decodeMachineSnapshot(parsed),
  };
}

function transitionDetail(input: string): TransitionDetail {
  const parsed: unknown = JSON.parse(input);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("stored transition detail is invalid");
  }
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== null && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new Error("stored transition detail contains a non-scalar value");
    }
    result[key] = value;
  }
  return result;
}

function transitionFromRow(row: TransitionRow): TransitionRecord {
  return {
    transitionKey: row.transition_key,
    kind: row.kind,
    entityKey: row.entity_key,
    machineId: row.machine_id,
    agentId: row.agent_id,
    planId: row.plan_id,
    taskId: row.task_id,
    previousState: row.previous_state,
    currentState: row.current_state,
    occurredAt: row.occurred_at,
    detail: transitionDetail(row.detail_json),
  };
}

function canonicalPlanFromRow(row: CanonicalPlanRow): CanonicalPlanRecord {
  const decoded = decodeMachineSnapshot({
    heartbeat: {
      protocolVersion: 1,
      machineId: "planctl-server",
      sequence: 0,
      observedAt: row.updated_at,
      snapshotHash: "0".repeat(64),
    },
    agents: [],
    plans: [{
      planId: row.plan_id,
      planRevision: row.plan_revision,
      goal: row.goal,
      progress: JSON.parse(row.progress_json) as unknown,
    }],
  });
  const plan = decoded.plans[0];
  if (plan === undefined) throw new Error(`canonical plan ${row.plan_id} is missing`);
  return {
    planId: plan.planId,
    planRevision: plan.planRevision,
    goal: plan.goal,
    progress: plan.progress,
    updatedAt: row.updated_at,
  };
}

function isRecoverableAttentionState(state: string): boolean {
  return state === "offline" || state === "stale" || state === "awaiting_owner" || state === "plan_drift";
}

@Injectable()
export class ServerStore implements OnModuleDestroy {
  readonly #database: Database;

  constructor(@Inject(SERVER_STORE_OPTIONS) readonly options: ServerStoreOptions) {
    this.#database = new Database(options.databasePath, { create: true, strict: true });
    this.#database.exec("PRAGMA journal_mode = WAL");
    this.#database.exec("PRAGMA foreign_keys = ON");
    this.#database.exec("PRAGMA busy_timeout = 5000");
    this.#migrate();
  }

  #migrate(): void {
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS machines (
        machine_id TEXT PRIMARY KEY,
        credential_hash TEXT NOT NULL,
        last_sequence INTEGER,
        last_snapshot_hash TEXT,
        last_observed_at TEXT,
        last_received_at TEXT,
        snapshot_json TEXT,
        machine_state TEXT NOT NULL DEFAULT 'online' CHECK (machine_state IN ('online', 'offline'))
      );
      CREATE TABLE IF NOT EXISTS machine_snapshots (
        machine_id TEXT NOT NULL REFERENCES machines(machine_id),
        sequence INTEGER NOT NULL,
        snapshot_hash TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        PRIMARY KEY (machine_id, sequence),
        UNIQUE (machine_id, snapshot_hash)
      );
      CREATE TABLE IF NOT EXISTS canonical_plans (
        plan_id TEXT PRIMARY KEY,
        plan_revision TEXT NOT NULL,
        goal TEXT NOT NULL,
        progress_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS observed_states (
        entity_key TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        version INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS transitions (
        transition_key TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        machine_id TEXT,
        agent_id TEXT,
        plan_id TEXT,
        task_id TEXT,
        previous_state TEXT,
        current_state TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        detail_json TEXT NOT NULL,
        notified_at TEXT,
        claimed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS calibration_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_id TEXT NOT NULL,
        predicted_active_minutes REAL NOT NULL CHECK (predicted_active_minutes > 0),
        actual_active_minutes REAL NOT NULL CHECK (actual_active_minutes >= 0),
        completed_at TEXT NOT NULL
      );
    `);
  }

  onModuleDestroy(): void {
    this.#database.close();
  }

  journalMode(): string {
    const row = this.#database.query<JournalModeRow, []>("PRAGMA journal_mode").get();
    if (row === null) throw new Error("SQLite did not report journal mode");
    return row.journal_mode.toLowerCase();
  }

  registerMachine(machineId: string, credentialHash: string): void {
    try {
      this.#database.query("INSERT INTO machines (machine_id, credential_hash) VALUES (?, ?)").run(
        machineId,
        credentialHash,
      );
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        throw new Error(`machine ${machineId} already exists`);
      }
      throw error;
    }
  }

  machineCredentialHash(machineId: string): string | null {
    const row = this.#database.query<Pick<MachineRow, "credential_hash">, [string]>(
      "SELECT credential_hash FROM machines WHERE machine_id = ?",
    ).get(machineId);
    return row?.credential_hash ?? null;
  }

  /**
   * @tested-by: tst_int_planctl_ingest_001
   * @invariant: CTL-003 sequence, snapshot and server receipt time advance in one WAL transaction.
   */
  acceptSnapshot(snapshot: MachineSnapshot, receivedAtInput: string): StoredMachineSnapshot {
    const receivedAt = requireTimestamp(receivedAtInput, "snapshot receivedAt");
    const heartbeat = snapshot.heartbeat;
    const body = JSON.stringify(snapshot);
    const transaction = this.#database.transaction(() => {
      const machine = this.#database.query<MachineRow, [string]>(
        "SELECT * FROM machines WHERE machine_id = ?",
      ).get(heartbeat.machineId);
      if (machine === null) throw new Error(`machine ${heartbeat.machineId} is not enrolled`);
      if (machine.last_sequence !== null && heartbeat.sequence <= machine.last_sequence) {
        throw new SnapshotSequenceError(
          `snapshot sequence ${heartbeat.sequence} is not greater than ${machine.last_sequence}`,
        );
      }
      const replay = this.#database.query<CountRow, [string, string]>(
        "SELECT COUNT(*) AS count FROM machine_snapshots WHERE machine_id = ? AND snapshot_hash = ?",
      ).get(heartbeat.machineId, heartbeat.snapshotHash);
      if ((replay?.count ?? 0) > 0) {
        throw new SnapshotReplayError(`snapshot hash ${heartbeat.snapshotHash} was replayed`);
      }

      this.#database.query(`
        INSERT INTO machine_snapshots
          (machine_id, sequence, snapshot_hash, observed_at, received_at, snapshot_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        heartbeat.machineId,
        heartbeat.sequence,
        heartbeat.snapshotHash,
        heartbeat.observedAt,
        receivedAt,
        body,
      );
      this.#database.query(`
        UPDATE machines
        SET last_sequence = ?, last_snapshot_hash = ?, last_observed_at = ?,
            last_received_at = ?, snapshot_json = ?, machine_state = 'online'
        WHERE machine_id = ?
      `).run(
        heartbeat.sequence,
        heartbeat.snapshotHash,
        heartbeat.observedAt,
        receivedAt,
        body,
        heartbeat.machineId,
      );
      for (const plan of snapshot.plans) {
        const existing = this.#database.query<CanonicalPlanRow, [string]>(
          "SELECT * FROM canonical_plans WHERE plan_id = ?",
        ).get(plan.planId);
        if (existing === null) {
          this.#database.query(`
            INSERT INTO canonical_plans (plan_id, plan_revision, goal, progress_json, updated_at)
            VALUES (?, ?, ?, ?, ?)
          `).run(plan.planId, plan.planRevision, plan.goal, JSON.stringify(plan.progress), receivedAt);
          continue;
        }
        const canonical = canonicalPlanFromRow(existing);
        if (canonical.planRevision === plan.planRevision
          && plan.progress.activeMinutes.completed >= canonical.progress.activeMinutes.completed) {
          this.#database.query(`
            UPDATE canonical_plans
            SET goal = ?, progress_json = ?, updated_at = ?
            WHERE plan_id = ?
          `).run(plan.goal, JSON.stringify(plan.progress), receivedAt, plan.planId);
        }
      }
    });
    transaction.immediate();
    return {
      machineId: heartbeat.machineId,
      sequence: heartbeat.sequence,
      snapshotHash: heartbeat.snapshotHash,
      observedAt: heartbeat.observedAt,
      receivedAt,
      snapshot,
    };
  }

  /**
   * @tested-by: tst_int_planctl_ingest_001
   * @invariant: an unchanged heartbeat advances liveness and sequence without replacing the current observation.
   */
  acceptHeartbeat(heartbeat: MachineHeartbeat, receivedAtInput: string): StoredMachineSnapshot {
    const receivedAt = requireTimestamp(receivedAtInput, "heartbeat receivedAt");
    const transaction = this.#database.transaction(() => {
      const machine = this.#database.query<MachineRow, [string]>(
        "SELECT * FROM machines WHERE machine_id = ?",
      ).get(heartbeat.machineId);
      if (machine === null) throw new Error(`machine ${heartbeat.machineId} is not enrolled`);
      if (machine.last_sequence === null || machine.last_snapshot_hash === null || machine.snapshot_json === null) {
        throw new Error(`machine ${heartbeat.machineId} must send a snapshot before heartbeats`);
      }
      if (heartbeat.sequence <= machine.last_sequence) {
        throw new SnapshotSequenceError(
          `heartbeat sequence ${heartbeat.sequence} is not greater than ${machine.last_sequence}`,
        );
      }
      if (heartbeat.snapshotHash !== machine.last_snapshot_hash) {
        throw new SnapshotReplayError("heartbeat snapshotHash does not match the current snapshot");
      }
      this.#database.query(`
        UPDATE machines
        SET last_sequence = ?, last_observed_at = ?, last_received_at = ?, machine_state = 'online'
        WHERE machine_id = ?
      `).run(heartbeat.sequence, heartbeat.observedAt, receivedAt, heartbeat.machineId);
    });
    transaction.immediate();
    const stored = this.latestSnapshot(heartbeat.machineId);
    if (stored === null) throw new Error(`machine ${heartbeat.machineId} current snapshot disappeared`);
    return stored;
  }

  latestSnapshot(machineId: string): StoredMachineSnapshot | null {
    const row = this.#database.query<MachineRow, [string]>(
      "SELECT * FROM machines WHERE machine_id = ?",
    ).get(machineId);
    return row === null ? null : machineSnapshotFromRow(row);
  }

  snapshotCount(machineId: string): number {
    return this.#database.query<CountRow, [string]>(
      "SELECT COUNT(*) AS count FROM machine_snapshots WHERE machine_id = ?",
    ).get(machineId)?.count ?? 0;
  }

  currentMachines(): readonly CurrentMachineState[] {
    return this.#database.query<MachineRow, []>(
      "SELECT * FROM machines WHERE snapshot_json IS NOT NULL ORDER BY machine_id",
    ).all().flatMap((row) => {
      const snapshot = machineSnapshotFromRow(row);
      return snapshot === null ? [] : [{ ...snapshot, machineState: row.machine_state }];
    });
  }

  setMachineState(machineId: string, state: "online" | "offline"): void {
    this.#database.query("UPDATE machines SET machine_state = ? WHERE machine_id = ?").run(state, machineId);
  }

  canonicalPlans(): readonly CanonicalPlanRecord[] {
    return this.#database.query<CanonicalPlanRow, []>(
      "SELECT * FROM canonical_plans ORDER BY plan_id",
    ).all().map(canonicalPlanFromRow);
  }

  agentObservations(): readonly StoredAgentObservation[] {
    return this.currentMachines().flatMap((machine) => machine.snapshot.agents.map((agent) => ({
      ...agent,
      machineId: machine.machineId,
      machineState: machine.machineState,
      receivedAt: machine.receivedAt,
    })));
  }

  /**
   * @tested-by: tst_svc_planctl_transitions_001
   * @invariant: CTL-004 every entity edge advances one persisted version and emits at most one transition key.
   */
  changeObservedState(change: ObservedStateChange): TransitionRecord | null {
    requireTimestamp(change.occurredAt, "transition occurredAt");
    const transaction = this.#database.transaction((): TransitionRecord | null => {
      const previous = this.#database.query<ObservedStateRow, [string]>(
        "SELECT state, version FROM observed_states WHERE entity_key = ?",
      ).get(change.entityKey);
      if (previous?.state === change.currentState) return null;
      const version = (previous?.version ?? 0) + 1;
      this.#database.query(`
        INSERT INTO observed_states (entity_key, state, version, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(entity_key) DO UPDATE SET
          state = excluded.state,
          version = excluded.version,
          updated_at = excluded.updated_at
      `).run(change.entityKey, change.currentState, version, change.occurredAt);

      const kind = change.attentionKind
        ?? (previous !== null && isRecoverableAttentionState(previous.state) ? "recovery" : null);
      if (kind === null) return null;
      const transitionKey = `${change.entityKey}:${version}:${kind}`;
      this.#database.query(`
        INSERT OR IGNORE INTO transitions
          (transition_key, kind, entity_key, machine_id, agent_id, plan_id, task_id,
           previous_state, current_state, occurred_at, detail_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        transitionKey,
        kind,
        change.entityKey,
        change.machineId,
        change.agentId,
        change.planId,
        change.taskId,
        previous?.state ?? null,
        change.currentState,
        change.occurredAt,
        JSON.stringify(change.detail),
      );
      return {
        transitionKey,
        kind,
        entityKey: change.entityKey,
        machineId: change.machineId,
        agentId: change.agentId,
        planId: change.planId,
        taskId: change.taskId,
        previousState: previous?.state ?? null,
        currentState: change.currentState,
        occurredAt: change.occurredAt,
        detail: change.detail,
      };
    });
    return transaction.immediate();
  }

  transitions(): readonly TransitionRecord[] {
    return this.#database.query<TransitionRow, []>(`
      SELECT transition_key, kind, entity_key, machine_id, agent_id, plan_id, task_id,
             previous_state, current_state, occurred_at, detail_json
      FROM transitions
      ORDER BY rowid
    `).all().map(transitionFromRow);
  }

  /**
   * @tested-by: tst_svc_planctl_alerts_001
   * @invariant: CTL-008 each alertable transition has one durable claim and remains retryable until notified.
   */
  claimPendingAlerts(nowInput: string, leaseSeconds: number): readonly AlertTransitionRecord[] {
    const now = requireTimestamp(nowInput, "alert claim time");
    if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds <= 0) {
      throw new Error("alert claim leaseSeconds must be a positive integer");
    }
    const expiredBefore = new Date(Date.parse(now) - leaseSeconds * 1_000).toISOString();
    const transaction = this.#database.transaction((): readonly AlertTransitionRecord[] => {
      const rows = this.#database.query<AlertTransitionRow, [string, string]>(`
        SELECT transition_key, kind, entity_key, machine_id, agent_id, plan_id, task_id,
               previous_state, current_state, occurred_at, detail_json, ? AS claimed_at
        FROM transitions
        WHERE notified_at IS NULL
          AND kind IN ('stale', 'owner_wait', 'machine_offline', 'recovery')
          AND (claimed_at IS NULL OR claimed_at <= ?)
        ORDER BY rowid
        LIMIT 100
      `).all(now, expiredBefore);
      for (const row of rows) {
        this.#database.query(`
          UPDATE transitions
          SET claimed_at = ?
          WHERE transition_key = ? AND notified_at IS NULL
            AND (claimed_at IS NULL OR claimed_at <= ?)
        `).run(now, row.transition_key, expiredBefore);
      }
      return rows.map((row) => ({ ...transitionFromRow(row), claimedAt: row.claimed_at }));
    });
    return transaction.immediate();
  }

  markAlertNotified(transitionKey: string, notifiedAtInput: string): void {
    const notifiedAt = requireTimestamp(notifiedAtInput, "alert notifiedAt");
    const result = this.#database.query(`
      UPDATE transitions
      SET notified_at = ?, claimed_at = NULL
      WHERE transition_key = ? AND notified_at IS NULL
    `).run(notifiedAt, transitionKey);
    if (result.changes !== 1) throw new Error(`alert ${transitionKey} is missing or already notified`);
  }

  releaseAlertClaim(transitionKey: string): void {
    this.#database.query(`
      UPDATE transitions SET claimed_at = NULL
      WHERE transition_key = ? AND notified_at IS NULL
    `).run(transitionKey);
  }

  recordCalibrationSample(
    repositoryId: string,
    predictedActiveMinutes: number,
    actualActiveMinutes: number,
    completedAtInput: string,
  ): void {
    const completedAt = requireTimestamp(completedAtInput, "calibration completedAt");
    if (repositoryId === "" || predictedActiveMinutes <= 0 || actualActiveMinutes < 0) {
      throw new Error("calibration sample is invalid");
    }
    this.#database.query(`
      INSERT INTO calibration_samples
        (repository_id, predicted_active_minutes, actual_active_minutes, completed_at)
      VALUES (?, ?, ?, ?)
    `).run(repositoryId, predictedActiveMinutes, actualActiveMinutes, completedAt);
  }

  calibrationSamples(repositoryId: string): readonly CalibrationSampleRecord[] {
    return this.#database.query<CalibrationRow, [string]>(`
      SELECT predicted_active_minutes, actual_active_minutes
      FROM calibration_samples
      WHERE repository_id = ?
      ORDER BY completed_at, id
    `).all(repositoryId).map((row) => ({
      predictedActiveMinutes: row.predicted_active_minutes,
      actualActiveMinutes: row.actual_active_minutes,
    }));
  }
}

@Global()
@Module({})
export class ServerPersistenceModule {
  static register(options: ServerStoreOptions): DynamicModule {
    return {
      module: ServerPersistenceModule,
      providers: [
        { provide: SERVER_STORE_OPTIONS, useValue: options },
        ServerStore,
      ],
      exports: [SERVER_STORE_OPTIONS, ServerStore],
    };
  }
}
