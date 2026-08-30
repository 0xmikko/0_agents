import { Inject, Injectable } from "@nestjs/common";

import { SERVER_STORE_OPTIONS, ServerStore } from "../persistence/server-store";

import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { AgentState } from "../../core/snapshot-protocol";
import type {
  ObservedStateChange,
  ServerStoreOptions,
  StoredAgentObservation,
  TransitionKind,
} from "../persistence/server-store";

function agentAttention(state: AgentState): Exclude<TransitionKind, "recovery"> | null {
  if (state === "stale") return "stale";
  if (state === "awaiting_owner") return "owner_wait";
  if (state === "unassigned") return "unassigned";
  return null;
}

function agentChange(agent: StoredAgentObservation, occurredAt: string): ObservedStateChange {
  return {
    entityKey: `agent:${agent.machineId}:${agent.agentId}`,
    currentState: agent.state,
    attentionKind: agentAttention(agent.state),
    machineId: agent.machineId,
    agentId: agent.agentId,
    planId: agent.planId,
    taskId: agent.taskId,
    occurredAt,
    detail: agent.state === "awaiting_owner"
      ? {
        state: agent.state,
        ownerWaitReason: agent.ownerWaitReason,
        ownerWaitStartedAt: agent.ownerWaitStartedAt,
      }
      : { state: agent.state },
  };
}

@Injectable()
export class TransitionService implements OnModuleInit, OnModuleDestroy {
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly store: ServerStore,
    @Inject(SERVER_STORE_OPTIONS) private readonly options: ServerStoreOptions,
  ) {}

  onModuleInit(): void {
    if (this.options.transitionScanMs === null) return;
    this.#timer = setInterval(() => this.evaluate(), this.options.transitionScanMs);
  }

  onModuleDestroy(): void {
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
  }

  /**
   * @tested-by: tst_svc_planctl_transitions_001
   * @invariant: CTL-004 machine liveness, explicit agent attention and plan revision drift are independent evidence.
   */
  evaluate(nowInput = this.options.now()): void {
    const now = Date.parse(nowInput);
    if (!Number.isFinite(now)) throw new Error("transition clock must be an ISO timestamp");

    for (const machine of this.store.currentMachines()) {
      const offline = now - Date.parse(machine.receivedAt) >= this.options.machineOfflineAfterSeconds * 1_000;
      const state = offline ? "offline" : "online";
      this.store.changeObservedState({
        entityKey: `machine:${machine.machineId}`,
        currentState: state,
        attentionKind: offline ? "machine_offline" : null,
        machineId: machine.machineId,
        agentId: null,
        planId: null,
        taskId: null,
        occurredAt: nowInput,
        detail: { state },
      });
      this.store.setMachineState(machine.machineId, state);
    }

    for (const agent of this.store.agentObservations()) {
      this.store.changeObservedState(agentChange(agent, nowInput));
    }

    const revisions = new Map<string, Set<string>>();
    for (const machine of this.store.currentMachines()) {
      for (const plan of machine.snapshot.plans) {
        const known = revisions.get(plan.planId) ?? new Set<string>();
        known.add(plan.planRevision);
        revisions.set(plan.planId, known);
      }
    }
    for (const [planId, planRevisions] of revisions) {
      const drift = planRevisions.size > 1;
      this.store.changeObservedState({
        entityKey: `plan:${planId}`,
        currentState: drift ? "plan_drift" : "aligned",
        attentionKind: drift ? "plan_drift" : null,
        machineId: null,
        agentId: null,
        planId,
        taskId: null,
        occurredAt: nowInput,
        detail: { state: drift ? "plan_drift" : "aligned", revisions: [...planRevisions].sort().join(",") },
      });
    }
  }
}
