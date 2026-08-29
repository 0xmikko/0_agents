import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from "@nestjs/common";

import { decodeMachineSnapshot } from "../../core/snapshot-protocol";
import {
  SERVER_STORE_OPTIONS,
  ServerStore,
  SnapshotReplayError,
  SnapshotSequenceError,
} from "../persistence/server-store";
import { TransitionService } from "../transitions/transition.service";

import type { MachineHeartbeat, MachineSnapshot } from "../../core/snapshot-protocol";
import type { ServerStoreOptions, StoredMachineSnapshot } from "../persistence/server-store";

export interface SnapshotAcknowledgement {
  readonly machineId: string;
  readonly sequence: number;
  readonly snapshotHash: string;
}

type DecodedIngestRequest =
  | { readonly kind: "snapshot"; readonly snapshot: MachineSnapshot }
  | { readonly kind: "heartbeat"; readonly heartbeat: MachineHeartbeat };

function record(input: unknown): Readonly<Record<string, unknown>> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("ingest request must be an object");
  }
  return input as Readonly<Record<string, unknown>>;
}

function exactKeys(input: Readonly<Record<string, unknown>>, expected: readonly string[]): void {
  const actual = Object.keys(input).sort();
  const wanted = expected.slice().sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`ingest ${String(input.kind)} request has unsupported fields`);
  }
}

function decodeRequest(input: unknown): DecodedIngestRequest {
  const value = record(input);
  if (value.kind === "snapshot") {
    exactKeys(value, ["kind", "snapshot"]);
    return { kind: "snapshot", snapshot: decodeMachineSnapshot(value.snapshot) };
  }
  if (value.kind === "heartbeat") {
    exactKeys(value, ["heartbeat", "kind"]);
    const decoded = decodeMachineSnapshot({ heartbeat: value.heartbeat, agents: [], plans: [] });
    return { kind: "heartbeat", heartbeat: decoded.heartbeat };
  }
  throw new Error("ingest request kind must be snapshot or heartbeat");
}

@Injectable()
export class IngestService {
  constructor(
    private readonly store: ServerStore,
    @Inject(SERVER_STORE_OPTIONS) private readonly options: ServerStoreOptions,
    private readonly transitions: TransitionService,
  ) {}

  /**
   * @tested-by: tst_int_planctl_ingest_001
   * @invariant: CTL-003 only versioned, identity-matching, monotonic snapshots enter the distributed read model.
   */
  accept(machineId: string, input: unknown, authenticatedSubject: string): SnapshotAcknowledgement {
    if (machineId !== authenticatedSubject) {
      throw new ForbiddenException("URL machine identity does not match authenticated identity");
    }
    let request: DecodedIngestRequest;
    try {
      request = decodeRequest(input);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "snapshot is invalid";
      throw new BadRequestException(message);
    }
    const heartbeat = request.kind === "snapshot" ? request.snapshot.heartbeat : request.heartbeat;
    if (heartbeat.machineId !== machineId) {
      throw new BadRequestException("snapshot machine identity does not match URL identity");
    }
    let stored: StoredMachineSnapshot;
    try {
      stored = request.kind === "snapshot"
        ? this.store.acceptSnapshot(request.snapshot, this.options.now())
        : this.store.acceptHeartbeat(request.heartbeat, this.options.now());
    } catch (error: unknown) {
      if (error instanceof SnapshotSequenceError || error instanceof SnapshotReplayError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
    this.transitions.evaluate(stored.receivedAt);
    return {
      machineId: stored.machineId,
      sequence: stored.sequence,
      snapshotHash: stored.snapshotHash,
    };
  }
}
