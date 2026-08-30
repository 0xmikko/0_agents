import { Inject, Injectable } from "@nestjs/common";

import type { PlanProgressView, PortfolioProgressView } from "../server/progress/progress.service";
import type { TelegramUpdate } from "./telegram-client";

export const PROGRESS_READER = Symbol("PROGRESS_READER");
export const TELEGRAM_COMMAND_OPTIONS = Symbol("TELEGRAM_COMMAND_OPTIONS");

export interface ProgressReader {
  portfolio(): PortfolioProgressView;
  plan(planId: string): PlanProgressView | null;
}

export interface TelegramCommandOptions {
  readonly allowedUserIds: readonly number[];
}

function metric(value: number): string {
  if (!Number.isFinite(value) || value < 0) throw new Error("Telegram progress metric is invalid");
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function bounded(lines: readonly string[]): string {
  const message = lines.join("\n");
  if (message.length <= 4_096) return message;
  return `${message.slice(0, 4_050)}\n… truncated by planctl`;
}

function eta(plan: PlanProgressView): string {
  return plan.estimatedDeliveryAt ?? "unknown (owner wait)";
}

function portfolioMessage(portfolio: PortfolioProgressView): string {
  return bounded([
    `Progress — ${portfolio.plans.length} active plan${portfolio.plans.length === 1 ? "" : "s"}`,
    `Observed: ${portfolio.generatedAt}`,
    ...portfolio.plans.map((plan) => [
      plan.planId,
      `  ${plan.completionPercent.toFixed(1)}% · ${plan.tasks.completed}/${plan.tasks.total} Tasks · `
        + `critical path ${metric(plan.calibratedCriticalPathMinutes)} min · ETA ${eta(plan)}`,
      `  owner ${plan.attention.ownerWait} · stale ${plan.attention.stale} · `
        + `offline ${plan.attention.machineOffline} · drift ${plan.attention.planDrift}`,
    ].join("\n")),
  ]);
}

function planMessage(plan: PlanProgressView): string {
  const activeTasks = [...new Set(plan.activeAgents.flatMap((agent) => agent.taskId === null ? [] : [agent.taskId]))];
  return bounded([
    `Progress — ${plan.planId}`,
    `Goal: ${plan.goal}`,
    `Completion: ${plan.completionPercent.toFixed(1)}% · ${plan.tasks.completed}/${plan.tasks.total} Tasks`,
    `Active Tasks: ${activeTasks.length === 0 ? "none" : activeTasks.join(", ")}`,
    `Critical path: ${metric(plan.criticalPathMinutes)} raw / ${metric(plan.calibratedCriticalPathMinutes)} calibrated min`,
    `ETA: ${eta(plan)}`,
    `Blockers: owner ${plan.attention.ownerWait} · stale ${plan.attention.stale} · `
      + `offline machines ${plan.attention.machineOffline} · drift ${plan.attention.planDrift}`,
  ]);
}

function agentsMessage(portfolio: PortfolioProgressView): string {
  const agents = portfolio.agents;
  return bounded([
    `Agents — ${agents.length}`,
    ...agents.map((agent) => `${agent.machineId} · ${agent.agentId} · ${agent.taskId ?? "unassigned"} · ${agent.state}`
      + `${agent.planDrift ? " · plan_drift" : ""} · `
      + `idle ${agent.idleSeconds}s · elapsed ${agent.elapsedActiveMinutes === null ? "unavailable" : `${metric(agent.elapsedActiveMinutes)}m`}`),
  ]);
}

function staleMessage(portfolio: PortfolioProgressView): string {
  const agents = portfolio.agents;
  const stale = agents.filter((agent) => agent.state === "stale");
  const offline = agents.filter((agent) => agent.machineState === "offline");
  return bounded([
    `Stale — ${stale.length}; offline observations — ${offline.length}`,
    ...stale.map((agent) => `STALE ${agent.machineId} · ${agent.agentId} · ${agent.taskId ?? "unassigned"} · idle ${agent.idleSeconds}s`
      + (agent.planDrift ? " · plan_drift" : "")),
    ...offline.map((agent) => `OFFLINE ${agent.machineId} · agent ${agent.agentId} remains ${agent.state}`
      + (agent.planDrift ? " · plan_drift" : "")),
  ]);
}

function waitingMessage(portfolio: PortfolioProgressView): string {
  const waiting = portfolio.agents
    .filter((agent) => agent.state === "awaiting_owner");
  return bounded([
    `Waiting for owner — ${waiting.length}`,
    ...waiting.flatMap((agent) => [
      `WAITING ${agent.machineId} · ${agent.agentId} · ${agent.taskId ?? "unassigned"}`
        + (agent.planDrift ? " · plan_drift" : ""),
      `Reason: ${ownerWaitReason(agent.ownerWaitReason)}`,
      `Wait duration: ${ownerWaitDuration(portfolio.generatedAt, agent.ownerWaitStartedAt)}`,
    ]),
  ]);
}

function ownerWaitDuration(generatedAt: string, startedAt: string | null): string {
  if (startedAt === null) throw new Error("awaiting_owner observation has no structured start time");
  const duration = (Date.parse(generatedAt) - Date.parse(startedAt)) / 60_000;
  if (!Number.isFinite(duration) || duration < 0) throw new Error("owner wait duration evidence is invalid");
  return `${metric(duration)}m`;
}

function ownerWaitReason(value: string | null): string {
  if (value === null || value === "" || value.includes("\n") || value.length > 240) {
    throw new Error("awaiting_owner observation has no safe structured reason");
  }
  return value;
}

@Injectable()
export class CommandsService {
  constructor(
    @Inject(PROGRESS_READER) private readonly progress: ProgressReader,
    @Inject(TELEGRAM_COMMAND_OPTIONS) private readonly options: TelegramCommandOptions,
  ) {
    if (options.allowedUserIds.length === 0
      || !options.allowedUserIds.every((id) => Number.isSafeInteger(id) && id > 0)) {
      throw new Error("Telegram allowedUserIds must contain positive integer identities");
    }
  }

  /**
   * @tested-by: tst_svc_planctl_telegram_001, tst_svc_planctl_private_chat_001
   * @invariant: CTL-009 only authorized private-chat command text is classified; raw update payload fields never enter replies.
   */
  handle(update: TelegramUpdate): string | null {
    if (!this.options.allowedUserIds.includes(update.userId) || update.chatId !== update.userId) return null;
    const parts = update.text.trim().split(/\s+/);
    const command = parts[0];
    if (command === "/progress" && parts.length === 1) return portfolioMessage(this.progress.portfolio());
    if (command === "/progress" && parts.length === 2) {
      const requestedPlan = parts[1];
      if (requestedPlan === undefined) throw new Error("progress plan argument disappeared");
      const plan = this.progress.plan(requestedPlan);
      return plan === null ? "No plan matched the requested identifier." : planMessage(plan);
    }
    if (command === "/agents" && parts.length === 1) return agentsMessage(this.progress.portfolio());
    if (command === "/stale" && parts.length === 1) return staleMessage(this.progress.portfolio());
    if (command === "/waiting" && parts.length === 1) return waitingMessage(this.progress.portfolio());
    return null;
  }
}
