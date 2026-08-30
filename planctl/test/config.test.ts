import { afterEach, describe, expect, it } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadPlanctlConfig } from "../src/config/config";

const roots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "planctl-config-"));
  roots.push(root);
  mkdirSync(join(root, "work"), { recursive: true });
  mkdirSync(join(root, "sessions/codex"), { recursive: true });
  mkdirSync(join(root, "sessions/claude"), { recursive: true });
  mkdirSync(join(root, "state"), { recursive: true });
  return root;
}

function secret(root: string, name: string): string {
  const path = join(root, name);
  writeFileSync(path, "fixture-secret\n", { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("planctl configuration", () => {
  /**
   * @test-id: tst_unit_planctl_config_001
   * @scenario: scn_planctl_config_001
   * @covers: planctl/src/config/config.ts::loadPlanctlConfig
   * @deterministic: yes
   * @fixtures: temporary TOML and mode-0600 secret files
   *
   * Test environment: temporary machine/server configuration roots
   * Clients: direct file-backed decoder
   * Mocks: none
   * Data: explicit absolute paths, security endpoint and timing boundaries
   */
  it("tst_unit_planctl_config_001 decodes both roles and rejects unsafe secrets, timing and endpoints", () => {
    const root = fixtureRoot();
    const machineToken = secret(root, "machine.token");
    const telegramToken = secret(root, "telegram.token");
    const machinePath = join(root, "machine.toml");
    const serverPath = join(root, "server.toml");
    const machineToml = `
version = 1
machine_id = "u3775"
repository_ids = { "${join(root, "work/no-remote")}" = "no-remote" }

[server]
url = "https://planctl.example.ts.net"
token_file = "${machineToken}"
connect_timeout_ms = 1000
request_timeout_ms = 5000

[collector]
scan_seconds = 5
heartbeat_seconds = 15
stale_after_seconds = 900
session_lookback_days = 7
state_db = "${join(root, "state/machine.sqlite")}"
watch_roots = ["${join(root, "work")}"]
codex_sessions = "${join(root, "sessions/codex")}"
claude_sessions = "${join(root, "sessions/claude")}"
`;
    const serverToml = `
version = 1
bind = "127.0.0.1:4789"
external_url = "https://planctl.example.ts.net"
database = "${join(root, "state/server.sqlite")}"
machine_offline_after_seconds = 60
history_retention_days = 90

[telegram]
bot_token_file = "${telegramToken}"
allowed_user_ids = [123456789]
default_chat_id = 123456789
long_poll_seconds = 30
claim_lease_seconds = 60
notifier_scan_milliseconds = 5000
`;
    writeFileSync(machinePath, machineToml);
    writeFileSync(serverPath, serverToml);

    const machine = loadPlanctlConfig(machinePath, "machine");
    expect(machine.role).toBe("machine");
    if (machine.role !== "machine") throw new Error("machine fixture decoded as server");
    expect(machine.machineId).toBe("u3775");
    expect(machine.collector.staleAfterSeconds).toBe(900);

    const server = loadPlanctlConfig(serverPath, "server");
    expect(server.role).toBe("server");
    if (server.role !== "server") throw new Error("server fixture decoded as machine");
    expect(server.telegram.allowedUserIds).toEqual([123456789]);
    expect(server.telegram.claimLeaseSeconds).toBe(60);
    expect(server.telegram.notifierScanMilliseconds).toBe(5000);

    writeFileSync(serverPath, serverToml.replace("https://planctl.example.ts.net", "http://planctl.lan"));
    expect(() => loadPlanctlConfig(serverPath, "server")).toThrow("plain HTTP");

    writeFileSync(machinePath, machineToml.replace("heartbeat_seconds = 15", "heartbeat_seconds = 900"));
    expect(() => loadPlanctlConfig(machinePath, "machine")).toThrow("heartbeat_seconds");

    writeFileSync(machinePath, machineToml);
    chmodSync(machineToken, 0o644);
    expect(() => loadPlanctlConfig(machinePath, "machine")).toThrow("0600");
  });
});
