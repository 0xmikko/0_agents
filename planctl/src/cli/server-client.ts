export interface ServerPlanProgress {
  readonly planId: string;
  readonly planRevision: string;
  readonly goal: string;
  readonly completionPercent: number;
  readonly tasks: { readonly completed: number; readonly total: number };
  readonly activeMinutes: { readonly completed: number; readonly remaining: number; readonly total: number };
  readonly attention: { readonly ownerWait: number; readonly stale: number; readonly unassigned: number };
  readonly remainingActiveMinutes: number;
  readonly criticalPathMinutes: number;
  readonly calibratedCriticalPathMinutes: number;
  readonly estimatedDeliveryAt: string | null;
}

export interface ServerProgressResponse {
  readonly generatedAt: string;
  readonly plans: readonly ServerPlanProgress[];
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface ServerReadOptions {
  readonly baseUrl: string;
  readonly machineId: string;
  readonly token: string;
  readonly requestTimeoutMs: number;
  readonly fetch: FetchLike;
}

function record(value: unknown, name: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Readonly<Record<string, unknown>>;
}

function timestamp(value: unknown, name: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`${name} must be an ISO timestamp`);
  return value;
}

function text(value: unknown, name: string, pattern?: RegExp): string {
  if (typeof value !== "string" || value === "" || (pattern !== undefined && !pattern.test(value))) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function nonNegative(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${name} is invalid`);
  return value;
}

function count(value: unknown, name: string): { readonly completed: number; readonly total: number } {
  const entry = record(value, name);
  const completed = nonNegative(entry.completed, `${name} completed`);
  const total = nonNegative(entry.total, `${name} total`);
  if (!Number.isSafeInteger(completed) || !Number.isSafeInteger(total) || completed > total) {
    throw new Error(`${name} is inconsistent`);
  }
  return { completed, total };
}

function activeMinutes(
  value: unknown,
): { readonly completed: number; readonly remaining: number; readonly total: number } {
  const entry = record(value, "server plan activeMinutes");
  const completed = nonNegative(entry.completed, "server plan activeMinutes completed");
  const remaining = nonNegative(entry.remaining, "server plan activeMinutes remaining");
  const total = nonNegative(entry.total, "server plan activeMinutes total");
  if (Math.abs(completed + remaining - total) > Number.EPSILON) {
    throw new Error("server plan activeMinutes is inconsistent");
  }
  return { completed, remaining, total };
}

function attention(value: unknown): ServerPlanProgress["attention"] {
  const entry = record(value, "server plan attention");
  const ownerWait = nonNegative(entry.ownerWait, "server plan attention ownerWait");
  const stale = nonNegative(entry.stale, "server plan attention stale");
  const unassigned = nonNegative(entry.unassigned, "server plan attention unassigned");
  if (![ownerWait, stale, unassigned].every(Number.isSafeInteger)) {
    throw new Error("server plan attention counts must be integers");
  }
  return { ownerWait, stale, unassigned };
}

function serverPlan(value: unknown): ServerPlanProgress {
  const plan = record(value, "server plan progress");
  const estimatedDeliveryAt = plan.estimatedDeliveryAt === null
    ? null
    : timestamp(plan.estimatedDeliveryAt, "server plan estimatedDeliveryAt");
  const completionPercent = nonNegative(plan.completionPercent, "server plan completionPercent");
  if (completionPercent > 100) throw new Error("server plan completionPercent exceeds 100");
  return {
    planId: text(plan.planId, "server plan planId"),
    planRevision: text(plan.planRevision, "server plan planRevision", /^[0-9a-f]{64}$/),
    goal: text(plan.goal, "server plan goal"),
    completionPercent,
    tasks: count(plan.tasks, "server plan tasks"),
    activeMinutes: activeMinutes(plan.activeMinutes),
    attention: attention(plan.attention),
    remainingActiveMinutes: nonNegative(
      plan.remainingActiveMinutes,
      "server plan remainingActiveMinutes",
    ),
    criticalPathMinutes: nonNegative(plan.criticalPathMinutes, "server plan criticalPathMinutes"),
    calibratedCriticalPathMinutes: nonNegative(
      plan.calibratedCriticalPathMinutes,
      "server plan calibratedCriticalPathMinutes",
    ),
    estimatedDeliveryAt,
  };
}

function baseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("server URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("server URL must use HTTP or HTTPS");
  return parsed.toString().replace(/\/$/, "");
}

/**
 * @tested-by: tst_cli_planctl_focus_001
 * @invariant: CTL-002 telemetry is read only on an explicit bounded request and cannot gate local commands.
 */
export async function readServerProgress(
  options: ServerReadOptions,
  planId?: string,
): Promise<ServerProgressResponse> {
  if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
    throw new Error("server request timeout must be a positive integer");
  }
  if (options.token.trim() === "") throw new Error("server token must not be empty");
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(options.machineId)) throw new Error("server machineId is invalid");
  const suffix = planId === undefined ? "/v1/progress" : `/v1/progress/${encodeURIComponent(planId)}`;
  const response = await options.fetch(`${baseUrl(options.baseUrl)}${suffix}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${options.token}`,
      "x-planctl-machine-id": options.machineId,
    },
    signal: AbortSignal.timeout(options.requestTimeoutMs),
  });
  if (!response.ok) throw new Error(`server progress request failed with HTTP ${response.status}`);
  const parsed: unknown = await response.json();
  const value = record(parsed, "server progress response");
  if (!Array.isArray(value.plans)) throw new Error("server progress response plans must be an array");
  return {
    generatedAt: timestamp(value.generatedAt, "server progress generatedAt"),
    plans: value.plans.map(serverPlan),
  };
}
