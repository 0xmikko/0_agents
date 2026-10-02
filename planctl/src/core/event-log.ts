import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** One line per tool call, outside any repository: the process record the owner asked for. */
export interface EventRecord {
  readonly at: string;
  readonly repository: string;
  readonly worktree: string;
  readonly plan: string;
  readonly revision: string;
  readonly tool: string;
  readonly deliveryId: string | null;
  readonly taskIds: readonly string[];
  readonly forecastMinutes: number | null;
  readonly prUrl: string | null;
  readonly ciHeadSha: string | null;
  readonly ciRunId: string | null;
  readonly ciAttempt: number | null;
  readonly outcome: "ok" | "refused" | "error";
  readonly reason: string | null;
  readonly durationMs: number;
  readonly runtimeCommit: string | null;
  readonly sourceCommit: string;
}

/** The five tables for one source commit of the server. */
interface StatsTables {
  /** Where agents stop, and why. */
  readonly stops: readonly { readonly tool: string; readonly reason: string; readonly count: number }[];
  /** Submit rounds per plan. */
  readonly submitRounds: readonly { readonly plan: string; readonly rounds: number }[];
  /** Task time against its forecast: first start to the completion naming the Task. */
  readonly taskTime: readonly { readonly plan: string; readonly taskId: string; readonly forecastMinutes: number | null; readonly minutes: number }[];
  /** Time waiting for the owner: needs_owner to the next resume_task. */
  readonly ownerWait: readonly { readonly plan: string; readonly taskId: string; readonly minutes: number }[];
  /** PRs and CI runs per Delivery: distinct PR URLs and distinct run id plus attempt pairs progress observed. */
  readonly publication: readonly { readonly plan: string; readonly deliveryId: string; readonly prs: number; readonly ciRuns: number }[];
}

export function eventLogPath(home: string): string {
  return join(home, ".local/share/planctl/events.jsonl");
}

/** @tested-by: tst_unit_planctl_event_log_001 */
export function appendEvent(path: string, record: EventRecord): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`);
}

/** Every event at or after `since`; a missing log is an empty log, a malformed line is an error. */
export function readEvents(path: string, since: string): readonly EventRecord[] {
  if (!existsSync(path)) return [];
  const records: EventRecord[] = [];
  readFileSync(path, "utf8").split("\n").forEach((line, index) => {
    if (line.trim() === "") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`events.jsonl line ${index + 1} is not JSON`);
    }
    if (typeof parsed !== "object" || parsed === null || typeof (parsed as { at?: unknown }).at !== "string") {
      throw new Error(`events.jsonl line ${index + 1} is not an event`);
    }
    const record = parsed as EventRecord;
    if (record.at >= since) records.push(record);
  });
  return records;
}

function minutesBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 60_000;
}

function tablesOf(events: readonly EventRecord[]): StatsTables {
  const stops = new Map<string, { tool: string; reason: string; count: number }>();
  for (const event of events) {
    if (event.outcome === "ok") continue;
    const key = `${event.tool}\u0000${event.reason ?? ""}`;
    const row = stops.get(key) ?? { tool: event.tool, reason: event.reason ?? "", count: 0 };
    stops.set(key, { ...row, count: row.count + 1 });
  }
  const submitRounds = new Map<string, number>();
  for (const event of events) {
    if (event.tool !== "submit_spec" || event.outcome !== "ok") continue;
    submitRounds.set(event.plan, (submitRounds.get(event.plan) ?? 0) + 1);
  }
  const starts = new Map<string, EventRecord>();
  for (const event of events) {
    if (event.tool !== "start_task" || event.outcome !== "ok") continue;
    for (const taskId of event.taskIds) {
      const key = `${event.plan}\u0000${taskId}`;
      if (!starts.has(key)) starts.set(key, event);
    }
  }
  const taskTime: { plan: string; taskId: string; forecastMinutes: number | null; minutes: number }[] = [];
  for (const event of events) {
    if (event.tool !== "complete_task" || event.outcome !== "ok") continue;
    for (const taskId of event.taskIds) {
      const start = starts.get(`${event.plan}\u0000${taskId}`);
      if (start === undefined) continue;
      taskTime.push({ plan: event.plan, taskId, forecastMinutes: start.forecastMinutes, minutes: minutesBetween(start.at, event.at) });
    }
  }
  const ownerWait: { plan: string; taskId: string; minutes: number }[] = [];
  const open = new Map<string, EventRecord>();
  for (const event of events) {
    if (event.outcome !== "ok") continue;
    for (const taskId of event.taskIds) {
      const key = `${event.plan}\u0000${taskId}`;
      if (event.tool === "needs_owner") open.set(key, event);
      if (event.tool === "resume_task") {
        const asked = open.get(key);
        if (asked === undefined) continue;
        ownerWait.push({ plan: event.plan, taskId, minutes: minutesBetween(asked.at, event.at) });
        open.delete(key);
      }
    }
  }
  const publication = new Map<string, { plan: string; deliveryId: string; prs: Set<string>; ciRuns: Set<string> }>();
  for (const event of events) {
    if (event.tool !== "progress" || event.outcome !== "ok" || event.prUrl === null || event.deliveryId === null) continue;
    const key = `${event.plan}\u0000${event.deliveryId}`;
    const row = publication.get(key) ?? { plan: event.plan, deliveryId: event.deliveryId, prs: new Set<string>(), ciRuns: new Set<string>() };
    row.prs.add(event.prUrl);
    if (event.ciRunId !== null) row.ciRuns.add(`${event.ciRunId}\u0000${event.ciAttempt ?? ""}`);
    publication.set(key, row);
  }
  return {
    stops: [...stops.values()],
    submitRounds: [...submitRounds].map(([plan, rounds]) => ({ plan, rounds })),
    taskTime,
    ownerWait,
    publication: [...publication.values()].map((row) => ({ plan: row.plan, deliveryId: row.deliveryId, prs: row.prs.size, ciRuns: row.ciRuns.size })),
  };
}

/** The five tables, one set per server source commit, so a process change is compared before and after.
 * @tested-by: tst_unit_planctl_event_log_001
 */
export function stats(events: readonly EventRecord[]): ReadonlyMap<string, StatsTables> {
  const bySource = new Map<string, EventRecord[]>();
  for (const event of events) bySource.set(event.sourceCommit, [...(bySource.get(event.sourceCommit) ?? []), event]);
  return new Map([...bySource].map(([source, group]) => [source, tablesOf(group)]));
}

function table(title: string, header: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const body = rows.length === 0 ? ["  (none)"] : rows.map((row) => `  ${row.join(" | ")}`);
  return [`${title}`, `  ${header.join(" | ")}`, ...body].join("\n");
}

export function renderStats(tables: ReadonlyMap<string, StatsTables>): string {
  if (tables.size === 0) return "planctl stats: no events";
  return [...tables].map(([source, group]) => [
    `Source commit ${source.slice(0, 7)}`,
    table("Where agents stop", ["tool", "reason", "count"], group.stops.map((row) => [row.tool, row.reason, row.count])),
    table("Submit rounds per plan", ["plan", "rounds"], group.submitRounds.map((row) => [row.plan, row.rounds])),
    table("Task time against forecast", ["plan", "task", "forecast min", "minutes"], group.taskTime.map((row) => [row.plan, row.taskId, row.forecastMinutes ?? "-", row.minutes.toFixed(1)])),
    table("Time waiting for the owner", ["plan", "task", "minutes"], group.ownerWait.map((row) => [row.plan, row.taskId, row.minutes.toFixed(1)])),
    table("PRs and CI runs per Delivery", ["plan", "delivery", "prs", "ci runs"], group.publication.map((row) => [row.plan, row.deliveryId, row.prs, row.ciRuns])),
  ].join("\n")).join("\n\n");
}
