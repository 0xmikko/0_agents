import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { decodeMachineSnapshot, SNAPSHOT_PROTOCOL_VERSION } from "../../core/snapshot-protocol";

import type { AgentSnapshot, MachineHeartbeat, MachineSnapshot, ReportedPlanProgress } from "../../core/snapshot-protocol";
import type { SessionFileCursor } from "../sessions/session-source";

export interface QueueSnapshotInput {
  readonly machineId: string;
  readonly observedAt: string;
  readonly snapshotHash: string;
  readonly agents: readonly AgentSnapshot[];
  readonly plans: readonly ReportedPlanProgress[];
}

export interface SendFailure {
  readonly attemptedAt: string;
  readonly nextAttemptAt: string;
  readonly errorCode: string;
}

export interface PendingSnapshot {
  readonly snapshot: MachineSnapshot;
  readonly attempts: number;
  readonly queuedAt: string;
  readonly nextAttemptAt: string | null;
  readonly lastErrorCode: string | null;
}

interface StateRow {
  readonly sequence: number;
  readonly last_snapshot_hash: string | null;
}

interface CursorRow {
  readonly cursor_json: string;
}

interface OutboxRow {
  readonly sequence: number;
  readonly snapshot_json: string;
  readonly attempts: number;
  readonly queued_at: string;
  readonly next_attempt_at: string | null;
  readonly last_error_code: string | null;
}

interface CountRow {
  readonly count: number;
}

interface JournalModeRow {
  readonly journal_mode: string;
}

function timestamp(value: string, name: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${name} must be an ISO timestamp`);
  return value;
}

function safeErrorCode(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(value)) throw new Error("send errorCode must be a safe identifier");
  return value;
}

function cursorFromJson(input: string): SessionFileCursor {
  const value: unknown = JSON.parse(input);
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("stored cursor is invalid");
  const cursor = value as Readonly<Record<string, unknown>>;
  if (typeof cursor.offset !== "number" || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0) {
    throw new Error("stored cursor offset is invalid");
  }
  function nullableText(field: string): string | null {
    const entry = cursor[field];
    if (entry === null) return null;
    if (typeof entry !== "string" || entry === "") throw new Error(`stored cursor ${field} is invalid`);
    return entry;
  }
  const lastActivityAt = nullableText("lastActivityAt");
  if (lastActivityAt !== null) timestamp(lastActivityAt, "stored cursor lastActivityAt");
  return {
    offset: cursor.offset,
    sessionId: nullableText("sessionId"),
    cwd: nullableText("cwd"),
    lastActivityAt,
  };
}

function pendingFromRow(row: OutboxRow): PendingSnapshot {
  const parsed: unknown = JSON.parse(row.snapshot_json);
  const snapshot = decodeMachineSnapshot(parsed);
  if (snapshot.heartbeat.sequence !== row.sequence) throw new Error("outbox sequence does not match snapshot");
  return {
    snapshot,
    attempts: row.attempts,
    queuedAt: row.queued_at,
    nextAttemptAt: row.next_attempt_at,
    lastErrorCode: row.last_error_code,
  };
}

export class MachineStore {
  readonly #database: Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.#database = new Database(path, { create: true, strict: true });
    this.#database.exec("PRAGMA journal_mode = WAL");
    this.#database.exec("PRAGMA synchronous = FULL");
    this.#database.exec("PRAGMA busy_timeout = 5000");
    this.#migrate();
  }

  #migrate(): void {
    const version = this.#database.query<{ readonly user_version: number }, []>("PRAGMA user_version").get()?.user_version;
    if (version !== 0 && version !== 1) throw new Error(`unsupported machine database version ${version}`);
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS machine_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        sequence INTEGER NOT NULL CHECK (sequence >= 0),
        last_snapshot_hash TEXT
      );
      INSERT OR IGNORE INTO machine_state (singleton, sequence, last_snapshot_hash) VALUES (1, 0, NULL);
      CREATE TABLE IF NOT EXISTS source_cursors (
        source_path TEXT PRIMARY KEY,
        cursor_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS snapshot_outbox (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        sequence INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        queued_at TEXT NOT NULL,
        next_attempt_at TEXT,
        last_error_code TEXT
      );
      PRAGMA user_version = 1;
    `);
  }

  close(): void {
    this.#database.close();
  }

  onModuleDestroy(): void {
    this.close();
  }

  journalMode(): string {
    const row = this.#database.query<JournalModeRow, []>("PRAGMA journal_mode").get();
    if (row === null) throw new Error("SQLite did not report journal mode");
    return row.journal_mode.toLowerCase();
  }

  putSourceCursor(sourcePath: string, cursor: SessionFileCursor): void {
    if (sourcePath === "") throw new Error("source cursor path is required");
    const checked = cursorFromJson(JSON.stringify(cursor));
    this.#database.query(`
      INSERT INTO source_cursors (source_path, cursor_json) VALUES (?, ?)
      ON CONFLICT(source_path) DO UPDATE SET cursor_json = excluded.cursor_json
    `).run(sourcePath, JSON.stringify(checked));
  }

  sourceCursor(sourcePath: string): SessionFileCursor | null {
    const row = this.#database.query<CursorRow, [string]>(
      "SELECT cursor_json FROM source_cursors WHERE source_path = ?",
    ).get(sourcePath);
    return row === null ? null : cursorFromJson(row.cursor_json);
  }

  latestSnapshotHash(): string | null {
    const state = this.#database.query<StateRow, []>("SELECT * FROM machine_state WHERE singleton = 1").get();
    if (state === null) throw new Error("machine sequence state is missing");
    return state.last_snapshot_hash;
  }

  /**
   * @tested-by: tst_svc_planctld_outbox_001
   * @invariant: CTL-007 a changed observation advances sequence and replaces the singleton outbox row in one WAL transaction.
   * @invariant: CTL-009 decoding before persistence strips fields outside the privacy-safe snapshot protocol.
   */
  queueLatest(input: QueueSnapshotInput): MachineSnapshot {
    const queuedAt = timestamp(input.observedAt, "snapshot observedAt");
    const transaction = this.#database.transaction(() => {
      const state = this.#database.query<StateRow, []>("SELECT * FROM machine_state WHERE singleton = 1").get();
      if (state === null) throw new Error("machine sequence state is missing");
      const sequence = state.sequence + 1;
      const snapshot = decodeMachineSnapshot({
        heartbeat: {
          protocolVersion: SNAPSHOT_PROTOCOL_VERSION,
          machineId: input.machineId,
          sequence,
          observedAt: queuedAt,
          snapshotHash: input.snapshotHash,
        },
        agents: input.agents,
        plans: input.plans,
      });
      const body = JSON.stringify(snapshot);
      this.#database.query(
        "UPDATE machine_state SET sequence = ?, last_snapshot_hash = ? WHERE singleton = 1",
      ).run(sequence, snapshot.heartbeat.snapshotHash);
      this.#database.query(`
        INSERT INTO snapshot_outbox
          (singleton, sequence, snapshot_json, attempts, queued_at, next_attempt_at, last_error_code)
        VALUES (1, ?, ?, 0, ?, NULL, NULL)
        ON CONFLICT(singleton) DO UPDATE SET
          sequence = excluded.sequence,
          snapshot_json = excluded.snapshot_json,
          queued_at = excluded.queued_at,
          next_attempt_at = snapshot_outbox.next_attempt_at,
          last_error_code = snapshot_outbox.last_error_code
      `).run(sequence, body, queuedAt);
      return snapshot;
    });
    return transaction.immediate();
  }

  nextHeartbeat(machineId: string, observedAtInput: string): MachineHeartbeat {
    const observedAt = timestamp(observedAtInput, "heartbeat observedAt");
    const transaction = this.#database.transaction(() => {
      const state = this.#database.query<StateRow, []>("SELECT * FROM machine_state WHERE singleton = 1").get();
      if (state === null) throw new Error("machine sequence state is missing");
      if (state.last_snapshot_hash === null) throw new Error("heartbeat requires a prior snapshot");
      const sequence = state.sequence + 1;
      this.#database.query("UPDATE machine_state SET sequence = ? WHERE singleton = 1").run(sequence);
      return decodeMachineSnapshot({
        heartbeat: {
          protocolVersion: SNAPSHOT_PROTOCOL_VERSION,
          machineId,
          sequence,
          observedAt,
          snapshotHash: state.last_snapshot_hash,
        },
        agents: [],
        plans: [],
      }).heartbeat;
    });
    return transaction.immediate();
  }

  pendingSnapshot(): PendingSnapshot | null {
    const row = this.#database.query<OutboxRow, []>("SELECT * FROM snapshot_outbox WHERE singleton = 1").get();
    return row === null ? null : pendingFromRow(row);
  }

  outboxCount(): number {
    return this.#database.query<CountRow, []>("SELECT COUNT(*) AS count FROM snapshot_outbox").get()?.count ?? 0;
  }

  recordSendFailure(sequence: number, failure: SendFailure): boolean {
    const attemptedAt = timestamp(failure.attemptedAt, "send attemptedAt");
    const nextAttemptAt = timestamp(failure.nextAttemptAt, "send nextAttemptAt");
    if (Date.parse(nextAttemptAt) < Date.parse(attemptedAt)) throw new Error("send retry cannot precede attempt");
    const result = this.#database.query(`
      UPDATE snapshot_outbox
      SET attempts = attempts + 1, next_attempt_at = ?, last_error_code = ?
      WHERE singleton = 1 AND sequence = ?
    `).run(nextAttemptAt, safeErrorCode(failure.errorCode), sequence);
    return result.changes === 1;
  }

  acknowledge(sequence: number): boolean {
    if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("acknowledged sequence must be positive");
    return this.#database.query(
      "DELETE FROM snapshot_outbox WHERE singleton = 1 AND sequence = ?",
    ).run(sequence).changes === 1;
  }
}
