import { readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

export interface MachineConfig {
  readonly role: "machine";
  readonly version: 1;
  readonly machineId: string;
  readonly repositoryIds: Readonly<Record<string, string>>;
  readonly server: {
    readonly url: string;
    readonly tokenFile: string;
    readonly connectTimeoutMs: number;
    readonly requestTimeoutMs: number;
  };
  readonly collector: {
    readonly scanSeconds: number;
    readonly heartbeatSeconds: number;
    readonly staleAfterSeconds: number;
    readonly sessionLookbackDays: number;
    readonly stateDb: string;
    readonly watchRoots: readonly string[];
    readonly codexSessions: string;
    readonly claudeSessions: string;
  };
}

export interface ServerConfig {
  readonly role: "server";
  readonly version: 1;
  readonly bind: string;
  readonly externalUrl: string;
  readonly database: string;
  readonly machineOfflineAfterSeconds: number;
  readonly historyRetentionDays: number;
  readonly telegram: {
    readonly botTokenFile: string;
    readonly allowedUserIds: readonly number[];
    readonly defaultChatId: number;
    readonly longPollSeconds: number;
  };
}

export type PlanctlConfig = MachineConfig | ServerConfig;
export type PlanctlRole = PlanctlConfig["role"];

export function defaultPlanctlConfigPath(
  role: PlanctlRole,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const configRoot = environment.XDG_CONFIG_HOME;
  if (configRoot !== undefined && isAbsolute(configRoot)) return join(configRoot, "planctl", `${role}.toml`);
  const home = environment.HOME;
  if (home === undefined || !isAbsolute(home)) throw new Error("HOME or absolute XDG_CONFIG_HOME is required for default config path");
  return join(home, ".config", "planctl", `${role}.toml`);
}

export function planctlConfigTemplate(role: PlanctlRole): string {
  if (role === "machine") {
    return [
      "# planctl machine configuration — uncomment and replace every required value",
      "# version = 1",
      "# machine_id = \"owner-assigned-machine-slug\"",
      "# repository_ids = { \"/absolute/repository/path\" = \"explicit-repository-id\" }",
      "# [server]",
      "# url = \"https://planctl.example.ts.net\"",
      "# token_file = \"/absolute/path/to/mode-0600-machine.token\"",
      "# connect_timeout_ms = 1000",
      "# request_timeout_ms = 5000",
      "# [collector]",
      "# scan_seconds = 5",
      "# heartbeat_seconds = 15",
      "# stale_after_seconds = 900",
      "# session_lookback_days = 7",
      "# state_db = \"/absolute/path/to/machine.sqlite\"",
      "# watch_roots = [\"/absolute/coding/root\"]",
      "# codex_sessions = \"/absolute/path/to/codex/sessions\"",
      "# claude_sessions = \"/absolute/path/to/claude/projects\"",
      "",
    ].join("\n");
  }
  return [
    "# planctl server configuration — uncomment and replace every required value",
    "# version = 1",
    "# bind = \"127.0.0.1:4789\"",
    "# external_url = \"https://planctl.example.ts.net\"",
    "# database = \"/absolute/path/to/server.sqlite\"",
    "# machine_offline_after_seconds = 60",
    "# history_retention_days = 90",
    "# [telegram]",
    "# bot_token_file = \"/absolute/path/to/mode-0600-telegram.token\"",
    "# allowed_user_ids = [123456789]",
    "# default_chat_id = 123456789",
    "# long_poll_seconds = 30",
    "",
  ].join("\n");
}

function record(value: unknown, name: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${name} must be a table`);
  return value as Readonly<Record<string, unknown>>;
}

function keys(value: Readonly<Record<string, unknown>>, allowed: readonly string[], name: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${name} has unknown key(s): ${unknown.join(", ")}`);
}

function text(value: unknown, name: string, pattern?: RegExp): string {
  if (typeof value !== "string" || value === "" || (pattern !== undefined && !pattern.test(value))) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function absolutePath(value: unknown, name: string): string {
  const path = text(value, name);
  if (!isAbsolute(path)) throw new Error(`${name} must be an absolute path`);
  return path;
}

function secretFile(value: unknown, name: string): string {
  const path = absolutePath(value, name);
  let mode: number;
  try {
    const stat = statSync(path);
    if (!stat.isFile()) throw new Error(`${name} is not a file`);
    mode = stat.mode & 0o777;
  } catch (error: unknown) {
    if (error instanceof Error && error.message === `${name} is not a file`) throw error;
    throw new Error(`${name} cannot be read`);
  }
  if (mode !== 0o600) throw new Error(`${name} must have mode 0600`);
  return path;
}

function endpoint(value: unknown, name: string): string {
  const raw = text(value, name);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  const loopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "[::1]";
  if (parsed.protocol === "http:" && !loopback) throw new Error(`${name} rejects non-loopback plain HTTP`);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(`${name} must use HTTP or HTTPS`);
  return parsed.toString().replace(/\/$/, "");
}

function inside(path: string, roots: readonly string[]): boolean {
  return roots.some((root) => {
    const fromRoot = relative(root, path);
    return fromRoot === "" || (fromRoot !== ".." && !fromRoot.startsWith("../") && !isAbsolute(fromRoot));
  });
}

function machineConfig(input: Readonly<Record<string, unknown>>): MachineConfig {
  keys(input, ["version", "machine_id", "repository_ids", "server", "collector"], "machine config");
  if (input.version !== 1) throw new Error("machine config version must be 1");
  const server = record(input.server, "machine server");
  keys(server, ["url", "token_file", "connect_timeout_ms", "request_timeout_ms"], "machine server");
  const collector = record(input.collector, "machine collector");
  keys(collector, [
    "scan_seconds",
    "heartbeat_seconds",
    "stale_after_seconds",
    "session_lookback_days",
    "state_db",
    "watch_roots",
    "codex_sessions",
    "claude_sessions",
  ], "machine collector");
  if (!Array.isArray(collector.watch_roots) || collector.watch_roots.length === 0) {
    throw new Error("collector watch_roots must be a non-empty array");
  }
  const watchRoots = collector.watch_roots.map((path) => absolutePath(path, "collector watch_root"));
  const repositories = record(input.repository_ids, "machine repository_ids");
  const repositoryIds: Record<string, string> = {};
  for (const [path, id] of Object.entries(repositories)) {
    const absolute = absolutePath(path, "repository_ids path");
    if (!inside(absolute, watchRoots)) throw new Error(`repository_ids path is outside watch_roots: ${absolute}`);
    repositoryIds[absolute] = text(id, "repository_ids value", /^[A-Za-z0-9][A-Za-z0-9._/-]*$/);
  }
  const heartbeatSeconds = positiveInteger(collector.heartbeat_seconds, "collector heartbeat_seconds");
  const staleAfterSeconds = positiveInteger(collector.stale_after_seconds, "collector stale_after_seconds");
  if (heartbeatSeconds >= staleAfterSeconds) {
    throw new Error("collector heartbeat_seconds must be less than stale_after_seconds");
  }
  return {
    role: "machine",
    version: 1,
    machineId: text(input.machine_id, "machine_id", /^[a-z0-9][a-z0-9-]{0,62}$/),
    repositoryIds,
    server: {
      url: endpoint(server.url, "server url"),
      tokenFile: secretFile(server.token_file, "server token_file"),
      connectTimeoutMs: positiveInteger(server.connect_timeout_ms, "server connect_timeout_ms"),
      requestTimeoutMs: positiveInteger(server.request_timeout_ms, "server request_timeout_ms"),
    },
    collector: {
      scanSeconds: positiveInteger(collector.scan_seconds, "collector scan_seconds"),
      heartbeatSeconds,
      staleAfterSeconds,
      sessionLookbackDays: positiveInteger(collector.session_lookback_days, "collector session_lookback_days"),
      stateDb: absolutePath(collector.state_db, "collector state_db"),
      watchRoots,
      codexSessions: absolutePath(collector.codex_sessions, "collector codex_sessions"),
      claudeSessions: absolutePath(collector.claude_sessions, "collector claude_sessions"),
    },
  };
}

function serverConfig(input: Readonly<Record<string, unknown>>): ServerConfig {
  keys(input, [
    "version",
    "bind",
    "external_url",
    "database",
    "machine_offline_after_seconds",
    "history_retention_days",
    "telegram",
  ], "server config");
  if (input.version !== 1) throw new Error("server config version must be 1");
  const telegram = record(input.telegram, "server telegram");
  keys(telegram, ["bot_token_file", "allowed_user_ids", "default_chat_id", "long_poll_seconds"], "server telegram");
  if (!Array.isArray(telegram.allowed_user_ids) || telegram.allowed_user_ids.length === 0) {
    throw new Error("telegram allowed_user_ids must be a non-empty array");
  }
  const allowedUserIds = telegram.allowed_user_ids.map((id) => positiveInteger(id, "telegram allowed_user_id"));
  const defaultChatId = positiveInteger(telegram.default_chat_id, "telegram default_chat_id");
  if (!allowedUserIds.includes(defaultChatId)) throw new Error("telegram default_chat_id must be authorized");
  return {
    role: "server",
    version: 1,
    bind: text(input.bind, "server bind", /^(\[[0-9a-f:]+\]|[^:\s]+):[1-9]\d{0,4}$/i),
    externalUrl: endpoint(input.external_url, "server external_url"),
    database: absolutePath(input.database, "server database"),
    machineOfflineAfterSeconds: positiveInteger(
      input.machine_offline_after_seconds,
      "server machine_offline_after_seconds",
    ),
    historyRetentionDays: positiveInteger(input.history_retention_days, "server history_retention_days"),
    telegram: {
      botTokenFile: secretFile(telegram.bot_token_file, "telegram bot_token_file"),
      allowedUserIds,
      defaultChatId,
      longPollSeconds: positiveInteger(telegram.long_poll_seconds, "telegram long_poll_seconds"),
    },
  };
}

/**
 * @tested-by: tst_unit_planctl_config_001
 * @invariant: configuration is explicit, role-specific and refuses unsafe secret permissions or endpoints.
 */
export function loadPlanctlConfig(path: string, role: PlanctlRole): PlanctlConfig {
  if (!isAbsolute(path)) throw new Error("config path must be absolute");
  const parsed: unknown = Bun.TOML.parse(readFileSync(path, "utf8"));
  const input = record(parsed, `${role} config`);
  return role === "machine" ? machineConfig(input) : serverConfig(input);
}
