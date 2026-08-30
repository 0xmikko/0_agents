import { fetchWithTimeouts } from "../../core/http-timeouts";

import type { MachineHeartbeat, MachineSnapshot } from "../../core/snapshot-protocol";

export type FetchRequest = (request: Request) => Promise<Response>;

export interface ServerClientOptions {
  readonly machineId: string;
  readonly baseUrl: string;
  readonly token: string;
  readonly connectTimeoutMs: number;
  readonly requestTimeoutMs: number;
  readonly fetch?: FetchRequest;
}

interface SnapshotAcknowledgement {
  readonly machineId: string;
  readonly sequence: number;
  readonly snapshotHash: string;
}

function acknowledgement(value: unknown): SnapshotAcknowledgement {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("server acknowledgement is invalid");
  const entry = value as Readonly<Record<string, unknown>>;
  if (typeof entry.machineId !== "string" || typeof entry.sequence !== "number"
    || !Number.isSafeInteger(entry.sequence) || typeof entry.snapshotHash !== "string") {
    throw new Error("server acknowledgement is invalid");
  }
  return { machineId: entry.machineId, sequence: entry.sequence, snapshotHash: entry.snapshotHash };
}

function token(value: string): string {
  if (value === "" || /\s/.test(value)) throw new Error("machine bearer token must be one non-empty token");
  return value;
}

export class ServerClient {
  readonly #machineId: string;
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #connectTimeoutMs: number;
  readonly #requestTimeoutMs: number;
  readonly #fetch: FetchRequest;

  constructor(options: ServerClientOptions) {
    this.#machineId = options.machineId;
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#token = token(options.token);
    this.#connectTimeoutMs = options.connectTimeoutMs;
    this.#requestTimeoutMs = options.requestTimeoutMs;
    this.#fetch = options.fetch ?? (async (request): Promise<Response> => await fetch(request));
  }

  async #post(body: Readonly<Record<string, unknown>>): Promise<SnapshotAcknowledgement> {
    const response = await fetchWithTimeouts(async (signal) => await this.#fetch(new Request(
      `${this.#baseUrl}/v1/machines/${encodeURIComponent(this.#machineId)}/snapshots`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal,
      },
    )), {
      connectTimeoutMs: this.#connectTimeoutMs,
      requestTimeoutMs: this.#requestTimeoutMs,
    });
    if (!response.ok) throw new Error(`planctl server returned HTTP ${response.status}`);
    const parsed: unknown = await response.json();
    return acknowledgement(parsed);
  }

  /**
   * @tested-by: tst_svc_planctld_collector_001
   * @invariant: authenticated transport sends a bounded privacy-safe protocol body and never includes the bearer token in that body or an error.
   */
  async sendSnapshot(snapshot: MachineSnapshot): Promise<void> {
    const heartbeat = snapshot.heartbeat;
    if (heartbeat.machineId !== this.#machineId) throw new Error("snapshot machine identity does not match client");
    const result = await this.#post({ kind: "snapshot", snapshot });
    if (result.machineId !== heartbeat.machineId || result.sequence !== heartbeat.sequence
      || result.snapshotHash !== heartbeat.snapshotHash) throw new Error("server acknowledged a different snapshot");
  }

  async sendHeartbeat(heartbeat: MachineHeartbeat): Promise<void> {
    if (heartbeat.machineId !== this.#machineId) throw new Error("heartbeat machine identity does not match client");
    const result = await this.#post({ kind: "heartbeat", heartbeat });
    if (result.machineId !== heartbeat.machineId || result.sequence !== heartbeat.sequence
      || result.snapshotHash !== heartbeat.snapshotHash) throw new Error("server acknowledged a different heartbeat");
  }
}
