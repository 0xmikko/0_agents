import { Inject, Injectable } from "@nestjs/common";

import { ServerStore } from "../server/persistence/server-store";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { AlertTransitionRecord } from "../server/persistence/server-store";
import type { TelegramSender } from "./telegram-client";

export const TELEGRAM_NOTIFIER_OPTIONS = Symbol("TELEGRAM_NOTIFIER_OPTIONS");
export const TELEGRAM_SENDER = Symbol("TELEGRAM_SENDER");

export interface TelegramNotifierOptions {
  readonly defaultChatId: number;
  readonly claimLeaseSeconds: number;
  readonly scanMilliseconds: number | null;
  readonly now: () => string;
}

export interface DeliveryResult {
  readonly sent: number;
  readonly failed: number;
}

function context(value: string | null): string {
  return value ?? "none";
}

function ownerReason(event: AlertTransitionRecord): string {
  const reason = event.detail.ownerWaitReason;
  if (typeof reason !== "string" || reason === "" || reason.includes("\n") || reason.length > 240) {
    throw new Error(`owner-wait transition ${event.transitionKey} has no safe reason`);
  }
  return reason;
}

function alertMessage(event: AlertTransitionRecord): string {
  const at = `At: ${event.occurredAt}`;
  if (event.kind === "stale") return [
    "STALE",
    `Machine: ${context(event.machineId)}`,
    `Agent: ${context(event.agentId)}`,
    `Plan / Task: ${context(event.planId)} / ${context(event.taskId)}`,
    at,
  ].join("\n");
  if (event.kind === "owner_wait") return [
    "OWNER RESPONSE NEEDED",
    `Machine / Agent: ${context(event.machineId)} / ${context(event.agentId)}`,
    `Plan / Task: ${context(event.planId)} / ${context(event.taskId)}`,
    `Reason: ${ownerReason(event)}`,
    at,
  ].join("\n");
  if (event.kind === "machine_offline") return ["MACHINE OFFLINE", `Machine: ${context(event.machineId)}`, at].join("\n");
  if (event.kind === "recovery") return [
    "RECOVERED",
    `Machine / Agent: ${context(event.machineId)} / ${context(event.agentId)}`,
    `Plan / Task: ${context(event.planId)} / ${context(event.taskId)}`,
    `State: ${context(event.previousState)} → ${event.currentState}`,
    at,
  ].join("\n");
  throw new Error(`transition ${event.transitionKey} is not alertable`);
}

@Injectable()
export class NotifierService implements OnModuleInit, OnModuleDestroy {
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly store: ServerStore,
    @Inject(TELEGRAM_SENDER) private readonly sender: TelegramSender,
    @Inject(TELEGRAM_NOTIFIER_OPTIONS) private readonly options: TelegramNotifierOptions,
  ) {
    if (!Number.isSafeInteger(options.defaultChatId) || options.defaultChatId <= 0) {
      throw new Error("Telegram defaultChatId must be a positive integer");
    }
    if (options.scanMilliseconds !== null
      && (!Number.isSafeInteger(options.scanMilliseconds) || options.scanMilliseconds <= 0)) {
      throw new Error("Telegram notifier scanMilliseconds must be a positive integer or null");
    }
  }

  onModuleInit(): void {
    if (this.options.scanMilliseconds === null) return;
    this.#timer = setInterval(() => void this.deliverPending(), this.options.scanMilliseconds);
  }

  onModuleDestroy(): void {
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
  }

  /** @tested-by: tst_svc_planctl_alerts_001 */
  async deliverPending(): Promise<DeliveryResult> {
    const events = this.store.claimPendingAlerts(this.options.now(), this.options.claimLeaseSeconds);
    let sent = 0;
    let failed = 0;
    for (const event of events) {
      try {
        await this.sender.sendMessage(this.options.defaultChatId, alertMessage(event));
        this.store.markAlertNotified(event.transitionKey, this.options.now());
        sent += 1;
      } catch {
        this.store.releaseAlertClaim(event.transitionKey);
        failed += 1;
      }
    }
    return { sent, failed };
  }
}
