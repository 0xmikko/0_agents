import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

import {
  approvePlan,
  applyUnattendedAmendment,
  lockPlanSpec,
  putDelivery,
  putStage,
  recordStageResult,
  type DeliveryInput,
  type StageInput,
  type StageResultReceipt,
} from "../src/core/plan-update";
import { protocolLockViolations } from "../src/core/plan-gate";

const SPEC_START = "<!-- plan:spec:start -->";
const SPEC_END = "<!-- plan:spec:end -->";
const IMPLEMENTATION_START = "<!-- plan:implementation:start -->";
const IMPLEMENTATION_END = "<!-- plan:implementation:end -->";
const EXECUTION_START = "<!-- plan:execution:start -->";
const EXECUTION_END = "<!-- plan:execution:end -->";

function draft(): string {
  return [
    "# Fixture plan",
    "",
    "Status: SPEC_DRAFT",
    "Spec lock: unlocked",
    "Implementation lock: unlocked",
    "Active Delivery: none",
    "Unattended decisions: allowed",
    "",
    SPEC_START,
    "## The Goal",
    "",
    "Ship one observable result.",
    "",
    "## The target",
    "",
    "One active Delivery.",
    SPEC_END,
    "",
    IMPLEMENTATION_START,
    "## Implementation contract",
    IMPLEMENTATION_END,
    "",
    EXECUTION_START,
    "## Execution log",
    EXECUTION_END,
    "",
  ].join("\n");
}

function delivery(active = true): DeliveryInput {
  return {
    id: "D1",
    title: "writer",
    branch: "feat/writer",
    depends: [],
    gate: ["scripts"],
    active,
    stageGraph: "D1-S1 -> (D1-S2 || D1-S3) -> D1-S4",
  };
}

function stage(id: string, writes: readonly string[], parallelWith: readonly string[] = []): StageInput {
  return {
    id,
    deliveryId: "D1",
    title: id,
    owner: "child lane",
    profile: "fast",
    depends: id === "D1-S1" ? [] : ["D1-S1"],
    parallelWith,
    writes,
    tempRoot: `.tmp/code-production/fixture/${id}`,
    predictedActiveMinutes: 10,
    predictedCredits: 2,
    tasks: [{
      id: `${id}-T1`,
      story: `produce one observable ${id} behavior from the declared contract`,
      writes,
      predictedActiveMinutes: 8,
      predictedCredits: 1,
      how: `change ${writes[0]} through the existing implementation owner`,
      red: "bun run agent:test:backend -- test/plan-update.test.ts",
    }],
    criteria: ["`bun test` exits 0 — behavior is proven", "Commit"],
  };
}

function approvedWithStages(): string {
  let body = lockPlanSpec(draft(), "spec").body;
  body = putDelivery(body, delivery()).body;
  body = putStage(body, stage("D1-S1", ["scripts/base.ts"])).body;
  body = putStage(body, stage("D1-S2", ["scripts/a.ts"], ["D1-S3"])).body;
  body = putStage(body, stage("D1-S3", ["scripts/b.ts"], ["D1-S2"])).body;
  body = putStage(body, {
    ...stage("D1-S4", ["docs/plans/fixture.md"]),
    profile: "strong",
    owner: "integrator",
    depends: ["D1-S2", "D1-S3"],
    parallelWith: [],
  }).body;
  return approvePlan(body, "approve").body;
}

describe("plan-update", () => {
  // @test-id: tst_scripts_planupdate_001
  // @scenario: scn_codeprod_001
  // @covers: planctl/src/core/plan-update.ts::lockPlanSpec,approvePlan
  // @deterministic: yes
  // @invariant: two owner receipts freeze the SPEC and implementation bytes.
  it("tst_scripts_planupdate_001 locks SPEC, builds one Delivery, then locks implementation", () => {
    const original = draft();
    const locked = lockPlanSpec(original, "spec");
    expect(locked.body).toContain("Status: SPEC_LOCKED");
    expect(locked.body).toContain(`Spec lock: sha256:${locked.specHash} owner:spec`);
    expect(locked.body.slice(locked.body.indexOf(SPEC_START), locked.body.indexOf(SPEC_END))).toBe(
      original.slice(original.indexOf(SPEC_START), original.indexOf(SPEC_END)),
    );

    const complete = approvedWithStages();
    expect(complete).toContain("Status: APPROVED");
    expect(complete).toMatch(/Implementation lock: sha256:[0-9a-f]{64} owner:approve/);
    expect(complete.match(/<!-- plan:delivery:D1:start -->/g)).toHaveLength(1);

    const second = () => putDelivery(lockPlanSpec(draft(), "spec").body, delivery()).body
      && putDelivery(putDelivery(lockPlanSpec(draft(), "spec").body, delivery()).body, {
        ...delivery(), id: "D2", active: true,
      });
    expect(second).toThrow(/one active Delivery/i);
  });

  // @test-id: tst_scripts_planupdate_002
  // @scenario: scn_codeprod_001
  // @covers: planctl/src/core/plan-update.ts::targeted plan mutations
  // @deterministic: yes
  // @invariant: operations preserve every byte outside their target range.
  it("tst_scripts_planupdate_002 changes only the addressed implementation range", () => {
    const locked = lockPlanSpec(draft(), "spec").body;
    const changed = putDelivery(locked, delivery()).body;
    const beforeSpec = locked.slice(locked.indexOf(SPEC_START), locked.indexOf(SPEC_END) + SPEC_END.length);
    const afterSpec = changed.slice(changed.indexOf(SPEC_START), changed.indexOf(SPEC_END) + SPEC_END.length);
    expect(afterSpec).toBe(beforeSpec);
    expect(changed.slice(changed.indexOf(EXECUTION_START), changed.indexOf(EXECUTION_END))).toContain(
      "put-delivery D1",
    );

    const root = mkdtempSync(join(tmpdir(), "portable-plan-update-journal-"));
    const plan = join(root, "plan.md");
    const deliveryJson = join(root, "delivery.json");
    const writer = join(import.meta.dir, "../src/core/plan-update.ts");
    const git = (...args: readonly string[]): string =>
      execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
    try {
      git("init", "-q");
      git("config", "user.email", "t@t");
      git("config", "user.name", "t");
      writeFileSync(plan, draft());
      writeFileSync(deliveryJson, `${JSON.stringify(delivery())}\n`);
      git("add", "plan.md");
      git("commit", "-qm", "draft");

      execFileSync("bun", [writer, "plan.md", "lock-spec", "--owner-word", "spec"], { cwd: root });
      execFileSync("bun", [writer, "plan.md", "put-delivery", "--from", deliveryJson], { cwd: root });
      execFileSync("bun", [writer, "plan.md", "verify-staged"], { cwd: root });

      const legal = readFileSync(plan, "utf8");
      writeFileSync(plan, legal.replace("Ship one observable result.", "Ship a silently rewritten result."));
      git("add", "plan.md");
      const refused = spawnSync("bun", [writer, "plan.md", "verify-staged"], { cwd: root, encoding: "utf8" });
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain("staged plan differs from journal candidate");

      writeFileSync(plan, legal);
      git("add", "plan.md");
      execFileSync("bun", [writer, "plan.md", "verify-staged"], { cwd: root });
      git("commit", "-qm", "legal mutation");
      execFileSync("bun", [writer, "plan.md", "clear-spent", "--commit", "HEAD"], { cwd: root });
      const journal = git("rev-parse", "--path-format=absolute", "--git-path", "plan-update-journal.json");
      expect(existsSync(journal)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // @test-id: tst_scripts_planupdate_003
  // @scenario: scn_codeprod_002
  // @covers: planctl/src/core/plan-update.ts::recordStageResult
  // @deterministic: yes
  // @invariant: results are append-only and a Stage cannot close over temp leftovers.
  it("tst_scripts_planupdate_003 records an ancestral Stage result and refuses temp leftovers", () => {
    const root = join(tmpdir(), `portable-plan-update-${process.pid}`);
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });
    const receipt: StageResultReceipt = {
      version: 1,
      plan: "docs/plans/fixture.md",
      deliveryId: "D1",
      stageId: "D1-S1",
      taskIds: ["D1-S1-T1"],
      commit: "a".repeat(40),
      startedAt: "2026-08-27T09:00:00Z",
      endedAt: "2026-08-27T09:10:00Z",
      activeMinutes: 10,
      elapsedMinutes: 10,
      usage: { kind: "unavailable", reason: "runner omitted usage" },
      paths: ["scripts/base.ts"],
      tests: [{ id: "tst_scripts_planupdate_003", command: "bun test" }],
      result: "writer foundation works",
      deviations: [],
      tempRoots: [{ path: ".tmp/code-production/fixture/D1-S1", state: "absent" }],
    };

    const accepted = recordStageResult(approvedWithStages(), receipt, {
      commitIsAncestor: () => true,
      commitPaths: () => [...receipt.paths, receipt.plan],
      pathExists: () => false,
    }).body;
    expect(accepted).toContain(`| D1-S1-T1 | ${receipt.commit}`);
    expect(accepted).toContain("- [x] D1-S1-T1 — produce one observable D1-S1 behavior from the declared contract");
    expect(protocolLockViolations(accepted)).toEqual([]);

    expect(() => recordStageResult(approvedWithStages(), receipt, {
      commitIsAncestor: () => true,
      commitPaths: () => [...receipt.paths, receipt.plan, "scripts/foreign.ts"],
      pathExists: () => false,
    })).toThrow(/paths differ from commit/i);

    expect(() => recordStageResult(approvedWithStages(), {
      ...receipt,
      tempRoots: [{ path: ".tmp/code-production/fixture/D1-S1", state: "absent" }],
    }, { commitIsAncestor: () => true, commitPaths: () => receipt.paths, pathExists: () => true })).toThrow(/temp root still exists/i);
    rmSync(root, { recursive: true, force: true });
  });

  // @test-id: tst_scripts_planupdate_004
  // @scenario: scn_codeprod_003
  // @covers: planctl/src/core/plan-update.ts::applyUnattendedAmendment
  // @deterministic: yes
  // @invariant: a complete reversible decision keeps execution live without owner impersonation.
  it("tst_scripts_planupdate_004 applies a complete unattended decision and marks owner review pending", () => {
    const body = approvedWithStages();
    const result = applyUnattendedAmendment(body, {
      version: 1,
      decidedAt: "2026-08-27T23:00:00Z",
      goalPreserved: "one observable result still ships",
      decision: "serialize D1-S2 before D1-S3",
      alternatives: ["wait eight hours"],
      whyContinueNow: "the change is bounded and reversible",
      affectedScope: ["implementation"],
      rollbackBase: "b".repeat(40),
      verification: ["bun run agent:test:backend -- test/plan-update.test.ts"],
    }, { section: "implementation", find: "D1-S2 || D1-S3", replace: "D1-S2 -> D1-S3" });
    expect(result.body).toContain("owner_review_pending");
    expect(result.body).toContain("Status: APPROVED");
    expect(result.body).toContain("D1-S2 -> D1-S3");
  });

  // @test-id: tst_scripts_planupdate_005
  // @scenario: scn_codeprod_002
  // @covers: planctl/src/core/plan-update.ts::approvePlan
  // @deterministic: yes
  // @invariant: only explicit disjoint Stage writes may run in parallel.
  it("tst_scripts_planupdate_005 refuses parallel Stages with overlapping writes", () => {
    let body = lockPlanSpec(draft(), "spec").body;
    body = putDelivery(body, delivery()).body;
    body = putStage(body, stage("D1-S1", ["scripts/base.ts"])).body;
    body = putStage(body, stage("D1-S2", ["scripts/shared.ts"], ["D1-S3"])).body;
    expect(() => putStage(body, stage("D1-S3", ["scripts/shared.ts"], ["D1-S2"]))).toThrow(
      /parallel write overlap/i,
    );
  });

  // @test-id: tst_scripts_planupdate_006
  // @scenario: scn_plan_control_004
  // @covers: planctl/src/core/plan-update.ts::putStage Task contract validation
  // @deterministic: yes
  // @invariant: a Stage cannot lock vague, unscoped, unestimated or untestable Tasks.
  it("tst_scripts_planupdate_006 refuses low-information Task contracts", () => {
    const locked = putDelivery(lockPlanSpec(draft(), "spec").body, delivery()).body;
    const valid = stage("D1-S1", ["scripts/base.ts"]);
    const task = valid.tasks[0];
    if (task === undefined) throw new Error("valid Stage fixture must have one Task");
    const invalid: ReadonlyArray<readonly [StageInput, RegExp]> = [
      [{ ...valid, tasks: [] }, /at least one Task/i],
      [{ ...valid, tasks: [{ ...task, story: "Refactor scheduler" }] }, /observable outcome/i],
      [{ ...valid, tasks: [{ ...task, how: "" }] }, /Task how must not be empty/i],
      [{ ...valid, tasks: [{ ...task, red: "echo done" }] }, /RED.*agent:test/i],
      [{ ...valid, tasks: [{ ...task, red: "bun test test/plan-update.test.ts" }] }, /RED.*agent:test/i],
      [{ ...valid, tempRoot: "/tmp" }, /tempRoot/i],
      [{ ...valid, tasks: [{ ...task, writes: ["scripts/foreign.ts"] }] }, /outside Stage writes/i],
      [{ ...valid, tasks: [{ ...task, predictedActiveMinutes: 11 }] }, /Task forecasts exceed Stage forecast/i],
      [{ ...valid, criteria: [] }, /acceptance criteria/i],
    ];

    for (const [candidate, refusal] of invalid) {
      expect(() => putStage(locked, candidate)).toThrow(refusal);
    }
  });
});
