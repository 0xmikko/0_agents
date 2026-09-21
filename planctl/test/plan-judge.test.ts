import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "bun:test";
import { putDelivery, putStage } from "../src/core/plan-update";

const GATE = join(import.meta.dir, "../src/core/plan-gate.ts");
const CLI = join(import.meta.dir, "../src/cli/main.ts");
const FIXTURES = join(import.meta.dir, "fixtures");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "plan-judge-"));
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q");
  git("-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "--allow-empty", "-qm", "fixture");
  const bin = join(root, "bin");
  mkdirSync(bin);
  symlinkSync(process.execPath, join(bin, "bun"));
  symlinkSync(execFileSync("which", ["git"], { encoding: "utf8" }).trim(), join(bin, "git"));
  const env = { ...process.env, PATH: bin, PLAN_JUDGE_TEST_LOG: join(root, "calls.jsonl") };
  const run = (script: string, args: string[]) => spawnSync(process.execPath, [script, ...args], { cwd: root, env, encoding: "utf8", timeout: 10_000 });
  const plan = join(root, "plan.md");
  expect(run(CLI, ["init", plan, "--title", "Fixture"]).status).toBe(0);
  git("-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-qm", "plan");
  expect(run(CLI, ["set-spec", plan, "--from", join(FIXTURES, "plan-lint.md")]).status).toBe(0);
  return {
    root, plan, env, run,
    judge: () => run(GATE, [plan, "--judge", "--root", root]),
    lock: () => run(CLI, ["approve-spec", plan, "--owner-word", "yes"]),
    installClaude: () => { copyFileSync(join(FIXTURES, "bin/claude"), join(bin, "claude")); chmodSync(join(bin, "claude"), 0o755); },
    calls: () => readFileSync(env.PLAN_JUDGE_TEST_LOG, "utf8").trim().split("\n"),
  };
}

// @test-id: tst_plan_judge_001
// @covers: plan-gate --judge, SPEC cache, lock-spec; fake Claude on PATH.
it("tst_plan_judge_001 judges SPEC once, reuses its verdict for locking, and invalidates changed input", () => {
  const f = fixture();
  try {
    f.installClaude();
    const judged = f.judge();
    expect(judged.status, judged.stdout + judged.stderr).toBe(0);
    expect(judged.stdout).toContain("PASS Goal");
    expect(f.calls()).toHaveLength(1);
    const call = f.calls()[0];
    expect(call).toContain("Reduce invalid changes");
    expect(call).not.toContain("Execution log");
    expect(call).toContain("--safe-mode");
    expect(call).toContain("haiku");
    expect(f.judge().status).toBe(0);
    expect(f.lock().status).toBe(0);
    expect(readFileSync(f.plan, "utf8")).toContain("Status: SPEC_LOCKED");
    expect(f.calls()).toHaveLength(1);
    const delivery = putDelivery(readFileSync(f.plan, "utf8"), {
      id: "D1", title: "Validation", branch: "feat/validation", depends: [], gate: ["scripts"], active: true,
      stageGraph: "D1-S1", predictedExternalWaitMinutes: 0, description: "Refuse empty names.",
    }).body;
    const staged = putStage(delivery, {
      id: "D1-S1", deliveryId: "D1", title: "Validate names", owner: "agent", profile: "strong",
      depends: [], parallelWith: [], writes: ["src/change.ts"], tempRoot: ".tmp/code-production/validation/D1-S1",
      predictedActiveMinutes: 0, predictedCredits: 0, verifyActiveMinutes: 0, verifyCredits: 0,
      description: "Reject an empty name before storage.",
      tasks: [{ id: "VALIDATE_001", story: "Reject empty names before storage.", writes: ["src/change.ts"],
        predictedActiveMinutes: 0, predictedCredits: 0, how: "Use the existing parser.", red: "bun run agent:test:backend -- test/change.test.ts" }],
      criteria: ["`true` exits 0", "Commit"],
    }).body;
    writeFileSync(f.plan, staged);
    expect(f.judge().status).toBe(0);
    expect(f.calls()).toHaveLength(2);
    writeFileSync(f.plan, staged.replace("Reject an empty name before storage.", "Reject empty or whitespace names before storage."));
    expect(f.judge().status).toBe(0);
    expect(f.calls()).toHaveLength(3);
    mkdirSync(join(f.root, "docs"));
    writeFileSync(join(f.root, "docs/graph.md"), "| Term | Meaning | Not |\n| Change | public input | record |\n");
    expect(f.judge().status).toBe(0);
    expect(f.calls()).toHaveLength(4);
    writeFileSync(join(f.root, "docs/graph.md"), "| Term | Meaning | Not |\n| Change | public input | mutation |\n");
    expect(f.judge().status).toBe(0);
    expect(f.calls()).toHaveLength(5);
    writeFileSync(f.plan, readFileSync(f.plan, "utf8").replace("Reduce invalid changes", "Prevent invalid changes"));
    expect(f.judge().status).toBe(0);
    expect(f.calls()).toHaveLength(6);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// @test-id: tst_plan_judge_002
// @covers: FAIL, malformed verdict, CLI error, missing quote, missing rule.
it("tst_plan_judge_002 reports quoted failures and refuses incomplete or unavailable answers without changing the plan", () => {
  for (const response of [
    { is_error: false, structured_output: Object.fromEntries(["Goal", "Stages", "Names", "Prose"].map(rule => [rule, { verdict: rule === "Goal" ? "FAIL" : "PASS", quote: "## The Goal", fix: rule === "Goal" ? "Describe an observable outcome." : "" }])) },
    { is_error: false, structured_output: { Goal: { verdict: "PASS", quote: "## The Goal", fix: "" } } },
    { is_error: false, structured_output: Object.fromEntries(["Goal", "Stages", "Names", "Prose"].map(rule => [rule, { verdict: "PASS", quote: "invented quote", fix: "" }])) },
    { is_error: true, result: "You've hit your weekly limit" },
    "not JSON",
  ]) {
    const f = fixture();
    try {
      f.installClaude();
      const reply = join(f.root, "reply.json");
      writeFileSync(reply, typeof response === "string" ? response : JSON.stringify(response));
      Object.assign(f.env, { PLAN_JUDGE_TEST_REPLY: reply });
      const before = readFileSync(f.plan, "utf8");
      const judged = f.judge();
      expect(judged.status, judged.stdout + judged.stderr).toBe(1);
      expect(judged.stdout + judged.stderr).toMatch(/judge|FAIL Goal/);
      const locked = f.lock();
      expect(locked.status, locked.stdout + locked.stderr).toBe(1);
      expect(readFileSync(f.plan, "utf8")).toBe(before);
      if (judged.stdout.includes("FAIL Goal")) {
        expect(judged.stdout).toContain("Describe an observable outcome.");
        expect(f.calls()).toHaveLength(1);
      } else {
        // Transport and malformed responses are not verdicts and must not poison the cache.
        Reflect.deleteProperty(f.env, "PLAN_JUDGE_TEST_REPLY");
        const recovered = f.judge();
        expect(recovered.status, recovered.stderr).toBe(0);
        expect(f.calls()).toHaveLength(3);
      }
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});

// @test-id: tst_plan_judge_003
// @covers: unavailable binary; no fallback or plan mutation.
it("tst_plan_judge_003 refuses to lock without Claude", () => {
  const f = fixture();
  try {
    const before = readFileSync(f.plan, "utf8");
    const result = f.lock();
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stderr).toContain("claude");
    expect(readFileSync(f.plan, "utf8")).toBe(before);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// @test-id: tst_plan_judge_004
// @covers: lock applies only to the exact document the judge read.
it("tst_plan_judge_004 refuses a plan changed while Claude was reviewing it", () => {
  const f = fixture();
  try {
    f.installClaude();
    const spec = join(f.root, "changed.md");
    writeFileSync(spec, readFileSync(join(FIXTURES, "plan-lint.md"), "utf8").replace("Reduce invalid changes", "Prevent invalid changes"));
    Object.assign(f.env, { PLAN_JUDGE_TEST_MUTATE: JSON.stringify([CLI, "set-spec", f.plan, "--from", spec]) });
    const result = f.lock();
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stderr).toContain("changed while");
    const plan = readFileSync(f.plan, "utf8");
    expect(plan).toContain("Prevent invalid changes");
    expect(plan).toContain("Status: SPEC_DRAFT");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// @test-id: tst_plan_judge_005
// @covers: a failed Claude process preserves its diagnostic even without JSON.
it("tst_plan_judge_005 reports CLI startup errors", () => {
  const f = fixture();
  try {
    f.installClaude();
    const reply = join(f.root, "reply");
    writeFileSync(reply, "");
    Object.assign(f.env, { PLAN_JUDGE_TEST_REPLY: reply, PLAN_JUDGE_TEST_ERROR: "unsupported CLI flag" });
    const result = f.judge();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unsupported CLI flag");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
