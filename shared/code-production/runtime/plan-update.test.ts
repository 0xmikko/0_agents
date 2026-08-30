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
} from "./plan-update";
import { protocolLockViolations } from "./plan-gate";

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
    verifyActiveMinutes: 2,
    verifyCredits: 1,
    tasks: [{
      id: `${id}-T1`,
      story: `produce one observable ${id} behavior in ${writes[0]}`,
      writes,
      predictedActiveMinutes: 8,
      predictedCredits: 1,
      how: `change ${writes.join(" and ")} so the declared observable behavior is implemented`,
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
  // @covers: scripts/plan-update.ts::lockPlanSpec,approvePlan
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
  // @covers: scripts/plan-update.ts::targeted plan mutations
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
    const writer = join(import.meta.dir, "plan-update.ts");
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
  // @covers: scripts/plan-update.ts::recordStageResult
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
    expect(accepted).toContain("- [x] D1-S1-T1 — produce one observable D1-S1 behavior in scripts/base.ts");
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
  // @covers: scripts/plan-update.ts::applyUnattendedAmendment
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
  // @covers: scripts/plan-update.ts::approvePlan
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
  // @covers: scripts/plan-update.ts::putStage Task contract validation
  // @deterministic: yes
  // @invariant: a Stage cannot lock vague, unscoped, unestimated or untestable Tasks.
  it("tst_scripts_planupdate_006 refuses low-information Task contracts", () => {
    const locked = putDelivery(lockPlanSpec(draft(), "spec").body, delivery()).body;
    const valid = stage("D1-S1", ["scripts/base.ts"]);
    const invalid: ReadonlyArray<readonly [StageInput, RegExp]> = [
      [{ ...valid, tasks: [] }, /at least one Task/i],
      [{ ...valid, tasks: [{ ...valid.tasks[0], story: "Refactor scheduler" }] }, /observable outcome/i],
      [{ ...valid, tasks: [{ ...valid.tasks[0], how: "" }] }, /Task how must not be empty/i],
      [{ ...valid, tasks: [{ ...valid.tasks[0], red: "echo done" }] }, /RED.*agent:test/i],
      [{ ...valid, tasks: [{ ...valid.tasks[0], red: "bun test test/plan-update.test.ts" }] }, /RED.*agent:test/i],
      [{ ...valid, tempRoot: "/tmp" }, /tempRoot/i],
      [{ ...valid, tasks: [{ ...valid.tasks[0], writes: ["scripts/foreign.ts"] }] }, /outside Stage writes/i],
      [{ ...valid, tasks: [{ ...valid.tasks[0], predictedActiveMinutes: 11 }] }, /must equal task sum plus verification/i],
      [{ ...valid, criteria: [] }, /acceptance criteria/i],
    ];

    for (const [candidate, refusal] of invalid) {
      expect(() => putStage(locked, candidate)).toThrow(refusal);
    }
  });

  // @test-id: tst_scripts_planupdate_007
  // @scenario: scn_plan_control_004
  // @covers: scripts/plan-update.ts::putStage Task execution scope validation
  // @deterministic: yes
  // @invariant: a Task story names every exact file instead of referring to unnamed code.
  it("tst_scripts_planupdate_007 refuses a Task story that points to unnamed files", () => {
    const locked = putDelivery(lockPlanSpec(draft(), "spec").body, delivery()).body;
    const candidate = stage("D1-S1", ["scripts/base.ts", "test/base.test.ts"]);

    expect(() => putStage(locked, {
      ...candidate,
      tasks: [{
        ...candidate.tasks[0],
        story: "extend the parser and refuse overlap across both touched modules",
      }],
    })).toThrow(/story must name every write path/i);
  });
});

describe("two-line task contract", () => {
  // @test-id: tst_scripts_planupdate_008
  // @scenario: scn_codeprod_001
  // @covers: scripts/plan-update.ts::putStage
  // @deterministic: yes
  // @invariant: a rendered Task is two lines — the story and a hidden
  // task-meta comment; Writes/Predict/How/RED never render visibly.
  it("tst_scripts_planupdate_008 renders a task as story plus hidden metadata", () => {
    let body = lockPlanSpec(draft(), "spec").body;
    body = putDelivery(body, delivery()).body;
    body = putStage(body, {
      ...stage("D1-S1", ["scripts/base.ts"]),
      tasks: [{
        id: "D1-S1-T1",
        story: "Expose the base contract from scripts/base.ts as one callable entrypoint.",
        writes: ["scripts/base.ts"],
        predictedActiveMinutes: 8,
        predictedCredits: 1,
        how: "one export statement",
        red: "bun run agent:test:backend -- test/plan-update.test.ts",
      }],
    }).body;
    expect(body).toContain("<!-- plan:task-meta:");
    const tasksBlock = body.slice(body.indexOf("##### Tasks"), body.indexOf("##### Acceptance criteria"));
    expect(tasksBlock).not.toMatch(/^\s+Writes:/m);
    expect(tasksBlock).not.toMatch(/^\s+How:/m);
    expect(tasksBlock).not.toMatch(/^\s+RED:/m);
    expect(tasksBlock).not.toMatch(/^\s+Predict:/m);
    // and the metadata survives a parse round trip: replacing the stage works
    const replaced = putStage(body, {
      ...stage("D1-S1", ["scripts/base.ts"]),
      tasks: [{
        id: "D1-S1-T1",
        story: "Expose the base contract from scripts/base.ts as one callable entrypoint.",
        writes: ["scripts/base.ts"],
        predictedActiveMinutes: 8,
        predictedCredits: 1,
        how: "one export statement",
        red: "bun run agent:test:backend -- test/plan-update.test.ts",
      }],
    });
    expect(replaced.body).toContain("Expose the base contract");
  });

  // @test-id: tst_scripts_planupdate_009
  // @scenario: scn_codeprod_001
  // @covers: scripts/plan-update.ts::putStage
  // @deterministic: yes
  // @invariant: the story itself names every write path (full path or its
  // basename); the old how-must-name-paths rule is gone.
  it("tst_scripts_planupdate_009 requires paths in the story, not in how", () => {
    let body = lockPlanSpec(draft(), "spec").body;
    body = putDelivery(body, delivery()).body;
    expect(() => putStage(body, {
      ...stage("D1-S1", ["scripts/base.ts"]),
      tasks: [{
        id: "D1-S1-T1",
        story: "Expose the base contract as one callable entrypoint somewhere sensible.",
        writes: ["scripts/base.ts"],
        predictedActiveMinutes: 8,
        predictedCredits: 1,
        how: "touch scripts/base.ts",
        red: "bun run agent:test:backend -- test/plan-update.test.ts",
      }],
    })).toThrow(/story must name/i);
  });

  // @test-id: tst_scripts_planupdate_010
  // @scenario: scn_codeprod_001
  // @covers: scripts/plan-update.ts::putStage
  // @deterministic: yes
  // @invariant: a story leaning on unresolved references (a colleague, a
  // rename map, "the new files") is rejected until the reference is unfolded.
  it("tst_scripts_planupdate_010 rejects unresolved references in a story", () => {
    let body = lockPlanSpec(draft(), "spec").body;
    body = putDelivery(body, delivery()).body;
    for (const story of [
      "Finish the colleague's rewire of scripts/base.ts to the intended state.",
      "Apply the rename map to scripts/base.ts as discussed in the audit.",
    ]) {
      expect(() => putStage(body, {
        ...stage("D1-S1", ["scripts/base.ts"]),
        tasks: [{
          id: "D1-S1-T1",
          story,
          writes: ["scripts/base.ts"],
          predictedActiveMinutes: 8,
          predictedCredits: 1,
          how: "mechanical",
          red: "bun run agent:test:backend -- test/plan-update.test.ts",
        }],
      })).toThrow(/unresolved reference/i);
    }
  });

  // @test-id: tst_scripts_planupdate_011
  // @scenario: scn_codeprod_001
  // @covers: scripts/plan-update.ts::putStage
  // @deterministic: yes
  // @invariant: plans rendered before this contract (visible Writes/How/RED
  // lines) still parse, so committed plans keep working.
  it("tst_scripts_planupdate_011 still parses the legacy five-line task format", () => {
    let body = lockPlanSpec(draft(), "spec").body;
    body = putDelivery(body, delivery()).body;
    body = putStage(body, stage("D1-S1", ["scripts/base.ts"])).body;
    // hand-convert the rendered stage into the legacy five-line format
    const legacyTask = [
      "- [ ] D1-S1-T1 — produce one observable D1-S1 behavior from scripts/base.ts",
      "      Writes: `scripts/base.ts`.",
      "      Predict: 8 active min / 1 credits.",
      "      How: change scripts/base.ts so the declared observable behavior is implemented",
      "      RED: `bun run agent:test:backend -- test/plan-update.test.ts`",
    ].join("\n");
    const modernTask = new RegExp("- \\[ \\] D1-S1-T1 — [^\\n]+\\n<!-- plan:task-meta:[^\\n]+ -->");
    expect(modernTask.test(body)).toBe(true);
    const legacyBody = body.replace(modernTask, legacyTask);
    // parsing happens on the next mutation: adding a second stage must work
    const next = putStage(legacyBody, stage("D1-S2", ["scripts/a.ts"], []));
    expect(next.body).toContain("D1-S2");
  });
});

describe("stage estimate = tasks + verification", () => {
  // @test-id: tst_scripts_planupdate_012
  // @scenario: scn_codeprod_001
  // @covers: scripts/plan-update.ts::putStage
  // @deterministic: yes
  // @invariant: a Stage forecast is derived, not invented — it must equal the
  // task sum plus an explicit verification share, and the share renders.
  it("tst_scripts_planupdate_012 derives the stage forecast from tasks plus verification", () => {
    let body = lockPlanSpec(draft(), "spec").body;
    body = putDelivery(body, delivery()).body;
    const base = stage("D1-S1", ["scripts/base.ts"]);
    // mismatched: tasks sum to 8 + verification 2 = 10, but stage claims 12
    expect(() => putStage(body, {
      ...base,
      predictedActiveMinutes: 12,
      verifyActiveMinutes: 2,
      verifyCredits: 1,
    })).toThrow(/must equal task sum plus verification/i);
    // matched: renders the verification share and round-trips
    const put = putStage(body, {
      ...base,
      predictedActiveMinutes: 10,
      predictedCredits: 2,
      verifyActiveMinutes: 2,
      verifyCredits: 1,
    });
    expect(put.body).toContain("Of which verification: 2 active min / 1 credits.");
    const again = putStage(put.body, {
      ...stage("D1-S2", ["scripts/a.ts"], []),
      predictedActiveMinutes: 10,
      predictedCredits: 2,
      verifyActiveMinutes: 2,
      verifyCredits: 1,
    });
    expect(again.body).toContain("D1-S2");
  });
});
