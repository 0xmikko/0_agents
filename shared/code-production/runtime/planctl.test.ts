import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

import type { DeliveryInput, StageInput, StageResultReceipt } from "./plan-update";

const DELIVERY: DeliveryInput = {
  id: "D1",
  title: "Foundation",
  branch: "feat/foundation",
  depends: [],
  gate: ["scripts"],
  active: true,
  stageGraph: "D1-S1",
};

const STAGE: StageInput = {
  id: "D1-S1",
  deliveryId: "D1",
  title: "Canonical ownership",
  owner: "integrator",
  profile: "strong",
  depends: [],
  parallelWith: [],
  writes: ["scripts/example.ts"],
  tempRoot: ".tmp/code-production/fixture/D1-S1",
  predictedActiveMinutes: 13,
  predictedCredits: 3,
  tasks: [{
    id: "PLANCTL_001",
    story: "extend the canonical writer through the planctl facade",
    writes: ["scripts/example.ts"],
    predictedActiveMinutes: 10,
    predictedCredits: 2,
    how: "extend scripts/example.ts through the canonical plan-update mutation engine",
    red: "bun run agent:test:backend -- test/planctl.test.ts",
  }],
  criteria: ["`true` exits 0 — behavior is proven", "Commit"],
};

function git(root: string, ...args: readonly string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function fixtureRepository(): {
  readonly root: string;
  readonly plan: string;
  readonly spec: string;
  readonly delivery: string;
  readonly stage: string;
} {
  const root = mkdtempSync(join(tmpdir(), "portable-planctl-"));
  git(root, "init", "-q");
  git(root, "config", "user.email", "planctl@example.test");
  git(root, "config", "user.name", "Planctl Test");
  mkdirSync(join(root, "docs", "plans"), { recursive: true });
  const plan = join(root, "docs", "plans", "fixture.md");
  const spec = join(root, "spec.md");
  const delivery = join(root, "delivery.json");
  const stage = join(root, "stage.json");
  writeFileSync(spec, "## The Goal\n\nShip one observable result.\n\n## The target\n\nOne active Delivery.\n");
  writeFileSync(delivery, `${JSON.stringify(DELIVERY)}\n`);
  writeFileSync(stage, `${JSON.stringify(STAGE)}\n`);
  return { root, plan, spec, delivery, stage };
}

function run(root: string, ...args: readonly string[]) {
  return spawnSync("bun", [join(import.meta.dir, "planctl.ts"), ...args], { cwd: root, encoding: "utf8" });
}

describe("planctl", () => {
  /*
   * @test-id: tst_scripts_planctl_001
   * @scenario: scn_plan_control_001
   * @covers: scripts/planctl.ts::help
   * @deterministic: yes
   * @fixtures: none
   * Test environment: Bun child process
   * Clients: CLI
   * Mocks: none
   * Data: global and command help arguments
   */
  it("tst_scripts_planctl_001 explains the small command surface and receipt inputs", () => {
    const general = run(import.meta.dir, "--help");
    const task = run(import.meta.dir, "complete-task", "--help");

    expect(general.status).toBe(0);
    expect(general.stdout).toContain("planctl <command>");
    expect(general.stdout).toContain("one canonical writer: plan-update");
    expect(general.stdout).toContain("start-task");
    expect(general.stdout).toContain("remove-stage");
    expect(task.status).toBe(0);
    expect(task.stdout).toContain("planctl complete-task <plan.md> --from <stage-result.json>");
    expect(task.stdout).toContain('"taskIds": ["PLANCTL_001"]');
    expect(task.stdout).toContain("<exact Started value from start-task>");

    const stage = run(import.meta.dir, "put-stage", "--help");
    expect(stage.status).toBe(0);
    expect(stage.stdout).toContain('"predictedActiveMinutes": 10');
    expect(stage.stdout).toContain('"writes": ["src/scheduler.ts", "test/scheduler.test.ts"]');
    expect(stage.stdout).toContain("Bad Task (rejected)");
    expect(stage.stdout).toContain("Good Task");
    expect(stage.stdout).toContain("Add or replace");
  });

  /*
   * @test-id: tst_scripts_planctl_002
   * @scenario: scn_plan_control_002
   * @covers: scripts/planctl.ts::init,set-spec,approve-spec,put-delivery,put-stage,approve-plan,verify
   * @deterministic: yes
   * @fixtures: temporary Git repository and JSON inputs
   * Test environment: isolated local Git repository
   * Clients: CLI
   * Mocks: none
   * Data: one SPEC, Delivery, Stage and Task
   */
  it("tst_scripts_planctl_002 authors and locks a plan through the canonical writer", () => {
    const fixture = fixtureRepository();
    try {
      for (const result of [
        run(fixture.root, "init", fixture.plan, "--title", "Fixture plan"),
        run(fixture.root, "set-spec", fixture.plan, "--from", fixture.spec),
      ]) {
        expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      }
      expect(readFileSync(fixture.plan, "utf8")).toContain("Status: SPEC_DRAFT");
      git(fixture.root, "commit", "-qam", "docs: draft plan");

      for (const result of [
        run(fixture.root, "approve-spec", fixture.plan, "--owner-word", "spec-approved"),
        run(fixture.root, "put-delivery", fixture.plan, "--from", fixture.delivery),
        run(fixture.root, "put-stage", fixture.plan, "--from", fixture.stage),
        run(fixture.root, "approve-plan", fixture.plan, "--owner-word", "plan-approved"),
        run(fixture.root, "verify", fixture.plan),
        run(fixture.root, "verify-staged", fixture.plan),
      ]) {
        expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      }

      const approved = readFileSync(fixture.plan, "utf8");
      expect(approved).toContain("Status: APPROVED");
      expect(approved).toContain("### PR Delivery D1 — Foundation");
      expect(approved).toContain("#### Stage D1-S1 — Canonical ownership");
      expect(approved).not.toContain("State: PLAN_APPROVED");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  /*
   * @test-id: tst_scripts_planctl_003
   * @scenario: scn_plan_control_003
   * @covers: scripts/planctl.ts::complete-task,add-deviation,close-stage
   * @deterministic: yes
   * @fixtures: temporary approved plan and Stage receipt
   * Test environment: isolated local Git repository
   * Clients: CLI
   * Mocks: none
   * Data: one committed Task result
   */
  it("tst_scripts_planctl_003 closes a Task through a validated Stage receipt", () => {
    const fixture = fixtureRepository();
    try {
      expect(run(fixture.root, "init", fixture.plan, "--title", "Fixture plan").status).toBe(0);
      expect(run(fixture.root, "set-spec", fixture.plan, "--from", fixture.spec).status).toBe(0);
      git(fixture.root, "commit", "-qam", "docs: draft plan");
      expect(run(fixture.root, "approve-spec", fixture.plan, "--owner-word", "yes").status).toBe(0);
      expect(run(fixture.root, "put-delivery", fixture.plan, "--from", fixture.delivery).status).toBe(0);
      expect(run(fixture.root, "put-stage", fixture.plan, "--from", fixture.stage).status).toBe(0);
      expect(run(fixture.root, "approve-plan", fixture.plan, "--owner-word", "yes").status).toBe(0);
      git(fixture.root, "commit", "-qm", "docs: approve plan");
      const approvedCommit = git(fixture.root, "rev-parse", "HEAD");
      expect(run(fixture.root, "clear-transaction", fixture.plan, "--commit", approvedCommit).status).toBe(0);
      const started = run(fixture.root, "start-task", fixture.plan, "--task", "PLANCTL_001");
      expect(started.status, `${started.stdout}\n${started.stderr}`).toBe(0);
      const startedAt = started.stdout.match(/^Started: (.+)$/m)?.[1];
      mkdirSync(join(fixture.root, "scripts"), { recursive: true });
      writeFileSync(join(fixture.root, "scripts", "example.ts"), "export const example = true;\n");
      git(fixture.root, "add", "scripts/example.ts");
      git(fixture.root, "commit", "-qm", "feat: implement example");
      const workCommit = git(fixture.root, "rev-parse", "HEAD");

      const receiptPath = join(fixture.root, "result.json");
      const receipt: StageResultReceipt = {
        version: 1,
        plan: "docs/plans/fixture.md",
        deliveryId: "D1",
        stageId: "D1-S1",
        taskIds: ["PLANCTL_001"],
        commit: workCommit,
        startedAt: startedAt ?? "missing",
        endedAt: startedAt ?? "missing",
        activeMinutes: 0,
        elapsedMinutes: 0,
        usage: { kind: "unavailable", reason: "test fixture" },
        paths: ["scripts/example.ts"],
        tests: [{ id: "tst_scripts_planctl_003", command: "true" }],
        result: "Canonical writer updated the addressed Task.",
        deviations: [],
        tempRoots: [{ path: STAGE.tempRoot, state: "absent" }],
      };
      writeFileSync(receiptPath, `${JSON.stringify({ ...receipt, usage: {} })}\n`);
      const malformed = run(fixture.root, "complete-task", fixture.plan, "--from", receiptPath);
      expect(malformed.status).toBe(1);
      expect(malformed.stderr).toContain("usage kind must be credits or unavailable");
      writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`);

      for (const result of [
        run(fixture.root, "complete-task", fixture.plan, "--from", receiptPath),
        run(fixture.root, "add-deviation", fixture.plan, "--stage", "D1-S1", "--reason", "No product suite needed."),
        run(fixture.root, "close-stage", fixture.plan, "--stage", "D1-S1"),
        run(fixture.root, "verify", fixture.plan),
        run(fixture.root, "verify-staged", fixture.plan),
      ]) {
        expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      }

      const completed = readFileSync(fixture.plan, "utf8");
      expect(completed).toContain("- [x] PLANCTL_001 — extend the canonical writer through the planctl facade");
      expect(completed).toContain("Canonical writer updated the addressed Task.");
      expect(completed).toContain("deviation D1-S1: No product suite needed.");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  /*
   * @test-id: tst_scripts_planctl_004
   * @scenario: scn_plan_control_004
   * @covers: scripts/planctl.ts::verify
   * @deterministic: yes
   * @fixtures: temporary approved plan
   * Test environment: isolated local Git repository
   * Clients: CLI plus a deliberate raw edit
   * Mocks: none
   * Data: one locked SPEC mutation
   */
  it("tst_scripts_planctl_004 makes a raw approved SPEC edit visibly fail verification", () => {
    const fixture = fixtureRepository();
    try {
      expect(run(fixture.root, "init", fixture.plan, "--title", "Fixture plan").status).toBe(0);
      expect(run(fixture.root, "set-spec", fixture.plan, "--from", fixture.spec).status).toBe(0);
      git(fixture.root, "commit", "-qam", "docs: draft plan");
      expect(run(fixture.root, "approve-spec", fixture.plan, "--owner-word", "yes").status).toBe(0);
      expect(run(fixture.root, "put-delivery", fixture.plan, "--from", fixture.delivery).status).toBe(0);
      expect(run(fixture.root, "put-stage", fixture.plan, "--from", fixture.stage).status).toBe(0);
      expect(run(fixture.root, "approve-plan", fixture.plan, "--owner-word", "yes").status).toBe(0);

      writeFileSync(fixture.plan, readFileSync(fixture.plan, "utf8").replace("Ship one observable result.", "Ship something else."));
      const verification = run(fixture.root, "verify", fixture.plan);

      expect(verification.status).toBe(1);
      expect(verification.stderr).toContain("SPEC lock does not match");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  /*
   * @test-id: tst_scripts_planctl_005
   * @scenario: scn_plan_control_005
   * @covers: scripts/planctl.ts::start-task,complete-task
   * @deterministic: yes
   * @fixtures: temporary approved plan and Git-owned Task start receipt
   * Test environment: isolated local Git repository
   * Clients: CLI
   * Mocks: none
   * Data: one approved Task and its result receipt
   */
  it("tst_scripts_planctl_005 starts from the Markdown contract and consumes the timer on completion", () => {
    const fixture = fixtureRepository();
    try {
      const expandedStage: StageInput = {
        ...STAGE,
        writes: ["scripts/example.ts", "scripts/second.ts"],
        predictedActiveMinutes: 20,
        predictedCredits: 4,
        tasks: [
          ...STAGE.tasks,
          {
            id: "PLANCTL_002",
            story: "produce a second observable result from the approved Task contract",
            writes: ["scripts/second.ts"],
            predictedActiveMinutes: 8,
            predictedCredits: 1,
            how: "add scripts/second.ts without changing the first Task scope",
            red: "bun run agent:test:backend -- test/planctl.test.ts -t tst_scripts_planctl_005",
          },
        ],
      };
      writeFileSync(fixture.stage, `${JSON.stringify(expandedStage)}\n`);
      expect(run(fixture.root, "init", fixture.plan, "--title", "Fixture plan").status).toBe(0);
      expect(run(fixture.root, "set-spec", fixture.plan, "--from", fixture.spec).status).toBe(0);
      git(fixture.root, "commit", "-qam", "docs: draft plan");
      expect(run(fixture.root, "approve-spec", fixture.plan, "--owner-word", "yes").status).toBe(0);
      expect(run(fixture.root, "put-delivery", fixture.plan, "--from", fixture.delivery).status).toBe(0);
      expect(run(fixture.root, "put-stage", fixture.plan, "--from", fixture.stage).status).toBe(0);
      expect(run(fixture.root, "approve-plan", fixture.plan, "--owner-word", "yes").status).toBe(0);
      git(fixture.root, "commit", "-qm", "docs: approve plan");
      const approvedCommit = git(fixture.root, "rev-parse", "HEAD");
      expect(run(fixture.root, "clear-transaction", fixture.plan, "--commit", approvedCommit).status).toBe(0);

      const started = run(fixture.root, "start-task", fixture.plan, "--task", "PLANCTL_001");
      expect(started.status, `${started.stdout}\n${started.stderr}`).toBe(0);
      expect(started.stdout).toContain("Task PLANCTL_001 STARTED");
      expect(started.stdout).toContain("Source: docs/plans/fixture.md");
      expect(started.stdout).toContain("Writes: scripts/example.ts");
      expect(started.stdout).toContain("RED: bun run agent:test:backend -- test/planctl.test.ts");
      const startedAt = started.stdout.match(/^Started: (.+)$/m)?.[1];
      expect(startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      mkdirSync(join(fixture.root, "scripts"), { recursive: true });
      writeFileSync(join(fixture.root, "scripts", "example.ts"), "export const example = true;\n");
      git(fixture.root, "add", "scripts/example.ts");
      git(fixture.root, "commit", "-qm", "feat: implement example");
      const workCommit = git(fixture.root, "rev-parse", "HEAD");
      const receiptPath = join(fixture.root, "result.json");
      const receipt: StageResultReceipt = {
        version: 1,
        plan: "docs/plans/fixture.md",
        deliveryId: "D1",
        stageId: "D1-S1",
        taskIds: ["PLANCTL_001"],
        commit: workCommit,
        startedAt: startedAt ?? "missing",
        endedAt: startedAt ?? "missing",
        activeMinutes: 0,
        elapsedMinutes: 0,
        usage: { kind: "unavailable", reason: "test fixture" },
        paths: ["scripts/example.ts"],
        tests: [{ id: "tst_scripts_planctl_005", command: "true" }],
        result: "Canonical Task execution started and completed through planctl.",
        deviations: [],
        tempRoots: [{ path: STAGE.tempRoot, state: "absent" }],
      };
      writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`);

      const completed = run(fixture.root, "complete-task", fixture.plan, "--from", receiptPath);
      expect(completed.status, `${completed.stdout}\n${completed.stderr}`).toBe(0);
      expect(readFileSync(fixture.plan, "utf8")).toContain("- [x] PLANCTL_001");

      const next = run(fixture.root, "start-task", fixture.plan, "--task", "PLANCTL_002");
      expect(next.status, `${next.stdout}\n${next.stderr}`).toBe(0);
      expect(next.stdout).toContain("Task PLANCTL_002 STARTED");

      const secondCompletion = run(fixture.root, "complete-task", fixture.plan, "--from", receiptPath);
      expect(secondCompletion.status).toBe(1);
      expect(secondCompletion.stderr).toContain("run planctl start-task");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  /*
   * @test-id: tst_scripts_planctl_006
   * @scenario: scn_plan_control_006
   * @covers: scripts/planctl.ts::put-stage,remove-stage
   * @deterministic: yes
   * @fixtures: temporary SPEC_LOCKED plan and replacement Stage JSON
   * Test environment: isolated local Git repository
   * Clients: CLI
   * Mocks: none
   * Data: one Stage replaced in place, removed, restored and approved
   */
  it("tst_scripts_planctl_006 freely replaces and removes a draft Stage but preserves the approved lock", () => {
    const fixture = fixtureRepository();
    try {
      expect(run(fixture.root, "init", fixture.plan, "--title", "Fixture plan").status).toBe(0);
      expect(run(fixture.root, "set-spec", fixture.plan, "--from", fixture.spec).status).toBe(0);
      git(fixture.root, "commit", "-qam", "docs: draft plan");
      expect(run(fixture.root, "approve-spec", fixture.plan, "--owner-word", "yes").status).toBe(0);
      expect(run(fixture.root, "put-delivery", fixture.plan, "--from", fixture.delivery).status).toBe(0);
      expect(run(fixture.root, "put-stage", fixture.plan, "--from", fixture.stage).status).toBe(0);

      const replacement: StageInput = {
        ...STAGE,
        title: "Replacement ownership",
        tasks: [{ ...STAGE.tasks[0], story: "replace the draft Stage with one observable canonical writer outcome" }],
      };
      writeFileSync(fixture.stage, `${JSON.stringify(replacement)}\n`);
      const replaced = run(fixture.root, "put-stage", fixture.plan, "--from", fixture.stage);
      expect(replaced.status, `${replaced.stdout}\n${replaced.stderr}`).toBe(0);
      const replacedBody = readFileSync(fixture.plan, "utf8");
      expect(replacedBody).toContain("#### Stage D1-S1 — Replacement ownership");
      expect(replacedBody).not.toContain("#### Stage D1-S1 — Canonical ownership");
      expect(replacedBody.match(/<!-- plan:stage:D1-S1:start -->/g)).toHaveLength(1);

      const replacementDelivery: DeliveryInput = { ...DELIVERY, title: "Replacement foundation" };
      writeFileSync(fixture.delivery, `${JSON.stringify(replacementDelivery)}\n`);
      const deliveryReplaced = run(fixture.root, "put-delivery", fixture.plan, "--from", fixture.delivery);
      expect(deliveryReplaced.status, `${deliveryReplaced.stdout}\n${deliveryReplaced.stderr}`).toBe(0);
      const deliveryBody = readFileSync(fixture.plan, "utf8");
      expect(deliveryBody).toContain("### PR Delivery D1 — Replacement foundation");
      expect(deliveryBody).toContain("#### Stage D1-S1 — Replacement ownership");

      const removed = run(fixture.root, "remove-stage", fixture.plan, "--stage", "D1-S1");
      expect(removed.status, `${removed.stdout}\n${removed.stderr}`).toBe(0);
      expect(readFileSync(fixture.plan, "utf8")).not.toContain("<!-- plan:stage:D1-S1:start -->");

      expect(run(fixture.root, "put-stage", fixture.plan, "--from", fixture.stage).status).toBe(0);
      expect(run(fixture.root, "approve-plan", fixture.plan, "--owner-word", "yes").status).toBe(0);
      const approvedReplace = run(fixture.root, "put-stage", fixture.plan, "--from", fixture.stage);
      const approvedRemove = run(fixture.root, "remove-stage", fixture.plan, "--stage", "D1-S1");
      expect(approvedReplace.status).toBe(1);
      expect(approvedReplace.stderr).toContain("requires SPEC_LOCKED");
      expect(approvedRemove.status).toBe(1);
      expect(approvedRemove.stderr).toContain("requires SPEC_LOCKED");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
