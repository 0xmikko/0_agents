import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

import {
  approvePlan,
  applyOwnerAmendment,
  closePlanStage,
  completeTask,
  taskRunPath,
  applyUnattendedAmendment,
  lockPlanSpec,
  mutatePlanFile,
  putDelivery,
  putStage,
  recordStageApproval,
  recordStageResult,
  stageApproved,
  stageInputs,
  stageResultCommitPaths,
  type DeliveryInput,
  type StageInput,
  type StageResultReceipt,
} from "../src/core/plan-update";
import { protocolLockViolations } from "../src/core/plan-gate";
import { decodeTaskRun } from "../src/core/task-run";

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
    readFileSync(join(import.meta.dir, "fixtures/plan-lint.md"), "utf8").replace("Reduce invalid changes from three per release to zero.", "Ship one observable result."),
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
    predictedExternalWaitMinutes: 15,
    description: "What changed for people. The writer says what it wrote.\n\nWhat changed in the code. One writer, four Stages.\n\nHow it was proven. The fixture suite.",
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
    description: `What this Stage solves. ${id} produces one observable behavior.\n\nWhat is built. ${writes[0]} implements it.\n\nHow it is proven. The fixture suite.\n\nCommit. feat(fixture): ${id}`,
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

function approvedWithStages(firstStageWrites: readonly string[] = ["scripts/base.ts"]): string {
  let body = lockPlanSpec(draft(), "spec").body;
  body = putDelivery(body, delivery()).body;
  body = putStage(body, { ...stage("D1-S1", firstStageWrites), tasks: stage("D1-S1", ["scripts/base.ts"]).tasks }).body;
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
    expect(changed.slice(changed.indexOf(EXECUTION_START), changed.indexOf(EXECUTION_END))).toBe(
      locked.slice(locked.indexOf(EXECUTION_START), locked.indexOf(EXECUTION_END)),
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

  // @test-id: tst_scripts_planupdate_004
  // @scenario: scn_codeprod_002
  // @covers: planctl/src/core/plan-update.ts::verifyStagedPlan
  // @deterministic: yes
  // @invariant: a merge that carries an approved plan is committable — the
  // journal proves local authorship, and a merge authored nothing here.
  it("tst_scripts_planupdate_004 verify-staged stands aside for what a merge carries, not for a hand edit", () => {
    const root = mkdtempSync(join(tmpdir(), "portable-plan-update-merge-"));
    const plan = join(root, "plan.md");
    const writer = join(import.meta.dir, "../src/core/plan-update.ts");
    const git = (...args: readonly string[]): string =>
      execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
    try {
      git("init", "-q", "-b", "main");
      git("config", "user.email", "t@t");
      git("config", "user.name", "t");
      // A plan that is locked on both branches, and a second file each side
      // changes so the merge is a real one.
      writeFileSync(plan, lockPlanSpec(draft(), "spec").body);
      writeFileSync(join(root, "other.txt"), "base\n");
      git("add", "plan.md", "other.txt");
      git("commit", "-qm", "base");

      git("checkout", "-q", "-b", "side");
      writeFileSync(join(root, "other.txt"), "side\n");
      writeFileSync(plan, lockPlanSpec(draft(), "spec").body.replace("# Fixture plan", "# Fixture plan on the side"));
      git("add", "plan.md", "other.txt");
      git("commit", "-qm", "side");

      git("checkout", "-q", "main");
      writeFileSync(join(root, "mine.txt"), "mine\n");
      git("add", "mine.txt");
      git("commit", "-qm", "mine");

      // The merge brings a locked plan this worktree never mutated, so there
      // is no journal and there cannot be one.
      const merge = spawnSync("git", ["-C", root, "merge", "--no-commit", "--no-ff", "side"], { encoding: "utf8" });
      expect(merge.status).toBe(0);
      expect(existsSync(git("rev-parse", "--path-format=absolute", "--git-path", "plan-update-journal.json"))).toBe(false);

      const staged = spawnSync("bun", [writer, "plan.md", "verify-staged"], { cwd: root, encoding: "utf8" });
      expect(staged.stderr).not.toContain("no journal");
      expect(staged.status).toBe(0);

      // The exemption is for what the merge carries and nothing else: a hand
      // edit while the merge is open needs its journal, or a merge would be a
      // hole through which any plan could be rewritten unjournalled.
      writeFileSync(plan, `${readFileSync(plan, "utf8")}a hand edit\n`);
      git("add", "plan.md");
      const edited = spawnSync("bun", [writer, "plan.md", "verify-staged"], { cwd: root, encoding: "utf8" });
      expect(edited.status).toBe(1);
      expect(edited.stderr).toContain("locked plan mutation has no journal");

      // Outside a merge the rule is unchanged: no journal, no commit.
      git("merge", "--abort");
      writeFileSync(plan, `${readFileSync(plan, "utf8")}\n`);
      git("add", "plan.md");
      const refused = spawnSync("bun", [writer, "plan.md", "verify-staged"], { cwd: root, encoding: "utf8" });
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain("locked plan mutation has no journal");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // @test-id: tst_scripts_planupdate_003
  // @scenario: scn_codeprod_002
  // @covers: planctl/src/core/plan-update.ts::recordStageResult
  // @deterministic: yes
  // @invariant: results are append-only and a Stage cannot close over temp leftovers.
  it("tst_scripts_planupdate_003 records an ancestral Stage result and reports temp leftovers", () => {
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

    const leftover = recordStageResult(approvedWithStages(), {
      ...receipt,
      tempRoots: [{ path: ".tmp/code-production/fixture/D1-S1", state: "absent" }],
    }, { commitIsAncestor: () => true, commitPaths: () => receipt.paths, pathExists: () => true }).body;
    expect(leftover).toContain("temp root present: .tmp/code-production/fixture/D1-S1");
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
      [{ ...valid, tasks: [{ ...task, predictedActiveMinutes: 11 }] }, /must equal task sum plus verification/i],
      [{ ...valid, criteria: [] }, /acceptance criteria/i],
    ];

    for (const [candidate, refusal] of invalid) {
      expect(() => putStage(locked, candidate)).toThrow(refusal);
    }
  });
});

describe("free tier: writes are the contract, not a fence", () => {
  // @test-id: tst_scripts_planupdate_015
  // @covers: planctl/src/core/plan-update.ts::putStage assertTaskContract
  // @deterministic: yes
  // @invariant: a Task lists its writes; the story need not repeat them and
  // there is no cap on how many files one change touches.
  it("tst_scripts_planupdate_015 accepts five writes and a story that names none of them", () => {
    let body = lockPlanSpec(draft(), "spec").body;
    body = putDelivery(body, delivery()).body;
    const writes = ["scripts/a.ts", "scripts/b.ts", "scripts/c.ts", "scripts/d.ts", "scripts/e.ts"];
    const accepted = putStage(body, {
      ...stage("D1-S1", writes),
      tasks: [{
        id: "D1-S1-T1",
        story: "Expose one callable entrypoint and refuse overlapping lanes at assignment.",
        writes,
        predictedActiveMinutes: 8,
        predictedCredits: 1,
        how: "one export statement per file",
        red: "bun run agent:test:backend -- test/plan-update.test.ts",
      }],
    }).body;
    const parsed = stageInputs(accepted).find((entry) => entry.id === "D1-S1");
    expect(parsed?.tasks[0]?.writes).toEqual(writes);
  });

  // @test-id: tst_scripts_planupdate_016
  // @covers: planctl/src/core/plan-update.ts::putStage write coverage
  // @deterministic: yes
  // @invariant: a write may be a directory or a glob; a Task write is accepted
  // when one Stage write covers it and refused otherwise.
  it("tst_scripts_planupdate_016 a directory or glob write covers the files beneath it", () => {
    let body = lockPlanSpec(draft(), "spec").body;
    body = putDelivery(body, delivery()).body;
    const candidate = stage("D1-S1", ["scripts/dev/", "test/**/*.test.ts"]);
    const task = candidate.tasks[0];
    if (task === undefined) throw new Error("candidate Stage must have one Task");
    const accepted = putStage(body, {
      ...candidate,
      tasks: [{ ...task, writes: ["scripts/dev/dev.ts", "test/dev/dev.test.ts"] }],
    }).body;
    expect(stageInputs(accepted).find((entry) => entry.id === "D1-S1")?.writes).toEqual(["scripts/dev/", "test/**/*.test.ts"]);
    expect(() => putStage(body, {
      ...candidate,
      tasks: [{ ...task, writes: ["scripts/db/postgres.ts"] }],
    })).toThrow(/outside Stage writes/i);
    // a directory write also collides with a parallel Stage's file beneath it
    const first = putStage(body, { ...candidate, parallelWith: ["D1-S2"] }).body;
    expect(() => putStage(first, {
      ...stage("D1-S2", ["scripts/dev/workspace.ts"], ["D1-S1"]),
    })).toThrow(/parallel write overlap/i);
  });

  // @test-id: tst_scripts_planupdate_017
  // @covers: planctl/src/core/plan-update.ts::recordStageResult
  // @deterministic: yes
  // @invariant: a commit that touches files beyond the declared writes is
  // recorded with those files named in its result row, never refused; the
  // receipt must still describe the commit it names.
  it("tst_scripts_planupdate_017 records files beyond the writes instead of refusing the result", () => {
    const receipt: StageResultReceipt = {
      version: 1,
      plan: "docs/plans/fixture.md",
      deliveryId: "D1",
      stageId: "D1-S1",
      taskIds: ["D1-S1-T1"],
      commit: "b".repeat(40),
      startedAt: "2026-09-17T09:00:00Z",
      endedAt: "2026-09-17T09:10:00Z",
      activeMinutes: 10,
      elapsedMinutes: 10,
      usage: { kind: "unavailable", reason: "runner omitted usage" },
      paths: ["scripts/base.ts", "test/base.test.ts", "scripts/helper.ts"],
      tests: [{ id: "tst_scripts_planupdate_017", command: "bun test" }],
      result: "writer foundation works",
      deviations: [],
      tempRoots: [{ path: ".tmp/code-production/fixture/D1-S1", state: "absent" }],
    };
    const accepted = recordStageResult(approvedWithStages(["scripts/"]), receipt, {
      commitIsAncestor: () => true,
      commitPaths: () => [...receipt.paths, receipt.plan],
      pathExists: () => false,
    }).body;
    const row = accepted.split("\n").find((line) => line.startsWith(`| D1-S1-T1 | ${receipt.commit}`));
    expect(row).toContain("beyond writes: scripts/helper.ts, test/base.test.ts");
    expect(protocolLockViolations(accepted)).toEqual([]);

    expect(() => recordStageResult(approvedWithStages(["scripts/"]), receipt, {
      commitIsAncestor: () => true,
      commitPaths: () => ["scripts/base.ts", receipt.plan],
      pathExists: () => false,
    })).toThrow(/paths differ from commit/i);
  });

  // @test-id: tst_scripts_planupdate_018
  // @covers: planctl/src/core/plan-update.ts::putStage predictions
  // @deterministic: yes
  // @invariant: minutes and credits are optional — zero is accepted and a
  // zero-minute story renders without a time suffix.
  it("tst_scripts_planupdate_018 accepts zero predictions and renders no time suffix", () => {
    let body = lockPlanSpec(draft(), "spec").body;
    body = putDelivery(body, delivery()).body;
    const candidate = stage("D1-S1", ["scripts/base.ts"]);
    const task = candidate.tasks[0];
    if (task === undefined) throw new Error("candidate Stage must have one Task");
    const rendered = putStage(body, {
      ...candidate,
      predictedActiveMinutes: 0,
      predictedCredits: 0,
      verifyActiveMinutes: 0,
      verifyCredits: 0,
      tasks: [{ ...task, predictedActiveMinutes: 0, predictedCredits: 0 }],
    }).body;
    expect(rendered).toContain("- [ ] D1-S1-T1 — produce one observable D1-S1 behavior in scripts/base.ts\n");
    expect(rendered).not.toContain("(0 min)");
    expect(stageInputs(rendered).find((entry) => entry.id === "D1-S1")?.predictedActiveMinutes).toBe(0);
  });
});

describe("the owner's word on a Stage", () => {
  // @test-id: tst_scripts_planupdate_019
  // @covers: planctl/src/core/plan-update.ts::recordStageApproval, stageApproved
  // @deterministic: yes
  // @invariant: a Stage is approved by the owner only through a journaled
  // line that carries the owner's word; the check reads that line and nothing
  // else, so a criterion can require it.
  it("tst_scripts_planupdate_019 approve-stage journals the owner's word and stage-approved reads only that", () => {
    const body = approvedWithStages();
    expect(stageApproved(body, "D1-S1")).toBe(false);
    const approved = recordStageApproval(body, "D1-S1", "да").body;
    expect(approved).toContain("approve-stage D1-S1 owner:да");
    expect(stageApproved(approved, "D1-S1")).toBe(true);
    expect(stageApproved(approved, "D1-S2")).toBe(false);
    expect(() => recordStageApproval(body, "D1-S9", "да")).toThrow(/unknown Stage/);
    expect(() => recordStageApproval(body, "D1-S1", "")).toThrow(/owner word/);
    // an unjournaled mention elsewhere in the plan is not an approval
    const forged = body.replace("## Execution log", "## Execution log\n\nThe owner said approve-stage D1-S2 owner:да in chat.");
    expect(stageApproved(forged, "D1-S2")).toBe(false);
  });
});

describe("Delivery and Stage descriptions", () => {
  // @test-id: tst_scripts_planupdate_desc_001
  // @covers: planctl/src/core/plan-update.ts::putDelivery description contract
  it("tst_scripts_planupdate_desc_001 a Delivery without a description is refused and told what to write", () => {
    const locked = lockPlanSpec(draft(), "spec").body;
    const { description: _omit, ...bare } = delivery();
    expect(() => putDelivery(locked, bare as unknown as DeliveryInput)).toThrow(/pull request text/);
    expect(() => putDelivery(locked, { ...delivery(), description: "   " })).toThrow(/pull request text/);
  });

  // @test-id: tst_scripts_planupdate_desc_002
  // @covers: planctl/src/core/plan-update.ts::renderDelivery
  it("tst_scripts_planupdate_desc_002 the Delivery description renders under the Stage graph and survives a Stage put and a replace", () => {
    let body = putDelivery(lockPlanSpec(draft(), "spec").body, delivery()).body;
    body = putStage(body, stage("D1-S1", ["scripts/base.ts"])).body;
    const block = body.slice(body.indexOf("### PR Delivery D1"), body.indexOf("<!-- plan:stage:D1-S1:start -->"));
    expect(block).toContain("What changed for people. The writer says what it wrote.");
    expect(block).toContain("How it was proven. The fixture suite.");
    expect(block.indexOf("Stage graph:")).toBeLessThan(block.indexOf("What changed for people"));
    const replaced = putDelivery(body, { ...delivery(), description: "What changed for people. Second text." }).body;
    expect(replaced).toContain("What changed for people. Second text.");
    expect(replaced).not.toContain("The writer says what it wrote.");
    expect(replaced).toContain("<!-- plan:stage:D1-S1:start -->");
  });

  // @test-id: tst_scripts_planupdate_desc_003
  // @covers: planctl/src/core/plan-update.ts::putStage description contract
  it("tst_scripts_planupdate_desc_003 a Stage without a description is refused and told what to write", () => {
    const locked = putDelivery(lockPlanSpec(draft(), "spec").body, delivery()).body;
    const { description: _omit, ...bare } = stage("D1-S1", ["scripts/base.ts"]);
    expect(() => putStage(locked, bare as unknown as StageInput)).toThrow(/what this Stage solves/);
  });

  // @test-id: tst_scripts_planupdate_desc_004
  // @covers: planctl/src/core/plan-update.ts::renderStage, stageInputs
  it("tst_scripts_planupdate_desc_004 the Stage description renders between the forecast and the Tasks and parses back", () => {
    let body = putDelivery(lockPlanSpec(draft(), "spec").body, delivery()).body;
    body = putStage(body, stage("D1-S1", ["scripts/base.ts"])).body;
    const block = body.slice(body.indexOf("<!-- plan:stage:D1-S1:start -->"), body.indexOf("<!-- plan:stage:D1-S1:end -->"));
    const at = block.indexOf("What this Stage solves. D1-S1 produces one observable behavior.");
    expect(at).toBeGreaterThan(block.indexOf("Of which verification:"));
    expect(at).toBeLessThan(block.indexOf("##### Tasks"));
    expect(block).toContain("Commit. feat(fixture): D1-S1");
    expect(stageInputs(body)[0]?.description).toBe(stage("D1-S1", ["scripts/base.ts"]).description);
    const replaced = putStage(body, {
      ...stage("D1-S1", ["scripts/base.ts"]),
      description: "What this Stage solves. Replaced.\n\nCommit. feat(fixture): replaced",
    }).body;
    expect(stageInputs(replaced)[0]?.description).toBe("What this Stage solves. Replaced.\n\nCommit. feat(fixture): replaced");
    expect(replaced).not.toContain("produces one observable behavior");
  });

  // @test-id: tst_scripts_planupdate_desc_005
  // @covers: planctl/src/core/plan-update.ts::assertSafeProse
  it("tst_scripts_planupdate_desc_005 a description that would read as a heading, an item or a marker is refused", () => {
    const locked = putDelivery(lockPlanSpec(draft(), "spec").body, delivery()).body;
    for (const bad of ["## A heading", "- [ ] an item", "- [x] a done item", "<!-- plan:stage:D9-S9:start -->", "text that ends a comment -->"]) {
      expect(() => putStage(locked, {
        ...stage("D1-S1", ["scripts/base.ts"]),
        description: `What this Stage solves. Fine.\n\n${bad}`,
      })).toThrow(/description/);
      expect(() => putDelivery(locked, { ...delivery(), description: `What changed for people. Fine.\n\n${bad}` })).toThrow(/description/);
    }
  });

  // @test-id: tst_scripts_planupdate_desc_006
  // @covers: planctl/src/core/plan-update.ts::putDelivery external wait contract
  it("tst_scripts_planupdate_desc_006 a Delivery without an external wait forecast is refused and told what to give", () => {
    const locked = lockPlanSpec(draft(), "spec").body;
    const { predictedExternalWaitMinutes: _omit, ...bare } = delivery();
    expect(() => putDelivery(locked, bare as unknown as DeliveryInput)).toThrow(/external wait/);
    expect(() => putDelivery(locked, { ...delivery(), predictedExternalWaitMinutes: -1 })).toThrow(/external wait/);
  });

  // @test-id: tst_scripts_planupdate_desc_007
  // @covers: planctl/src/core/plan-update.ts::deliveryForecastLine
  it("tst_scripts_planupdate_desc_007 the Delivery forecast is derived from its Stages and follows every Stage change", () => {
    let body = putDelivery(lockPlanSpec(draft(), "spec").body, delivery()).body;
    expect(body).toContain("Forecast: 0 active min / 0 credits across 0 Stages; longest dependency path 0 active min; external waits 15 min.");
    body = putStage(body, stage("D1-S1", ["scripts/base.ts"])).body;
    body = putStage(body, stage("D1-S2", ["scripts/a.ts"], ["D1-S3"])).body;
    body = putStage(body, stage("D1-S3", ["scripts/b.ts"], ["D1-S2"])).body;
    body = putStage(body, { ...stage("D1-S4", ["scripts/c.ts"]), depends: ["D1-S2", "D1-S3"] }).body;
    // four Stages of 10 min / 2 credits; S1 -> (S2 || S3) -> S4 is three deep
    expect(body).toContain("Forecast: 40 active min / 8 credits across 4 Stages; longest dependency path 30 active min; external waits 15 min.");
    const grown = putStage(body, { ...stage("D1-S4", ["scripts/c.ts"]), depends: ["D1-S2", "D1-S3"], predictedActiveMinutes: 20, predictedCredits: 4, tasks: [{ ...stage("D1-S4", ["scripts/c.ts"]).tasks[0]!, predictedActiveMinutes: 18, predictedCredits: 3 }] }).body;
    expect(grown).toContain("Forecast: 50 active min / 10 credits across 4 Stages; longest dependency path 40 active min; external waits 15 min.");
    expect(grown.match(/^Forecast: /gm)?.length).toBe(1);
    const approved = approvePlan(grown, "approve").body;
    expect(approved).toContain("Forecast: 50 active min / 10 credits across 4 Stages; longest dependency path 40 active min; external waits 15 min.");
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
    // the per-task time stays visible as a compact suffix on the story line
    expect(body).toContain("as one callable entrypoint. (8 min)");
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

  // @test-id: tst_scripts_planupdate_013
  // @scenario: scn_plan_control_legacy_amend_001
  // @covers: planctl/src/core/plan-update.ts::applyOwnerAmendment
  // @deterministic: yes
  // @invariant: an approved plan rendered before the compact Task contract remains amendable by its owner.
  it("tst_scripts_planupdate_013 preserves owner amendments for legacy five-line Tasks", () => {
    const modern = approvedWithStages();
    const metadata = modern.match(/<!-- plan:task-meta:(\{[^\n]*\}) -->/)?.[1];
    if (metadata === undefined) throw new Error("fixture task metadata is missing");
    const task = JSON.parse(metadata) as {
      readonly writes: readonly string[];
      readonly predictedActiveMinutes: number;
      readonly predictedCredits: number;
      readonly how: string;
      readonly red: string;
    };
    const compact = modern.match(/^- \[ \] D1-S1-T1 — [^\n]+\n<!-- plan:task-meta:\{[^\n]*\} -->$/m)?.[0];
    if (compact === undefined) throw new Error("fixture compact Task is missing");
    const legacy = [
      "- [ ] D1-S1-T1 — produce one observable behavior from the declared contract",
      `      Writes: ${task.writes.map((path) => `\`${path}\``).join(", ")}.`,
      `      Predict: ${task.predictedActiveMinutes} active min / ${task.predictedCredits} credits.`,
      `      How: ${task.how}`,
      `      RED: \`${task.red}\``,
    ].join("\n");
    const approvedLegacy = modern.replace(compact, legacy);

    const amended = applyOwnerAmendment(approvedLegacy, "owner", {
      section: "implementation",
      find: "D1-S2 || D1-S3",
      replace: "D1-S2 -> D1-S3",
    });

    expect(amended.body).toContain("D1-S2 -> D1-S3");
    expect(amended.body).toContain(legacy);
  });

  // @test-id: tst_scripts_planupdate_020
  // @scenario: scn_plan_control_locked_spec_amend_001
  // @covers: planctl/src/core/plan-update.ts::applyOwnerAmendment
  // @deterministic: yes
  // @invariant: an owner can correct a locked SPEC without approving implementation or changing draft Tasks.
  it("tst_scripts_planupdate_020 corrects a locked SPEC without approving implementation", () => {
    let locked = lockPlanSpec(draft(), "initial approval").body;
    locked = putDelivery(locked, delivery()).body;
    locked = putStage(locked, stage("D1-S1", ["scripts/base.ts"])).body;
    const implementation = locked.slice(locked.indexOf(IMPLEMENTATION_START), locked.indexOf(IMPLEMENTATION_END));

    const amended = applyOwnerAmendment(locked, "owner requested correction", {
      section: "spec",
      find: "Ship one observable result.",
      replace: "Ship the corrected result.",
    });

    expect(amended.body).toContain("Status: SPEC_LOCKED");
    expect(amended.body).toContain("Implementation lock: unlocked");
    expect(amended.body).toContain("Ship the corrected result.");
    expect(amended.body).toContain("amend spec owner:owner requested correction");
    expect(amended.body.slice(amended.body.indexOf(IMPLEMENTATION_START), amended.body.indexOf(IMPLEMENTATION_END))).toBe(implementation);
    expect(protocolLockViolations(amended.body)).toEqual([]);
    expect(() => applyOwnerAmendment(locked, "owner", {
      section: "implementation", find: "writer", replace: "changed",
    })).toThrow();
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

describe("merge Stage receipts", () => {
  // @test-id: tst_scripts_planupdate_014
  // @scenario: scn_plan_control_merge_receipt_001
  // @covers: planctl/src/core/plan-update.ts::stageResultCommitPaths
  // @deterministic: yes
  // @invariant: a merge-backed Stage receipt measures the result against its first parent.
  it("tst_scripts_planupdate_014 reports a merge Stage's first-parent paths", () => {
    const root = mkdtempSync(join(tmpdir(), "plan-update-merge-"));
    const git = (...args: readonly string[]): string =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    try {
      git("init", "-q", "-b", "main");
      git("config", "user.email", "test@example.com");
      git("config", "user.name", "Test");
      writeFileSync(join(root, "common.txt"), "base\n");
      git("add", "common.txt");
      git("commit", "-qm", "base");
      git("checkout", "-qb", "feature");
      writeFileSync(join(root, "feature.txt"), "feature\n");
      git("add", "feature.txt");
      git("commit", "-qm", "feature");
      git("checkout", "-q", "main");
      writeFileSync(join(root, "main.txt"), "main\n");
      git("add", "main.txt");
      git("commit", "-qm", "main");
      git("checkout", "-q", "feature");
      git("merge", "--no-ff", "-qm", "merge main", "main");

      expect(stageResultCommitPaths("HEAD", root)).toEqual(["main.txt"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("one evaluation per transformation, no log line per put", () => {
  function executionLines(body: string): number {
    const from = body.indexOf(EXECUTION_START);
    const to = body.indexOf(EXECUTION_END);
    return body.slice(from, to).split("\n").filter((line) => line.startsWith("- ")).length;
  }

  // @test-id: tst_scripts_planupdate_021
  // @scenario: scn_plan_control_one_evaluation_001
  // @covers: planctl/src/core/plan-update.ts::mutatePlanFile,putStage
  // @deterministic: yes
  // @invariant: a transformation runs once per mutation, and authoring leaves no Execution log line.
  it("tst_scripts_planupdate_021 runs the transformation once and logs nothing for a put", () => {
    const root = mkdtempSync(join(tmpdir(), "plan-update-once-"));
    const git = (...args: readonly string[]): string =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    try {
      git("init", "-q", "-b", "main");
      git("config", "user.email", "test@example.com");
      git("config", "user.name", "Test");
      writeFileSync(join(root, "plan.md"), draft());
      git("add", "plan.md");
      git("commit", "-qm", "plan");
      let calls = 0;
      mutatePlanFile(root, "plan.md", "lock-spec", (body) => {
        calls += 1;
        return lockPlanSpec(body, "word");
      });
      expect(calls).toBe(1);
      expect(readFileSync(join(root, "plan.md"), "utf8")).toContain("Status: SPEC_LOCKED");

      const locked = putDelivery(lockPlanSpec(draft(), "word").body, delivery()).body;
      const once = putStage(locked, stage("D1-S1", ["scripts/base.ts"])).body;
      const twice = putStage(once, stage("D1-S1", ["scripts/base.ts", "scripts/more.ts"])).body;
      expect(executionLines(once)).toBe(executionLines(locked));
      expect(executionLines(twice)).toBe(executionLines(locked));
      expect(stageInputs(twice)[0]?.writes).toEqual(["scripts/base.ts", "scripts/more.ts"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("complete-task derives the Stage result", () => {
  function approvedWithWrites(writes: readonly string[]): string {
    let body = lockPlanSpec(draft(), "spec").body;
    body = putDelivery(body, delivery()).body;
    body = putStage(body, stage("D1-S1", writes)).body;
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

  function repository(body: string, files: Readonly<Record<string, string>>): { root: string; commit: string } {
    const root = mkdtempSync(join(tmpdir(), "plan-update-complete-"));
    const git = (...args: readonly string[]): string =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    mkdirSync(join(root, "docs/plans"), { recursive: true });
    writeFileSync(join(root, "docs/plans/fixture.md"), body);
    git("add", "docs/plans/fixture.md");
    git("commit", "-qm", "plan");
    const startedAt = new Date(Date.now() - 30 * 60_000).toISOString();
    const runPath = taskRunPath(root, "docs/plans/fixture.md", "D1-S1-T1");
    mkdirSync(dirname(runPath), { recursive: true });
    writeFileSync(runPath, JSON.stringify({
      version: 2,
      plan: "docs/plans/fixture.md",
      deliveryId: "D1",
      stageId: "D1-S1",
      taskId: "D1-S1-T1",
      startedAt,
      baseHead: git("rev-parse", "HEAD"),
      machineId: "box",
      agentId: "claude:one",
      repositoryId: "fixture",
      worktree: root,
      branch: "main",
      planRevision: "0".repeat(64),
      ownerWait: null,
      accumulatedOwnerWaitSeconds: 20 * 60,
      lastAccountedOwnerWaitStartedAt: null,
    }));
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    git("add", "-A");
    git("commit", "-qm", "work");
    return { root, commit: git("rev-parse", "HEAD") };
  }

  // @test-id: tst_scripts_planupdate_022
  // @scenario: scn_plan_control_derived_result_001
  // @covers: planctl/src/core/plan-update.ts::completeTask
  // @deterministic: yes
  // @invariant: a completion is four inputs; paths, times, tests and the temp root are derived, and a test anywhere passes.
  it("tst_scripts_planupdate_022 derives paths, times and tests from the commit and the start record", async () => {
    const { root, commit } = repository(approvedWithWrites(["scripts/base.ts"]), {
      "scripts/base.ts": "export const base = 1;\n",
      "test/base.test.ts": "import { base } from '../scripts/base';\n",
    });
    try {
      mkdirSync(join(root, ".tmp/code-production/fixture/D1-S1"), { recursive: true });
      const done = await completeTask(root, {
        plan: "docs/plans/fixture.md",
        taskIds: ["D1-S1-T1"],
        commit,
        result: "base behavior shipped",
      }, decodeTaskRun);
      expect(Math.round(done.elapsedMinutes)).toBe(30);
      expect(Math.round(done.activeMinutes)).toBe(10);
      expect(done.paths).toEqual(["scripts/base.ts", "test/base.test.ts"]);
      expect(done.beyondWrites).toEqual(["test/base.test.ts"]);
      expect(done.tests).toEqual([{ id: "D1-S1-T1", command: "bun run agent:test:backend -- test/plan-update.test.ts" }]);
      expect(done.tempRoot).toEqual({ path: ".tmp/code-production/fixture/D1-S1", state: "present" });
      const body = readFileSync(join(root, "docs/plans/fixture.md"), "utf8");
      expect(body).toContain(`- [x] D1-S1-T1 — produce one observable D1-S1 behavior in scripts/base.ts (8 min) — ${commit}`);
      expect(body).toContain("temp root present: .tmp/code-production/fixture/D1-S1");
      expect(existsSync(taskRunPath(root, "docs/plans/fixture.md", "D1-S1-T1"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // @test-id: tst_scripts_planupdate_024
  // @scenario: scn_plan_control_protected_path_001
  // @covers: planctl/src/core/plan-update.ts::completeTask
  // @deterministic: yes
  // @invariant: a protected path refuses by name unless the Task's writes name it.
  it("tst_scripts_planupdate_024 refuses an unnamed protected path and accepts a named one", async () => {
    const files = { "scripts/base.ts": "export const base = 1;\n", ".github/workflows/ci.yml": "name: ci\n" };
    const unnamed = repository(approvedWithWrites(["scripts/base.ts"]), files);
    const named = repository(approvedWithWrites(["scripts/base.ts", ".github/workflows/ci.yml"]), files);
    try {
      await expect(completeTask(unnamed.root, {
        plan: "docs/plans/fixture.md",
        taskIds: ["D1-S1-T1"],
        commit: unnamed.commit,
        result: "ci added",
      }, decodeTaskRun)).rejects.toThrow(/protected path \.github\/workflows\/ci\.yml/);
      const done = await completeTask(named.root, {
        plan: "docs/plans/fixture.md",
        taskIds: ["D1-S1-T1"],
        commit: named.commit,
        result: "ci added",
      }, decodeTaskRun);
      expect(done.paths).toEqual([".github/workflows/ci.yml", "scripts/base.ts"]);
    } finally {
      rmSync(unnamed.root, { recursive: true, force: true });
      rmSync(named.root, { recursive: true, force: true });
    }
  });
});

describe("the Ledger line on the last Stage", () => {
  function ticked(body: string, stageId: string): string {
    return body.replace(`- [ ] ${stageId}-T1 —`, `- [x] ${stageId}-T1 —`);
  }

  // @test-id: tst_scripts_planupdate_023
  // @scenario: scn_plan_control_ledger_001
  // @covers: planctl/src/core/plan-update.ts::closePlanStage
  // @deterministic: yes
  // @invariant: closing the last Stage of a Delivery writes Ledger: implemented; an earlier Stage writes none; numbers never stop closure.
  it("tst_scripts_planupdate_023 writes Ledger: implemented when the last Stage closes and a low number changes nothing", () => {
    const head = "c".repeat(40);
    const close = (body: string, stageId: string) => closePlanStage(ticked(body, stageId), stageId, { root: tmpdir(), head, run: () => 0 });
    let body = approvedWithStages();
    const first = close(body, "D1-S1");
    expect(first.status).toBe("CLOSED");
    expect(first.body).not.toMatch(/^Ledger:/m);
    body = close(close(first.body, "D1-S2").body, "D1-S3").body;
    const lowResult = `| D1-S4-T1 | ${head} | 2026-09-25T09:00:00Z–2026-09-25T09:10:00Z | 10 / 10 min | unavailable: not measured | 49.8 of the Goal's 50 |`;
    body = body.replace("<!-- plan:results:D1-S4:end -->", `${lowResult}\n<!-- plan:results:D1-S4:end -->`);
    const last = close(body, "D1-S4");
    expect(last.status).toBe("CLOSED");
    expect(last.body).toMatch(/^Ledger: implemented\s*$/m);
    expect(last.body).not.toMatch(/^Ledger:.*PR/m);
    expect(last.body).toContain(lowResult);
    expect(protocolLockViolations(last.body)).toEqual([]);
  });
});
