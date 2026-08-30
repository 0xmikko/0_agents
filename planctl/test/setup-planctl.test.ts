import { afterEach, describe, expect, it } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const roots: string[] = [];
const repositoryRoot = resolve(import.meta.dir, "../..");

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "planctl-setup-"));
  roots.push(root);
  return root;
}

function runSetup(root: string, role: "machine" | "server", config: string) {
  return spawnSync("bash", [
    join(repositoryRoot, "lib/setup-planctl.sh"),
    "--role", role,
    "--config", config,
    "--unit-dir", join(root, "units"),
    "--bin-dir", join(root, "bin"),
    "--systemctl", join(root, "fake-systemctl"),
  ], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, PLANCTL_TEST_SYSTEMCTL_LOG: join(root, "systemctl.log") },
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("planctl role setup", () => {
  /**
   * @test-id: tst_int_planctl_install_001
   * @scenario: scn_planctl_install_001
   * @covers: lib/setup-planctl.sh
   * @covers: lib/install-bin.sh
   * @deterministic: yes
   * @fixtures: isolated config, secret, bin, unit and fake-systemctl paths
   * Test environment: Bash subprocesses with real planctl config validation
   * Clients: machine/server operator
   * Mocks: explicit fake systemctl executable only
   * Data: invalid-secret mode followed by valid machine and server configs
   */
  it("tst_int_planctl_install_001 validates before idempotent link, unit install and service start", () => {
    const root = temporaryRoot();
    const machineSecret = join(root, "machine.token");
    const telegramSecret = join(root, "telegram.token");
    const machineConfig = join(root, "machine.toml");
    const serverConfig = join(root, "server.toml");
    const watchRoot = join(root, "coding");
    mkdirSync(watchRoot, { recursive: true });
    writeFileSync(machineSecret, "machine-secret\n", { mode: 0o644 });
    writeFileSync(telegramSecret, "telegram-secret\n", { mode: 0o600 });
    writeFileSync(machineConfig, [
      "version = 1",
      'machine_id = "machine-a"',
      `repository_ids = { "${watchRoot}" = "fixture/repository" }`,
      "[server]",
      'url = "http://127.0.0.1:4789"',
      `token_file = "${machineSecret}"`,
      "connect_timeout_ms = 100",
      "request_timeout_ms = 250",
      "[collector]",
      "scan_seconds = 5",
      "heartbeat_seconds = 15",
      "stale_after_seconds = 60",
      "session_lookback_days = 7",
      `state_db = "${join(root, "machine.sqlite")}"`,
      `watch_roots = ["${watchRoot}"]`,
      `codex_sessions = "${join(root, "codex-sessions")}"`,
      `claude_sessions = "${join(root, "claude-sessions")}"`,
      "",
    ].join("\n"));
    writeFileSync(serverConfig, [
      "version = 1",
      'bind = "127.0.0.1:4789"',
      'external_url = "http://127.0.0.1:4789"',
      `database = "${join(root, "server.sqlite")}"`,
      "machine_offline_after_seconds = 60",
      "history_retention_days = 90",
      "[telegram]",
      `bot_token_file = "${telegramSecret}"`,
      "allowed_user_ids = [101]",
      "default_chat_id = 101",
      "long_poll_seconds = 30",
      "claim_lease_seconds = 60",
      "notifier_scan_milliseconds = 5000",
      "",
    ].join("\n"));
    writeFileSync(join(root, "fake-systemctl"), [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      ": \"${PLANCTL_TEST_SYSTEMCTL_LOG:?}\"",
      "printf '%s\\n' \"$*\" >> \"$PLANCTL_TEST_SYSTEMCTL_LOG\"",
      "",
    ].join("\n"), { mode: 0o755 });

    const originalMachineConfig = readFileSync(machineConfig, "utf8");
    const rejected = runSetup(root, "machine", machineConfig);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("mode 0600");
    expect(existsSync(join(root, "systemctl.log"))).toBeFalse();
    expect(existsSync(join(root, "units"))).toBeFalse();

    chmodSync(machineSecret, 0o600);
    for (const result of [
      runSetup(root, "machine", machineConfig),
      runSetup(root, "machine", machineConfig),
      runSetup(root, "server", serverConfig),
    ]) {
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    }
    expect(readFileSync(machineConfig, "utf8")).toBe(originalMachineConfig);
    for (const binary of ["planctl", "planctld", "planctl-server"]) {
      const path = join(root, "bin", binary);
      expect(lstatSync(path).isSymbolicLink()).toBeTrue();
      expect(readlinkSync(path)).toBe(join(repositoryRoot, "bin", binary));
    }
    expect(readFileSync(join(root, "units", "planctld.service"), "utf8")).toContain(`--config ${machineConfig}`);
    expect(readFileSync(join(root, "units", "planctl-server.service"), "utf8")).toContain(`--config ${serverConfig}`);
    const systemctl = readFileSync(join(root, "systemctl.log"), "utf8");
    expect(systemctl.match(/enable --now planctld\.service/g)).toHaveLength(2);
    expect(systemctl.match(/enable --now planctl-server\.service/g)).toHaveLength(1);

    const incompleteUpdate = spawnSync("bash", [join(repositoryRoot, "update.sh"), "--planctl-role", "machine"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    expect(incompleteUpdate.status).not.toBe(0);
    expect(incompleteUpdate.stderr).toContain("--planctl-role and --planctl-config must be supplied together");
    const incompleteBootstrap = spawnSync("bash", [
      join(repositoryRoot, "install-server-linux.sh"),
      "--planctl-role=machine",
    ], { cwd: repositoryRoot, encoding: "utf8" });
    expect(incompleteBootstrap.status).not.toBe(0);
    expect(incompleteBootstrap.stderr).toContain("--planctl-role and --planctl-config must be supplied together");
  });
});
