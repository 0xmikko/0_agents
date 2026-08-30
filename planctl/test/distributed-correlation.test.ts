import { afterEach, expect, it } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

import { loadPlanctlConfig } from "../src/config/config";
import {
  approvePlan,
  createDraftPlan,
  lockPlanSpec,
  putDelivery,
  putStage,
  replaceDraftSpec,
} from "../src/core/plan-update";
import { LocalMachineObservationSource } from "../src/machine/app.module";
import { MachineStore } from "../src/machine/state/machine-store";

const CLI = resolve(import.meta.dir, "../src/cli/main.ts");
const roots: string[] = [];

function git(root: string, ...args: readonly string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function approvedPlan(): string {
  let body = createDraftPlan("Correlation fixture");
  body = replaceDraftSpec(body, [
    "## The Goal",
    "",
    "Keep one real agent assigned to its approved Task.",
    "",
    "## The target",
    "",
    "One distributed Task receipt.",
  ].join("\n")).body;
  body = lockPlanSpec(body, "fixture-spec").body;
  body = putDelivery(body, {
    id: "D1",
    title: "Correlation",
    branch: "feat/correlation",
    depends: [],
    gate: ["bun test"],
    active: true,
    stageGraph: "D1-S1",
  }).body;
  body = putStage(body, {
    id: "D1-S1",
    deliveryId: "D1",
    title: "Bind one session",
    owner: "fixture-agent",
    profile: "fast",
    depends: [],
    parallelWith: [],
    writes: ["src/example.ts"],
    tempRoot: ".tmp/code-production/correlation/D1-S1",
    predictedActiveMinutes: 10,
    predictedCredits: 2,
    tasks: [{
      id: "CORR_001",
      story: "bind the real CLI receipt to the observed Codex session",
      writes: ["src/example.ts"],
      predictedActiveMinutes: 10,
      predictedCredits: 2,
      how: "reuse the validated machine identity and current session metadata",
      red: "bun run agent:test:backend -- test/distributed-correlation.test.ts",
    }],
    criteria: ["Commit"],
  }).body;
  return approvePlan(body, "fixture-plan").body;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * @test-id: tst_int_planctl_correlation_001
 * @scenario: scn_planctl_correlation_001
 * @covers: planctl/src/cli/main.ts::startTask
 * @covers: planctl/src/machine/app.module.ts::LocalMachineObservationSource.scan
 * @deterministic: yes
 * @fixtures: temporary Git repository, machine TOML and sanitized Codex JSONL
 *
 * Test environment: real CLI subprocess through the local collector
 * Clients: planctl start-task and LocalMachineObservationSource
 * Mocks: process discovery may add unrelated agents; the asserted fixture identity is exact
 * Data: explicit machine, repository, worktree, branch and Codex session identity
 */
it("tst_int_planctl_correlation_001 binds a real start-task receipt through the collector", () => {
  const root = mkdtempSync(join(tmpdir(), "planctl-correlation-"));
  roots.push(root);
  mkdirSync(join(root, "docs/plans"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "sessions/codex"), { recursive: true });
  mkdirSync(join(root, "sessions/claude"), { recursive: true });
  mkdirSync(join(root, "state"), { recursive: true });
  git(root, "init", "-q");
  git(root, "config", "user.email", "planctl@example.test");
  git(root, "config", "user.name", "Planctl Test");
  git(root, "checkout", "-qb", "feat/correlation");
  const plan = "docs/plans/correlation.md";
  writeFileSync(join(root, plan), approvedPlan());
  writeFileSync(join(root, "src/example.ts"), "export {};\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "test: correlation fixture");

  const token = join(root, "machine.token");
  writeFileSync(token, "fixture-machine-token\n", { mode: 0o600 });
  chmodSync(token, 0o600);
  const configRoot = join(root, "config");
  mkdirSync(join(configRoot, "planctl"), { recursive: true });
  const configPath = join(configRoot, "planctl/machine.toml");
  writeFileSync(configPath, `
version = 1
machine_id = "machine-a"
repository_ids = { "${root}" = "fixture/repository" }

[server]
url = "https://planctl.example.test"
token_file = "${token}"
connect_timeout_ms = 1000
request_timeout_ms = 5000

[collector]
scan_seconds = 5
heartbeat_seconds = 15
stale_after_seconds = 900
session_lookback_days = 7
state_db = "${join(root, "state/machine.sqlite")}"
watch_roots = ["${root}"]
codex_sessions = "${join(root, "sessions/codex")}"
claude_sessions = "${join(root, "sessions/claude")}"
`);
  writeFileSync(join(root, "sessions/codex/fixture.jsonl"), [
    JSON.stringify({
      timestamp: "2026-08-30T00:00:00.000Z",
      type: "session_meta",
      payload: { id: "fixture-session", cwd: root, source: "cli" },
    }),
    JSON.stringify({
      timestamp: "2026-08-30T00:00:01.000Z",
      type: "response_item",
      payload: { type: "message", content: "DO_NOT_UPLOAD_FIXTURE_PAYLOAD" },
    }),
    "",
  ].join("\n"));

  const started = spawnSync("bun", [CLI, "start-task", plan, "--task", "CORR_001"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      XDG_CONFIG_HOME: configRoot,
      CODEX_SESSION_ID: "fixture-session",
      CODEX_THREAD_ID: "fixture-session",
    },
  });
  expect(started.status, started.stderr).toBe(0);
  expect(started.stdout).toContain("Task CORR_001 STARTED");
  expect(started.stdout).toContain("TaskRunV2");

  const receiptRoot = join(root, ".git/planctl/task-runs");
  const receiptFile = readdirSync(receiptRoot).find((entry) => entry.endsWith(".json"));
  if (receiptFile === undefined) throw new Error("start-task receipt was not written");
  expect(JSON.parse(readFileSync(join(receiptRoot, receiptFile), "utf8"))).toMatchObject({
    version: 2,
    machineId: "machine-a",
    agentId: "codex:fixture-session",
    repositoryId: "fixture/repository",
    worktree: root,
    branch: "feat/correlation",
  });

  const config = loadPlanctlConfig(configPath, "machine");
  if (config.role !== "machine") throw new Error("machine fixture decoded as server");
  const store = new MachineStore(config.collector.stateDb);
  try {
    const observation = new LocalMachineObservationSource(config, store).scan(
      new Date("2026-08-30T00:00:02.000Z"),
    );
    expect(observation.agents.find((agent) => agent.agentId === "codex:fixture-session")).toMatchObject({
      state: "working",
      repositoryId: "fixture/repository",
      planId: "fixture/repository:docs/plans/correlation.md",
      taskId: "CORR_001",
    });
  } finally {
    store.close();
  }
});
