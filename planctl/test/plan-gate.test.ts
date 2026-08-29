import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

import { checkPlanFreeze, gatePlan, planItems } from "../src/core/plan-gate";

// This file used to `delete process.env.PLAN_GATE_NESTED` here, so that the
// suite could still exercise criterion execution when it ran AS a criterion
// itself. That deletion disarmed the recursion guard for this process AND for
// everything it spawned — `gatePlan` seeds a child's environment from
// `process.env`, so the flag it thought it was setting was being erased one
// level down. On 2026-08-24 that took the machine to ~80 new processes per
// second, twice.
//
// It is not restored in any form. A test that needs execution gets it because
// the guard is genuinely absent at the top of a normal run; a test that spawns
// the gate recursively is supposed to stop, and stopping is the behaviour
// under test.

/*
 * @test-id: tst_scripts_plangate_001
 * @scenario: scn_process_001
 * @covers: planctl/src/core/plan-gate.ts::gatePlan
 * @deterministic: yes
 * @fixtures: temporary git repo with a staged-plan file; receipts point at
 *            the repo's own commits or at garbage
 */

// Immune to inherited GIT_DIR/GIT_WORK_TREE — under a git hook those point
// fixture commands at the REAL repository (it rewrote a live branch once).
const CLEAN_GIT_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
) as Record<string, string>;

function git(root: string, args: string): string {
  return execSync(`git ${args}`, { cwd: root, encoding: "utf8", env: CLEAN_GIT_ENV }).trim();
}

function makeRepo(): { root: string; sha: string } {
  const root = mkdtempSync(join(tmpdir(), "plan-gate-"));
  git(root, "init -q");
  git(root, 'config user.email t@t && git config user.name t');
  writeFileSync(join(root, "seed.txt"), "seed\n");
  git(root, "add -A");
  git(root, '-c user.email=t@t -c user.name=t commit -qm seed');
  return { root, sha: git(root, "rev-parse --short HEAD") };
}

function planWith(body: string): string {
  return `# A plan\n\n## Stages\n\n${body}\n`;
}

describe("plan-gate", () => {
  // @invariant: the shared box grammar is the foundation every other rule
  //   stands on — and mutation found seven of its pieces surviving all three
  //   suites, so each was free to loosen with nothing turning red. These are
  //   the inputs that tell each piece apart.
  it("tst_scripts_plangate_016 pins the box grammar against the ways it loosens", () => {
    const { root, sha } = makeRepo();
    const plan = join(root, "plan.md");

    // A receipt is what ENDS the line. Unanchored, ordinary prose that happens
    // to contain a hex word reads as a receipt and the box closes on nothing.
    writeFileSync(plan, planWith([
      "### Stage 1 — prose that merely mentions hex",
      "",
      // The em-dash matters: without one the pattern cannot match anywhere,
      // anchored or not, and the case would prove nothing. It needs to LOOK
      // like a receipt everywhere except at the end of the line.
      "- [x] Rewrote — deadbeef1 — the helper, and moved on",
    ].join("\n")));
    expect(gatePlan(plan, { root }).violations.map((v) => v.kind)).toEqual(["missing-receipt"]);

    // A NESTED box is its own item, not a continuation of its parent. Without
    // the lookahead the child is swallowed, the parent inherits the child's
    // receipt, and --closure walks past an open box calling the stage done.
    // What the lookahead protects is the parent's TEXT, not the box count:
    // the outer walk revisits the swallowed line and emits it as an item
    // anyway, so counting proves nothing. Swallowed, the parent's recorded
    // text carries the child's words AND the child's receipt — an open box
    // that reads as though it were settled.
    const nestedBody = planWith([
      "### Stage 1 — a nested box",
      "",
      "#### Tasks",
      "",
      "- [ ] parent, still open",
      `  - [x] child, closed — ${sha}`,
    ].join("\n"));
    const parent = planItems(nestedBody, 1)[0];
    if (parent === undefined) throw new Error("nested fixture must expose its parent Task");
    expect(parent.text).toBe("parent, still open");
    expect(parent.hasReceipt).toBe(false);

    // A box under a LATER level-2 heading belongs to no STAGE. The gate counts
    // every box in the document on purpose — an unchecked box is unfinished
    // wherever it sits — but the stage-scoped view must stop, or plan-close
    // would number a Deviations line and close it against a verdict.
    const withRecord = planWith([
      "### Stage 1 — done",
      "",
      "#### Tasks",
      "",
      `- [x] settled — ${sha}`,
      "",
      "## Deviations",
      "",
      "- [ ] a line that reads like a box but is a record",
    ].join("\n"));
    expect(planItems(withRecord, 1).map((item) => item.text)).toEqual([`settled — ${sha}`]);

    // A receipt must name a commit this HEAD descends from. Every fixture so
    // far used HEAD's own sha or outright garbage, so "exists, but on another
    // branch" — the shape a copied receipt actually takes — was never tested,
    // and the existence probe and the ancestor check were interchangeable.
    git(root, "checkout -q -b sibling");
    writeFileSync(join(root, "sibling.txt"), "elsewhere\n");
    git(root, "add -A");
    git(root, '-c user.email=t@t -c user.name=t commit -qm sibling');
    const siblingSha = git(root, "rev-parse --short HEAD");
    git(root, "checkout -q -");
    writeFileSync(plan, planWith([
      "### Stage 1 — a receipt from elsewhere",
      "",
      `- [x] closed against another branch's commit — ${siblingSha}`,
    ].join("\n")));
    expect(gatePlan(plan, { root }).violations.map((v) => v.kind)).toEqual(["unknown-receipt"]);

    // An unchecked box is `- [ ] `, exactly. Loosened, `- []` and `- [ ]x`
    // start counting as work nobody wrote.
    writeFileSync(plan, planWith([
      "### Stage 1 — near misses",
      "",
      "- [] not a box",
      "- [ ]also not a box",
    ].join("\n")));
    expect(gatePlan(plan, { root }).openBoxes).toBe(0);
  });

  it("tst_scripts_plangate_001 verifies receipts, runs machinable criteria, counts open boxes", () => {
    const { root, sha } = makeRepo();
    const plan = join(root, "plan.md");

    writeFileSync(plan, planWith([
      "### Stage 1 — good",
      "",
      "Done when:",
      "",
      `- [x] \`true\` exits 0 — ${sha}`,
      "- [ ] something not yet done",
    ].join("\n")));
    const report = gatePlan(plan, { root, nested: false });
    expect(report.violations).toEqual([]);
    expect(report.openBoxes).toBe(1);
    expect(report.checkedCriteria).toBe(1);

    writeFileSync(plan, planWith([
      "### Stage 1 — bad receipts and lies",
      "",
      "Done when:",
      "",
      "- [x] `true` exits 0 — deadbeef",          // sha not in repo
      `- [x] \`false\` exits 0 — ${sha}`,          // criterion lies
      "- [x] flipped with no receipt at all",      // no sha
    ].join("\n")));
    const bad = gatePlan(plan, { root, nested: false });
    const kinds = bad.violations.map((v) => v.kind).sort();
    expect(kinds).toEqual(["criterion-failed", "missing-receipt", "unknown-receipt"]);
  });

  it("tst_scripts_plangate_003 a multi-line box carries its receipt on the last continuation line", () => {
    const { root, sha } = makeRepo();
    const plan = join(root, "plan.md");
    writeFileSync(plan, planWith([
      "### Stage 1 — wrapped",
      "",
      "Tasks:",
      "",
      "- [x] Rewrite the templates so that prose may QUOTE the machinable",
      `      form (\`false\` exits 0) without the gate executing it — ${sha}`,
      "- [x] `true` exits 0, a machinable criterion",
      `      wrapped across two lines — ${sha}`,
      "- [ ] a wrapped OPEN item that continues",
      "      onto a second line",
    ].join("\n")));
    const report = gatePlan(plan, { root, nested: false });
    expect(report.violations).toEqual([]);   // the quoted `false` was NOT run
    expect(report.closedBoxes).toBe(2);
    expect(report.openBoxes).toBe(1);
    expect(report.checkedCriteria).toBe(1);  // only the item-opening command ran
  });

  it("tst_scripts_plangate_004 start mode refuses unapproved plans and unanswered deviations", () => {
    const { root, sha } = makeRepo();
    const plan = join(root, "plan.md");

    writeFileSync(plan, `---\nstatus: approved\n---\n${planWith(`- [x] \`true\` exits 0 — ${sha}`)}`);
    expect(gatePlan(plan, { root, start: true }).violations).toEqual([]);

    writeFileSync(plan, `---\nstatus: draft — awaiting owner approval\n---\n${planWith("- [ ] open")}`);
    expect(gatePlan(plan, { root, start: true }).violations.map((v) => v.kind)).toContain("unapproved-plan");

    writeFileSync(plan, `---\nstatus: approved\n---\n${planWith("- [ ] open")}\n## Deviations\n\n- 2026-08-19 (agent): target 100, reached 38 — awaiting the owner's verdict\n`);
    expect(gatePlan(plan, { root, start: true }).violations.map((v) => v.kind)).toContain("awaiting-owner");
  });

  // READ THIS BEFORE TOUCHING THE GUARD. This case is the regression test for
  // the recursion guard, and its failure mode is the FORK BOMB itself, not a
  // red line: if the guard stops working, running this file reproduces the
  // outage instead of reporting it. The alarm is wired to the bomb. Anyone
  // changing `PLAN_GATE_NESTED` should run the suite inside a task cap —
  // `systemd-run --user --scope -p TasksMax=400 --quiet bun test …` — and not
  // under `ulimit -u`, which counts every task the user owns and refuses the
  // first fork, looking exactly like the thing it is meant to contain.
  it("tst_scripts_plangate_005 a self-referential criterion cannot recurse, and a hanging one times out", () => {
    const { root, sha } = makeRepo();
    const plan = join(root, "plan.md");
    const gate = join(import.meta.dir, "../src/core/plan-gate.ts");

    // The criterion invokes plan-gate on the SAME plan — without a guard this
    // recursed forever. Nested runs must skip criterion execution, so the
    // whole call completes and the box passes on structure alone.
    writeFileSync(plan, planWith(
      `- [x] \`bun ${gate} ${plan} --root ${root}\` exits 0 — ${sha}`,
    ));
    const started = performance.now();
    const report = gatePlan(plan, { root, nested: false });
    expect(report.violations).toEqual([]);
    expect(performance.now() - started).toBeLessThan(30_000);

    // A criterion that hangs is a failed criterion, not a hung gate.
    writeFileSync(plan, planWith(`- [x] \`sleep 300\` exits 0 — ${sha}`));
    const hung = gatePlan(plan, { root, nested: false, criterionTimeoutMs: 500 });
    expect(hung.violations.map((v) => v.kind)).toContain("criterion-failed");
  });

  it("tst_scripts_plangate_007 boxes under a Superseded heading are dead text, not outstanding work", () => {
    const { root, sha } = makeRepo();
    const plan = join(root, "plan.md");

    // A reformat parks the pre-rewrite stage list under `## Superseded …`;
    // counting those boxes made --closure unreachable for any reworked plan
    // (measured on PR #160: 16 of 47 open-box violations were dead text).
    writeFileSync(plan, [
      planWith(`- [x] \`true\` exits 0 — ${sha}`),
      "## Superseded stage notes",
      "",
      "- [ ] old box the reformat replaced",
      "- [x] old closed box, no receipt on purpose",
      "",
      "## Deviations",
      "",
      "- [ ] a live box after the superseded section is counted again",
      "",
    ].join("\n"));
    const report = gatePlan(plan, { root, closure: true });
    expect(report.violations.map((v) => v.kind)).toEqual(["open-box"]);
    expect(report.openBoxes).toBe(1);
    expect(report.closedBoxes).toBe(1);
  });

  it("tst_scripts_plangate_006 no-exec mode skips criterion execution but still verifies receipts", () => {
    const { root, sha } = makeRepo();
    const plan = join(root, "plan.md");

    // The criterion is red on any machine (`false` exits 1, not 0) — a thin
    // environment must not turn that into a violation when it is told not to
    // execute; receipts are the portable half and stay checked.
    writeFileSync(plan, planWith(`- [x] \`false\` exits 0 — ${sha}`));
    expect(gatePlan(plan, { root, noExec: true }).violations).toEqual([]);

    writeFileSync(plan, planWith(`- [x] \`false\` exits 0 — 0000000000000000000000000000000000000000`));
    expect(gatePlan(plan, { root, noExec: true }).violations.map((v) => v.kind)).toContain("unknown-receipt");
  });

  it("tst_scripts_plangate_002 closure mode fails on open boxes, passes when everything is flipped", () => {
    const { root, sha } = makeRepo();
    const plan = join(root, "plan.md");

    writeFileSync(plan, planWith(`- [ ] still open`));
    expect(gatePlan(plan, { root, closure: true }).violations.map((v) => v.kind)).toContain("open-box");

    writeFileSync(plan, planWith(`- [x] \`true\` exits 0 — ${sha}`));
    expect(gatePlan(plan, { root, closure: true }).violations).toEqual([]);
  });
});

// @test-id: tst_scripts_plangate_008, _009, _014, _015, _017, _018
// @scenario: scn_stage_loop_007
// @covers: planctl/src/core/plan-gate.ts::checkPlanFreeze
// @deterministic: yes
// @invariant: INV-SL-4 — a commit that changes a protected section of an
//   APPROVED plan is refused unless that same commit adds an Amendments line.
//   The specimen this exists for: ee92a86eb rewrote a Goal, a target tree and
//   acceptance criteria inside a commit whose subject was about code, and
//   every gate passed it green.
describe("plan freeze", () => {
  const approved = [
    "---",
    "status: approved",
    "---",
    "# A plan",
    "",
    "## The goal",
    "",
    "Cut the gate to 90 seconds.",
    "",
    // Drawn DIRECTLY under its heading, which is the shape the freeze covers:
    // a tree under a `###` of its own is the known hole, recorded in
    // stage-loop.md's Deviations, and must not be asserted as if it were shut.
    "## The target",
    "",
    "```",
    "scripts/gate.ts        CREATE",
    "```",
    "",
    "## Stages",
    "",
    "### Stage 1: the cut",
    "",
    // Stage prose is deliberately FREE — the agent's to write. It is in the
    // fixture so a merge can have our side touch something legitimate while
    // their side touches protected text.
    "Context: the runner is where the cost sits.",
    "",
    "#### Acceptance criteria",
    "",
    "- [ ] `true` exits 0 — under 90 seconds",
    "",
    "## Amendments",
    "",
    "(none)",
    "",
  ].join("\n");

  it("tst_scripts_plangate_017 refuses a protected change with no Amendment in the same commit", () => {
    // A number alone is the granted "corrected measurement" delta (and its
    // named limit); a criterion whose ASSERTION changes is the contract moving.
    const reworded = approved.replace("`true` exits 0 — under 90 seconds", "`true` exits 0 — whenever it finishes");
    const verdict = checkPlanFreeze({ path: "docs/plans/p.md", parent: approved, candidate: reworded });
    expect(verdict.allowed).toBe(false);

    const goalMoved = approved.replace("Cut the gate to 90 seconds.", "Cut the gate down a lot.");
    expect(checkPlanFreeze({ path: "docs/plans/p.md", parent: approved, candidate: goalMoved }).allowed).toBe(false);

    const headingMoved = approved.replace("### Stage 1: the cut", "### Stage 1: something else");
    expect(checkPlanFreeze({ path: "docs/plans/p.md", parent: approved, candidate: headingMoved }).allowed).toBe(false);
  });

  it("tst_scripts_plangate_018 lets the same commit's Amendment license the change, and only that one", () => {
    const licensed = approved
      .replace("`true` exits 0 — under 90 seconds", "`true` exits 0 — whenever it finishes")
      .replace("(none)", "- 2026-08-23 — owner widened the ceiling to 900s.");
    expect(checkPlanFreeze({ path: "docs/plans/p.md", parent: approved, candidate: licensed }).allowed).toBe(true);

    // An Amendment the BASELINE already carried licenses nothing: one owner
    // decision is not a standing permit.
    const alreadyAmended = approved.replace("(none)", "- 2026-08-22 — owner approved an earlier change.");
    const laterReword = alreadyAmended.replace("`true` exits 0 — under 90 seconds", "`true` exits 0 — whenever it finishes");
    expect(checkPlanFreeze({ path: "docs/plans/p.md", parent: alreadyAmended, candidate: laterReword }).allowed).toBe(false);
  });

  // The freeze recorded a criterion by its FIRST LINE, so on the plans this
  // repository actually writes the assertion itself was editable: stage-loop's
  // own "a clean merge runs nothing" lives past the wrap and could be flipped
  // to its opposite with the verdict `allowed`. The wrap is read with the
  // SHARED continuation grammar — unindented prose that merely follows the
  // list, such as a plan's own `Receipt:` line, belongs to nobody's contract.
  it("tst_scripts_plangate_014 protects a wrapped criterion, and only its continuation", () => {
    const wrapped = [
      "---",
      "status: approved",
      "---",
      "# A plan",
      "",
      "## The goal",
      "",
      "Cut the gate to 90 seconds.",
      "",
      "## The target",
      "",
      "### The tree this plan draws",
      "",
      "```",
      "scripts/gate.ts        CREATE",
      "```",
      "",
      "## Stages",
      "",
      "### Stage 1: the cut",
      "",
      "#### Acceptance criteria",
      "",
      "- [ ] `bash gate.sh` exits 0 — the merge path proved: a clean merge",
      "      runs nothing, and a hand-made resolution runs that path's suite",
      "",
      "Receipt: measured on this machine, 2026-08-24.",
      "",
      "## Amendments",
      "",
      "(none)",
      "",
    ].join("\n");

    const flipped = wrapped.replace(
      "      runs nothing, and a hand-made resolution runs that path's suite",
      "      runs the whole suite, and a hand-made resolution runs it twice",
    );
    expect(
      checkPlanFreeze({ path: "docs/plans/p.md", parent: wrapped, candidate: flipped }).allowed,
    ).toBe(false);

    // Prose that merely follows the list is not the criterion's continuation.
    const proseEdited = wrapped.replace(
      "Receipt: measured on this machine, 2026-08-24.",
      "Receipt: measured on the runner, 2026-08-25.",
    );
    expect(
      checkPlanFreeze({ path: "docs/plans/p.md", parent: wrapped, candidate: proseEdited }).allowed,
    ).toBe(true);

    // The free deltas survive the widening: a tick and its receipt still pass,
    // continuation lines and all.
    const ticked = wrapped.replace(
      "- [ ] `bash gate.sh` exits 0 — the merge path proved: a clean merge",
      "- [x] `bash gate.sh` exits 0 — the merge path proved: a clean merge",
    );
    expect(
      checkPlanFreeze({ path: "docs/plans/p.md", parent: wrapped, candidate: ticked }).allowed,
    ).toBe(true);
  });

  // @invariant: a reconstruction that cannot be trusted refuses; it never
  //   waves everything through. The empty rev reads the INDEX, so a blank tree
  //   would make the auto-merge equal the candidate for EVERY plan and turn
  //   INV-SL-4 off repository-wide — the worst failure this file can have, and
  //   the coverage review found it unpinned.
  it("tst_scripts_plangate_015 refuses when the merge cannot be reconstructed", () => {
    const un = makeRepo().root;
    const gate = join(import.meta.dir, "../src/core/plan-gate.ts");
    mkdirSync(join(un, "docs/plans"), { recursive: true });
    writeFileSync(join(un, "docs/plans/subject.md"), approved);
    git(un, "add -A");
    git(un, "-c core.hooksPath=/dev/null commit -qm approved-plan");
    // `checkout -` has nothing to return to after an orphan checkout.
    const home = git(un, "rev-parse --abbrev-ref HEAD");

    // An ORPHAN commit: no common ancestor, so there is no merge to reconstruct.
    git(un, "checkout -q --orphan stranger");
    git(un, "rm -rq --cached .");
    writeFileSync(join(un, "unrelated.txt"), "stranger\n");
    git(un, "add -A");
    git(un, "-c core.hooksPath=/dev/null commit -qm stranger");
    const strangerSha = git(un, "rev-parse HEAD");

    git(un, `checkout -q ${home}`);
    // Stand a merge up by hand: MERGE_HEAD present, unrelated histories.
    writeFileSync(join(un, ".git/MERGE_HEAD"), `${strangerSha}\n`);
    // …and a protected change nobody licensed, which must still be refused.
    writeFileSync(
      join(un, "docs/plans/subject.md"),
      approved.replace("Cut the gate to 90 seconds.", "Cut the gate however I please."),
    );
    git(un, "add docs/plans/subject.md");

    const verdict = Bun.spawnSync(["bun", gate, "--freeze", "docs/plans/subject.md"], { cwd: un });
    expect(`unreconstructable: ${verdict.exitCode}`).toBe("unreconstructable: 1");
  });

  it("tst_scripts_plangate_008 passes the free deltas and respects the approval boundary", () => {
    const ticked = approved.replace(
      "- [ ] `true` exits 0 — under 90 seconds",
      "- [x] `true` exits 0 — under 90 seconds — abc1234",
    );
    expect(checkPlanFreeze({ path: "docs/plans/p.md", parent: approved, candidate: ticked }).allowed).toBe(true);

    // A status line that says APPROVED and then says WHO and WHEN is still an
    // approved plan. Requiring the word to end the line left six plans with no
    // freeze at all — not a weaker contract, none: goal, stage headings and
    // criteria all editable. Measured with the predicate itself over
    // docs/plans: 18 before, 24 after. The spellings are the corpus's own.
    for (const spelling of [
      "Status: APPROVED",
      "Status: APPROVED.",
      "Status: APPROVED — owner invoked it on 2026-08-21",
      "Status: APPROVED (2026-08-18) — variant A",
      "Status: **APPROVED** (conversation, 2026-08-11).",
    ]) {
      const parent = approved.replace("status: approved", spelling);
      const reworded = parent.replace("`true` exits 0 — under 90 seconds", "`true` exits 0 — whenever it finishes");
      expect(
        checkPlanFreeze({ path: "docs/plans/p.md", parent, candidate: reworded }).allowed,
      ).toBe(false);
    }

    // …and the words that are NOT approval still mean the rule does not apply.
    for (const spelling of ["Status: DRAFT — self-review below", "Status: COMPLETE — ready for review", "Status: IMPLEMENTED"]) {
      const parent = approved.replace("status: approved", spelling);
      const reworded = parent.replace("`true` exits 0 — under 90 seconds", "`true` exits 0 — whenever it finishes");
      expect(
        checkPlanFreeze({ path: "docs/plans/p.md", parent, candidate: reworded }).allowed,
      ).toBe(true);
    }

    // The approval flip carrying a reword AND the owner's line that licenses
    // it. The flip alone and the flip-plus-reword were both pinned; this one
    // — the shape /blueprint-start actually produces when the owner approves
    // a correction in the same breath — was not, and mutation showed the
    // branch could be deleted with the suite green.
    const draft = approved.replace("status: approved", "status: proposed");
    const flippedWithLicence = draft
      .replace("status: proposed", "status: approved")
      .replace("`true` exits 0 — under 90 seconds", "`true` exits 0 — whenever it finishes")
      .replace("(none)", "- 2026-08-24 — owner corrected the ceiling before approving.");
    expect(
      checkPlanFreeze({ path: "docs/plans/p.md", parent: draft, candidate: flippedWithLicence }).allowed,
    ).toBe(true);

    // …and the same flip WITHOUT the owner's line is the smuggled rewrite.
    const flippedBare = draft
      .replace("status: proposed", "status: approved")
      .replace("`true` exits 0 — under 90 seconds", "`true` exits 0 — whenever it finishes");
    expect(
      checkPlanFreeze({ path: "docs/plans/p.md", parent: draft, candidate: flippedBare }).allowed,
    ).toBe(false);

    // Not approved at the parent: the rule does not apply at all.
    const proposed = approved.replace("status: approved", "status: proposed");
    const rewordedProposed = proposed.replace("`true` exits 0 — under 90 seconds", "`true` exits 0 — whenever it finishes");
    expect(checkPlanFreeze({ path: "docs/plans/p.md", parent: proposed, candidate: rewordedProposed }).allowed).toBe(true);

    // Born APPROVED is refused: approval is the owner's act on something read.
    expect(checkPlanFreeze({ path: "docs/plans/p.md", parent: null, candidate: approved }).allowed).toBe(false);

    // An approval flip may carry the approval and the free deltas only.
    const flip = proposed.replace("status: proposed", "status: approved");
    expect(checkPlanFreeze({ path: "docs/plans/p.md", parent: proposed, candidate: flip }).allowed).toBe(true);
    const flipWithReword = flip.replace("`true` exits 0 — under 90 seconds", "`true` exits 0 — whenever it finishes");
    expect(checkPlanFreeze({ path: "docs/plans/p.md", parent: proposed, candidate: flipWithReword }).allowed).toBe(false);
  });

  it("tst_scripts_plangate_009 inherits a merge given git's own auto-merge", () => {
    const theirs = approved.replace("Cut the gate to 90 seconds.", "Cut the gate to 60 seconds.");
    // Content equal to git's own auto-merge is inherited, not authored.
    expect(checkPlanFreeze({
      path: "docs/plans/p.md", parent: approved, candidate: theirs, autoMerged: theirs,
    }).allowed).toBe(true);
    // A hand resolution that lands protected text is authored work. It has to
    // be a TEXTUAL change: a number-only resolution is indistinguishable from
    // the granted measurement delta, which is the limit the plan names.
    const handResolved = approved.replace("Cut the gate to 90 seconds.", "Cut the gate and also rename things.");
    expect(checkPlanFreeze({
      path: "docs/plans/p.md", parent: approved, candidate: handResolved, autoMerged: theirs,
    }).allowed).toBe(false);
    // Two in-memory rename assertions used to sit here and they proved
    // nothing: `renamedFrom` was never read by this function, so the first
    // reduced to "identical parent and candidate pass" and the second to the
    // plain refusal asserted a few lines above. Renames are resolved by the
    // CLI, choosing where the parent version is READ from, and that is covered
    // on real repositories by tst_scripts_plangate_012's `git mv`.
  });

  // @test-id: tst_scripts_plangate_010
  // @invariant: the review's probe, pinned — an outcome is not a measurement.
  //   The mask that granted re-measurement was blanking every digit, so a
  //   criterion could flip from `exits 0` to `exits 1` (and plan-close would
  //   then tick it on the opposite outcome), and Stage 1 could become Stage 2.
  it("tst_scripts_plangate_010 refuses a flipped outcome and a renumbered stage", () => {
    const flipped = approved.replace("`true` exits 0", "`true` exits 1");
    expect(checkPlanFreeze({ path: "docs/plans/p.md", parent: approved, candidate: flipped }).allowed).toBe(false);

    const renumbered = approved.replace("### Stage 1: the cut", "### Stage 2: the cut");
    expect(checkPlanFreeze({ path: "docs/plans/p.md", parent: approved, candidate: renumbered }).allowed).toBe(false);

    // And the granted delta still passes: a measurement inside the Goal.
    const remeasured = approved.replace("Cut the gate to 90 seconds.", "Cut the gate to 60 seconds.");
    expect(checkPlanFreeze({ path: "docs/plans/p.md", parent: approved, candidate: remeasured }).allowed).toBe(true);
  });

  // @test-id: tst_scripts_plangate_011
  // @invariant: the Goal is protected under every spelling this repository
  //   uses for its heading — matching one literal left 15 of 46 plans with no
  //   protected Goal at all.
  it("tst_scripts_plangate_011 protects the goal under its other spellings", () => {
    for (const heading of ["## 1. The goal", "## The goal — the metric the agent optimizes"]) {
      const spelled = approved.replace("## The goal", heading);
      const gutted = spelled.replace("Cut the gate to 90 seconds.", "Do whatever seems right.");
      expect(checkPlanFreeze({ path: "docs/plans/p.md", parent: spelled, candidate: gutted }).allowed).toBe(false);
    }
  });

  // @test-id: tst_scripts_plangate_012
  // @invariant: the --freeze CLI's own two git reads — the rename pairing and
  //   the MERGE_HEAD auto-merge — are proved on a real repository, not on
  //   strings. The reviewer refused the box claiming committed fixtures while
  //   every case was in memory, and the rename half had shipped BROKEN
  //   because of exactly that gap: an unchanged rename was refused as "a plan
  //   cannot be created already APPROVED".
  it("tst_scripts_plangate_012 pairs a rename and inherits a merge, through the CLI", () => {
    const { root } = makeRepo();
    const gate = join(import.meta.dir, "../src/core/plan-gate.ts");
    mkdirSync(join(root, "docs/plans"), { recursive: true });
    const plan = join(root, "docs/plans/subject.md");
    writeFileSync(plan, approved);
    git(root, "add -A");
    git(root, "-c core.hooksPath=/dev/null commit -qm approved-plan");

    // The INV-SL-4 matrix itself, on this committed repository and through the
    // CLI — the box asks for committed fixtures, and an in-memory call cannot
    // show that the CLI reads the committed parent at all. Each case restores
    // the plan before the next, so they do not lean on each other.
    const freeze = () => Bun.spawnSync(["bun", gate, "--freeze", "docs/plans/subject.md"], { cwd: root }).exitCode;
    const restore = () => {
      writeFileSync(plan, approved);
      git(root, "add -A");
    };
    for (const [what, mutated] of [
      ["the goal", approved.replace("Cut the gate to 90 seconds.", "Cut the gate down a lot.")],
      ["the target tree", approved.replace("scripts/gate.ts        CREATE", "scripts/gate.ts        DELETE")],
      ["a stage heading", approved.replace("### Stage 1: the cut", "### Stage 1: something else")],
      ["a criterion", approved.replace("`true` exits 0 — under 90 seconds", "`true` exits 0 — whenever it finishes")],
    ] as const) {
      writeFileSync(plan, mutated);
      git(root, "add -A");
      expect(`${what}: ${freeze()}`).toBe(`${what}: 1`);
      restore();
    }
    // The same criterion change, licensed by an Amendment in THIS commit.
    writeFileSync(
      plan,
      approved
        .replace("`true` exits 0 — under 90 seconds", "`true` exits 0 — whenever it finishes")
        .replace("(none)", "- 2026-08-24 — owner widened the ceiling."),
    );
    git(root, "add -A");
    expect(`licensed: ${freeze()}`).toBe("licensed: 0");
    restore();
    // A tick with its receipt needs nobody's word.
    writeFileSync(
      plan,
      approved.replace(
        "- [ ] `true` exits 0 — under 90 seconds",
        "- [x] `true` exits 0 — under 90 seconds — abc1234",
      ),
    );
    git(root, "add -A");
    expect(`tick: ${freeze()}`).toBe("tick: 0");
    restore();

    // Born APPROVED, on a real repository: a plan that has no parent version
    // anywhere and already declares approval. In memory this was pinned from
    // the start; through the CLI it was not, and the CLI is what the commit
    // hook runs. It matters more now that inheritance is answered first —
    // this is the case that proves the exemption cannot swallow it, there
    // being no merge and therefore no auto-merge to inherit.
    {
      const born = makeRepo().root;   // already carries one commit
      mkdirSync(join(born, "docs/plans"), { recursive: true });
      writeFileSync(join(born, "docs/plans/newborn.md"), approved);
      git(born, "add -A");
      const created = Bun.spawnSync(["bun", gate, "--freeze", "docs/plans/newborn.md"], { cwd: born });
      expect(`born-approved: ${created.exitCode}`).toBe("born-approved: 1");

      // The same file as a DRAFT is nobody's business to refuse.
      writeFileSync(join(born, "docs/plans/newborn.md"), approved.replace("status: approved", "status: draft"));
      git(born, "add -A");
      const draft = Bun.spawnSync(["bun", gate, "--freeze", "docs/plans/newborn.md"], { cwd: born });
      expect(`born-draft: ${draft.exitCode}`).toBe("born-draft: 0");
    }

    // An UNCHANGED rename must pass: the parent lives at the OLD path.
    git(root, "mv docs/plans/subject.md docs/plans/renamed.md");
    const renamed = Bun.spawnSync(["bun", gate, "--freeze", "docs/plans/renamed.md"], { cwd: root });
    expect(renamed.exitCode).toBe(0);

    // The same rename carrying a protected edit must not.
    writeFileSync(join(root, "docs/plans/renamed.md"), approved.replace("`true` exits 0", "`true` exits 1"));
    git(root, "add -A");
    const rewritten = Bun.spawnSync(["bun", gate, "--freeze", "docs/plans/renamed.md"], { cwd: root });
    expect(rewritten.exitCode).toBe(1);
  });

  // @test-id: tst_scripts_plangate_013
  // @invariant: the --freeze CLI's MERGE_HEAD read, on a real merge state.
  //   The reviewer refused the box while this half was proved only by the
  //   in-memory `autoMerged` argument: a plan arriving through a merge is
  //   inherited, not authored, and only a repository with MERGE_HEAD present
  //   can show that the CLI actually reads it.
  it("tst_scripts_plangate_013 inherits a merged plan through the CLI", () => {
    const { root } = makeRepo();
    const gate = join(import.meta.dir, "../src/core/plan-gate.ts");
    mkdirSync(join(root, "docs/plans"), { recursive: true });
    const plan = join(root, "docs/plans/subject.md");
    writeFileSync(plan, approved);
    writeFileSync(join(root, "contested.txt"), "base\n");
    git(root, "add -A");
    git(root, "-c core.hooksPath=/dev/null commit -qm approved-plan");

    // The other side changes the plan's Goal AND collides on another file.
    git(root, "switch -qc theirs");
    writeFileSync(plan, approved.replace("Cut the gate to 90 seconds.", "Cut the gate to 45 seconds and rename the runner."));
    writeFileSync(join(root, "contested.txt"), "theirs\n");
    git(root, "add -A");
    git(root, "-c core.hooksPath=/dev/null commit -qm their-side");

    git(root, "switch -q -");
    writeFileSync(join(root, "contested.txt"), "ours\n");
    git(root, "add -A");
    git(root, "-c core.hooksPath=/dev/null commit -qm our-side");

    // The merge conflicts on contested.txt, so MERGE_HEAD stays present while
    // the plan itself came across untouched by any human.
    Bun.spawnSync(["git", "-C", root, "-c", "core.hooksPath=/dev/null", "merge", "--no-ff", "-m", "merge", "theirs"]);
    expect(Bun.spawnSync(["git", "-C", root, "rev-parse", "-q", "--verify", "MERGE_HEAD"]).exitCode).toBe(0);

    const inherited = Bun.spawnSync(["bun", gate, "--freeze", "docs/plans/subject.md"], { cwd: root });
    expect(inherited.exitCode).toBe(0);

    // BOTH sides touch the plan and git combines them cleanly: ours edits the
    // free stage prose, theirs the protected Goal. The merged file then equals
    // neither parent, and comparing against MERGE_HEAD's blob — theirs — reads
    // our own legitimate prose as an unauthored protected change and REFUSES a
    // merge nobody authored. The comparison has to be git's real auto-merge.
    {
      const two = makeRepo().root;
      mkdirSync(join(two, "docs/plans"), { recursive: true });
      const p = join(two, "docs/plans/subject.md");
      writeFileSync(p, approved);
      writeFileSync(join(two, "contested.txt"), "base\n");
      git(two, "add -A");
      git(two, "-c core.hooksPath=/dev/null commit -qm approved-plan");

      git(two, "switch -qc theirs");
      // NOT merely a number: a changed measurement is a free delta and would
      // normalise away, which is how the first draft of this case passed
      // against the very code it was written to refuse.
      writeFileSync(p, approved.replace("Cut the gate to 90 seconds.", "Cut the gate and rename the runner."));
      writeFileSync(join(two, "contested.txt"), "theirs\n");
      git(two, "add -A");
      git(two, "-c core.hooksPath=/dev/null commit -qm their-side");

      git(two, "switch -q -");
      writeFileSync(p, approved.replace("Context: the runner is where the cost sits.", "Context: the runner is the whole bill."));
      writeFileSync(join(two, "contested.txt"), "ours\n");
      git(two, "add -A");
      git(two, "-c core.hooksPath=/dev/null commit -qm our-side");

      Bun.spawnSync(["git", "-C", two, "-c", "core.hooksPath=/dev/null", "merge", "--no-ff", "-m", "merge", "theirs"]);
      expect(Bun.spawnSync(["git", "-C", two, "rev-parse", "-q", "--verify", "MERGE_HEAD"]).exitCode).toBe(0);
      // The plan itself merged cleanly — no conflict markers in it.
      expect(readFileSync(p, "utf8").includes("<<<<<<<")).toBe(false);

      const both = Bun.spawnSync(["bun", gate, "--freeze", "docs/plans/subject.md"], { cwd: two });
      expect(`both-sides: ${both.exitCode}`).toBe("both-sides: 0");
    }

    // A plan that ARRIVES with the merge — added on their side only. It has no
    // version on ours and none at the base, so a reconstruction that gives up
    // on an absent blob finds no auto-merge to inherit; and the born-APPROVED
    // refusal, judged before inheritance, then calls someone else's landed
    // plan a plan created already approved.
    {
      const add = makeRepo().root;
      mkdirSync(join(add, "docs/plans"), { recursive: true });
      writeFileSync(join(add, "contested.txt"), "base\n");
      git(add, "add -A");
      git(add, "-c core.hooksPath=/dev/null commit -qm base");

      git(add, "switch -qc theirs");
      writeFileSync(join(add, "docs/plans/subject.md"), approved);
      writeFileSync(join(add, "contested.txt"), "theirs\n");
      git(add, "add -A");
      git(add, "-c core.hooksPath=/dev/null commit -qm 'their approved plan'");

      git(add, "switch -q -");
      writeFileSync(join(add, "contested.txt"), "ours\n");
      git(add, "add -A");
      git(add, "-c core.hooksPath=/dev/null commit -qm our-side");

      Bun.spawnSync(["git", "-C", add, "-c", "core.hooksPath=/dev/null", "merge", "--no-ff", "-m", "merge", "theirs"]);
      expect(Bun.spawnSync(["git", "-C", add, "rev-parse", "-q", "--verify", "MERGE_HEAD"]).exitCode).toBe(0);
      git(add, "add docs/plans/subject.md");

      const incoming = Bun.spawnSync(["bun", gate, "--freeze", "docs/plans/subject.md"], { cwd: add });
      expect(`incoming-add: ${incoming.exitCode}`).toBe("incoming-add: 0");
    }

    // A plan RENAMED on their side and carried across by the merge. Our copy
    // lives under the old name, so a reconstruction that reads only the new
    // path compares the arriving file against nothing.
    {
      const ren = makeRepo().root;
      mkdirSync(join(ren, "docs/plans"), { recursive: true });
      writeFileSync(join(ren, "docs/plans/subject.md"), approved);
      writeFileSync(join(ren, "contested.txt"), "base\n");
      git(ren, "add -A");
      git(ren, "-c core.hooksPath=/dev/null commit -qm base");

      git(ren, "switch -qc theirs");
      git(ren, "mv docs/plans/subject.md docs/plans/renamed.md");
      // AND a protected change, theirs to answer for. A rename carrying no
      // content change produces no divergence at all, so it would pass with or
      // without the reconstruction and prove nothing.
      writeFileSync(
        join(ren, "docs/plans/renamed.md"),
        approved.replace("Cut the gate to 90 seconds.", "Cut the gate and rename the runner."),
      );
      writeFileSync(join(ren, "contested.txt"), "theirs\n");
      git(ren, "add -A");
      git(ren, "-c core.hooksPath=/dev/null commit -qm 'their rename'");

      git(ren, "switch -q -");
      // OUR side edits the plan too, under the name it still has here. Without
      // that, an absent blob reconstructs to their copy and the case passes
      // whether or not the rename is followed — proved by mutating the source.
      writeFileSync(
        join(ren, "docs/plans/subject.md"),
        approved.replace("Context: the runner is where the cost sits.", "Context: the runner is the whole bill."),
      );
      writeFileSync(join(ren, "contested.txt"), "ours\n");
      git(ren, "add -A");
      git(ren, "-c core.hooksPath=/dev/null commit -qm our-side");

      Bun.spawnSync(["git", "-C", ren, "-c", "core.hooksPath=/dev/null", "merge", "--no-ff", "-m", "merge", "theirs"]);
      expect(Bun.spawnSync(["git", "-C", ren, "rev-parse", "-q", "--verify", "MERGE_HEAD"]).exitCode).toBe(0);
      git(ren, "add -A");

      const carried = Bun.spawnSync(["bun", gate, "--freeze", "docs/plans/renamed.md"], { cwd: ren });
      expect(`merge-rename: ${carried.exitCode}`).toBe("merge-rename: 0");
    }

    // The rename in the OTHER orientation: WE renamed the plan, they modified
    // it under the name it had. The staged transaction reads `M renamed.md` —
    // no rename in it at all — so the reconstruction looked for their copy and
    // the base at a path that never existed on their side, found nothing, and
    // rebuilt our file alone. Their legitimate landed edit then read as ours.
    // This repository really does this: R099 on
    // docs/plans/episode-storage-and-state-machine.md.
    {
      const ours = makeRepo().root;
      mkdirSync(join(ours, "docs/plans"), { recursive: true });
      writeFileSync(join(ours, "docs/plans/subject.md"), approved);
      writeFileSync(join(ours, "contested.txt"), "base\n");
      git(ours, "add -A");
      git(ours, "-c core.hooksPath=/dev/null commit -qm base");

      git(ours, "switch -qc theirs");
      writeFileSync(
        join(ours, "docs/plans/subject.md"),
        approved.replace("Cut the gate to 90 seconds.", "Cut the gate and rename the runner."),
      );
      writeFileSync(join(ours, "contested.txt"), "theirs\n");
      git(ours, "add -A");
      git(ours, "-c core.hooksPath=/dev/null commit -qm 'their protected edit'");

      git(ours, "switch -q -");
      git(ours, "mv docs/plans/subject.md docs/plans/renamed.md");
      writeFileSync(join(ours, "contested.txt"), "ours\n");
      git(ours, "add -A");
      git(ours, "-c core.hooksPath=/dev/null commit -qm 'our rename'");

      Bun.spawnSync(["git", "-C", ours, "-c", "core.hooksPath=/dev/null", "merge", "--no-ff", "-m", "merge", "theirs"]);
      expect(Bun.spawnSync(["git", "-C", ours, "rev-parse", "-q", "--verify", "MERGE_HEAD"]).exitCode).toBe(0);
      git(ours, "add -A");

      const reverse = Bun.spawnSync(["bun", gate, "--freeze", "docs/plans/renamed.md"], { cwd: ours });
      expect(`ours-renamed-theirs-modified: ${reverse.exitCode}`).toBe("ours-renamed-theirs-modified: 0");
    }

    // The plan itself CONFLICTS. This is the one shape where a human's hand is
    // certainly on the protected text, and no test had ever reached it: every
    // other merge case conflicts in some other file while the plan merges
    // clean. Per-file granularity is the whole reason the conflicted set is
    // read instead of the merge's exit status, and nothing pinned it.
    {
      const clash = makeRepo().root;
      mkdirSync(join(clash, "docs/plans"), { recursive: true });
      const p = join(clash, "docs/plans/subject.md");
      writeFileSync(p, approved);
      git(clash, "add -A");
      git(clash, "-c core.hooksPath=/dev/null commit -qm base");

      git(clash, "switch -qc theirs");
      writeFileSync(p, approved.replace("Cut the gate to 90 seconds.", "Cut the gate and rename the runner."));
      git(clash, "add -A");
      git(clash, "-c core.hooksPath=/dev/null commit -qm theirs");

      git(clash, "switch -q -");
      writeFileSync(p, approved.replace("Cut the gate to 90 seconds.", "Cut the gate and delete the runner."));
      git(clash, "add -A");
      git(clash, "-c core.hooksPath=/dev/null commit -qm ours");

      // Merge by SHA, not by ref name. That is the whole difference: git
      // labels a conflict hunk with whatever it was given, and `--freeze`
      // reconstructs from the resolved MERGE_HEAD sha — so a merge by NAME
      // produces markers that differ from the reconstruction and the content
      // check refuses first, while a merge by SHA produces markers identical
      // to it. Only the second reaches the conflicted set, which is why this
      // case had to be written this way to pin anything at all.
      const theirsSha = git(clash, "rev-parse theirs");
      Bun.spawnSync(["git", "-C", clash, "-c", "core.hooksPath=/dev/null", "merge", "--no-ff", "-m", "merge", theirsSha]);
      expect(readFileSync(p, "utf8").includes("<<<<<<<")).toBe(true);

      // Staged AS IS, markers and all — a plan nobody resolved, offered as
      // though the merge had produced it. Because the merge above used a SHA,
      // what is staged now equals git's own conflicted blob byte for byte, so
      // the content comparison cannot tell them apart and the conflicted set
      // is the ONLY refusal left. An earlier version of this case merged by
      // ref name, could not reach the guard, and led me to write in the source
      // that no such input existed — instructing the next reader to delete a
      // load-bearing check.
      git(clash, "add -A");
      const staged = Bun.spawnSync(["bun", gate, "--freeze", "docs/plans/subject.md"], { cwd: clash });
      expect(`markers-staged: ${staged.exitCode}`).toBe("markers-staged: 1");
    }

    // A HAND resolution landing different protected text is authored work.
    writeFileSync(plan, approved.replace("Cut the gate to 90 seconds.", "Cut the gate and do whatever else seems right."));
    git(root, "add docs/plans/subject.md");
    const authored = Bun.spawnSync(["bun", gate, "--freeze", "docs/plans/subject.md"], { cwd: root });
    expect(authored.exitCode).toBe(1);
  });
});
