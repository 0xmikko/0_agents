import { afterEach, expect, it } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const REPOSITORY_ROOT = resolve(PACKAGE_ROOT, "..");
const roots: string[] = [];

function buildArguments(outputDirectory: string): readonly string[] {
  const parsed: unknown = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("planctl package manifest must be an object");
  }
  const scripts = (parsed as Readonly<Record<string, unknown>>).scripts;
  if (typeof scripts !== "object" || scripts === null || Array.isArray(scripts)) {
    throw new Error("planctl package scripts must be an object");
  }
  const command = (scripts as Readonly<Record<string, unknown>>).build;
  if (typeof command !== "string" || command === "") throw new Error("planctl build script is missing");
  const tokens = command.split(/\s+/);
  if (tokens[0] !== "bun" || tokens[1] !== "build") throw new Error("planctl build script must invoke bun build");
  const outdir = tokens.indexOf("--outdir");
  if (outdir === -1 || tokens[outdir + 1] === undefined) throw new Error("planctl build script must declare --outdir");
  tokens[outdir + 1] = outputDirectory;
  return tokens;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * @test-id: tst_cert_planctl_build_001
 * @scenario: scn_planctl_build_001
 * @covers: planctl/package.json#scripts.build
 * @deterministic: yes
 * @fixtures: isolated build output directory
 *
 * Test environment: Bun bundler over all three production entrypoints
 * Clients: declared package build command
 * Mocks: none
 * Data: CLI, machine collector and central server entrypoints
 */
it("tst_cert_planctl_build_001 bundles every production entrypoint without optional Nest peers", () => {
  const output = mkdtempSync(join(tmpdir(), "planctl-package-build-"));
  roots.push(output);
  const [executable, ...args] = buildArguments(output);
  if (executable === undefined) throw new Error("planctl build executable is missing");
  const built = spawnSync(executable, args, { cwd: PACKAGE_ROOT, encoding: "utf8" });

  expect(built.status, built.stderr).toBe(0);
  const artifacts = [
    "cli/main.js",
    "core/plan-gate.js",
    "core/plan-update.js",
    "machine/main.js",
    "server/main.js",
  ];
  expect(artifacts.every((artifact) => existsSync(join(output, artifact)))).toBeTrue();

  for (const [artifact, args, expectedStatus, expectedOutput] of [
    ["cli/main.js", ["--help"], 0, "planctl <command>"],
    ["machine/main.js", ["--help"], 0, "Usage: planctld"],
    ["server/main.js", ["--help"], 0, "Usage: planctl-server"],
    ["core/plan-gate.js", [], 64, "usage: bun"],
    ["core/plan-update.js", [], 64, "usage: bun"],
  ] as const) {
    const smoke = spawnSync("bun", [join(output, artifact), ...args], { cwd: output, encoding: "utf8" });
    expect(smoke.status, `${artifact}: ${smoke.stderr}`).toBe(expectedStatus);
    expect(`${smoke.stdout}${smoke.stderr}`).toContain(expectedOutput);
  }
});

/**
 * @test-id: tst_cert_planctl_built_focus_001
 * @scenario: scn_planctl_built_focus_001
 * @covers: planctl/src/cli/main.ts::focus
 * @covers: planctl/src/machine/discovery/git-worktree.source.ts::discoverGitWorktrees
 * @deterministic: yes
 * @fixtures: isolated built artifacts, approved plan, Git remote and in-process progress server
 */
it("tst_cert_planctl_built_focus_001 runs remote focus from the built CLI with Git-remote-only identity", async () => {
  const output = mkdtempSync(join(tmpdir(), "planctl-built-focus-"));
  roots.push(output);
  const [executable, ...args] = buildArguments(output);
  if (executable === undefined) throw new Error("planctl build executable is missing");
  const built = spawnSync(executable, args, { cwd: PACKAGE_ROOT, encoding: "utf8" });
  expect(built.status, built.stderr).toBe(0);

  const repository = join(output, "repository");
  const plan = "docs/plans/planctl-observer-daemon.md";
  const planBody = readFileSync(join(REPOSITORY_ROOT, plan), "utf8");
  const revision = /^Implementation lock: sha256:([0-9a-f]{64}) /m.exec(planBody)?.[1];
  if (revision === undefined) throw new Error("fixture plan revision is missing");
  mkdirSync(join(repository, "docs/plans"), { recursive: true });
  writeFileSync(join(repository, plan), planBody);
  for (const gitArgs of [
    ["init", "-q", "-b", "fixture"],
    ["config", "user.email", "fixture@example.test"],
    ["config", "user.name", "Fixture"],
    ["add", plan],
    ["commit", "-qm", "test: built focus fixture"],
    ["remote", "add", "origin", "git@github.com:fixture/repository.git"],
  ]) {
    const result = spawnSync("git", gitArgs, { cwd: repository, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  }

  let authenticatedMachine: string | null = null;
  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      authenticatedMachine = request.headers.get("x-planctl-machine-id");
      return Response.json({
        generatedAt: "2026-08-30T12:00:00.000Z",
        plans: [{
          planId: `github.com/fixture/repository:${plan}`,
          planRevision: revision,
          goal: "Keep distributed coding work observable",
          completionPercent: 100,
          tasks: { completed: 1, total: 1 },
          activeMinutes: { completed: 1, remaining: 0, total: 1 },
          attention: { ownerWait: 0, stale: 0, unassigned: 0 },
          remainingActiveMinutes: 0,
          criticalPathMinutes: 0,
          calibratedCriticalPathMinutes: 0,
          estimatedDeliveryAt: "2026-08-30T12:00:00.000Z",
        }],
      });
    },
  });
  try {
    const token = join(output, "machine.token");
    writeFileSync(token, "fixture-machine-token\n", { mode: 0o600 });
    chmodSync(token, 0o600);
    const config = join(output, "machine.toml");
    writeFileSync(config, [
      "version = 1",
      'machine_id = "machine-a"',
      "repository_ids = {}",
      "",
      "[server]",
      `url = "http://127.0.0.1:${server.port}"`,
      `token_file = "${token}"`,
      "connect_timeout_ms = 1000",
      "request_timeout_ms = 5000",
      "",
      "[collector]",
      "scan_seconds = 5",
      "heartbeat_seconds = 15",
      "stale_after_seconds = 900",
      "session_lookback_days = 7",
      `state_db = "${join(output, "machine.sqlite")}"`,
      `watch_roots = ["${repository}"]`,
      `codex_sessions = "${join(output, "codex")}"`,
      `claude_sessions = "${join(output, "claude")}"`,
      "",
    ].join("\n"));
    const child = Bun.spawn([
      "bun",
      join(output, "cli/main.js"),
      "focus",
      plan,
      "--server",
      "--config",
      config,
    ], { cwd: repository, stdout: "pipe", stderr: "pipe" });
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(status, stderr).toBe(0);
    expect(stdout).toContain(`Source: server http://127.0.0.1:${server.port}`);
    expect(stdout).not.toContain("server offline");
    expect(String(authenticatedMachine)).toBe("machine-a");
  } finally {
    server.stop(true);
  }
});
