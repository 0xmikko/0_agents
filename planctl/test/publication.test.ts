import { expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { approvePlan, createDraftPlan, lockPlanSpec, putDelivery, putStage, recordDeviation, replaceDraftSpec } from "../src/core/plan-update";
import { publishDelivery, recordCompleteGate } from "../src/core/publication";

function approvedFixture(base: string, review: "required" | "none"): string {
  let body = replaceDraftSpec(createDraftPlan("One publication"), "## The Goal\nDeliver one tested behavior.\n\n## The target\nNo contracts change.").body;
  body = lockPlanSpec(body, "spec").body;
  body = putDelivery(body, { id: "D1", review, title: "One publication", branch: "feat/publication", depends: [], gate: ["bun run agent:verify:pr"],
    active: true, stageGraph: "D1-S1", predictedExternalWaitMinutes: 0, description: "Deliver one tested change." }).body;
  body = putStage(body, { id: "D1-S1", deliveryId: "D1", title: "One complete change", owner: "agent", profile: "fast", depends: [], parallelWith: [],
    writes: ["src/"], tempRoot: ".tmp/code-production/fixture/D1-S1", predictedActiveMinutes: 2, predictedCredits: 0, verifyActiveMinutes: 1, verifyCredits: 0,
    description: "Implement and prove the requested behavior.", tasks: [{ id: "WORK", story: "Implement the requested observable behavior.", writes: ["src/"],
      predictedActiveMinutes: 1, predictedCredits: 0, how: "Change the owning module and exercise its behavior.", red: "bun run agent:test:backend -- test/behavior.test.ts" }],
    criteria: ["`bun run agent:verify:pr` exits 0 — complete local gate", "Commit"],
  }).body;
  body = approvePlan(body, "plan").body.replace(/^- \[ \] (.*)$/gm, `- [x] $1 — ${base}`);
  return body;
}

/**
 * @test-id: tst_unit_planctl_publication_001
 * @scenario: scn_planctl_publish_once_001
 * @covers: planctl/src/core/publication.ts::publishDelivery, shared/code-production/templates/hooks/pre-push
 * @deterministic: yes
 * @invariant: local verification and review precede the real Git push; repeated publication
 * does not push again; protected branches and a direct push without intent are refused.
 */
it.each(["required", "none"] as const)("tst_unit_planctl_publication_001 publishes once with review=%s", async (review) => {
  const directory = mkdtempSync(join(tmpdir(), "planctl-publication-"));
  const root = join(directory, "work"); const remote = join(directory, "remote");
  mkdirSync(root); mkdirSync(remote);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    execFileSync("git", ["init", "--bare", "-q", remote]);
    git("init", "-q", "-b", "main"); git("config", "user.email", "test@example.com"); git("config", "user.name", "Test");
    git("config", "code-production.base", "main");
    git("remote", "add", "origin", remote);
    git("commit", "--allow-empty", "-qm", "base"); const base = git("rev-parse", "HEAD");
    git("checkout", "-qb", "feat/publication");
    const plan = "docs/plans/fixture.md";
    mkdirSync(join(root, "docs/plans"), { recursive: true });
    let body = approvedFixture(base, review);
    writeFileSync(join(root, plan), body);
    // Verification commands are test-owned stand-ins; publication must reuse the recorded gate.
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { "agent:verify:docs": "true", "agent:verify:pr": "false" } }));
    mkdirSync(join(root, ".agents/code-production/runtime"), { recursive: true });
    writeFileSync(join(root, ".agents/code-production/runtime/planctl.ts"), "process.exit(0);\n");
    const hook = readFileSync(join(import.meta.dir, "../../shared/code-production/templates/hooks/pre-push"), "utf8");
    writeFileSync(join(root, ".git/hooks/pre-push"), hook, { mode: 0o755 });
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/internal.ts"), "export interface WriterInput { id: string }\n");
    git("add", "."); git("commit", "-qm", "implementation");
    const head = git("rev-parse", "HEAD");
    let created = false; let calls = 0; let interrupted = false;
    const github = (_root: string, args: readonly string[]) => {
      calls++;
      if (args[1] === "list") return JSON.stringify(created ? [{ url: "https://example.test/pull/1", state: "OPEN", isDraft: false,
        headRefOid: git("ls-remote", "--heads", "origin", "refs/heads/feat/publication").split(/\s/)[0], baseRefName: "main" }] : []);
      if (args[1] === "create") { if (!interrupted) { interrupted = true; throw new Error("Simulated interruption after push"); } created = true; return "https://example.test/pull/1"; }
      throw new Error("Unexpected GitHub operation");
    };
    const input = { plan: join(root, plan), delivery: "D1", expectedHead: head, phase: "implementation" as const,
      ...(review === "required" ? { reviewPath: "review.md" } : {}) };
    await expect(publishDelivery(input, { github })).rejects.toThrow(/local gate/);
    expect(calls).toBe(0);
    recordCompleteGate(root, plan, "bun run agent:verify:pr");
    if (review === "required") {
      await expect(publishDelivery(input, { github })).rejects.toThrow(/review is missing/);
      expect(calls).toBe(0);
      writeFileSync(join(root, "review.md"), `Reviewed-Head: ${head}\nREVIEW VERDICT: APPROVED\n\nNo blocking findings.\n`);
    }
    await expect(publishDelivery(input, { github })).rejects.toThrow(/Simulated interruption/);
    const first = await publishDelivery(input, { github });
    expect(first).toMatchObject({ pushed: false, url: "https://example.test/pull/1" });
    expect(git("ls-remote", "--heads", "origin", "refs/heads/feat/publication")).toContain(head);
    expect((await publishDelivery(input, { github })).pushed).toBe(false);
    git("commit", "--allow-empty", "-qm", "intermediate checkpoint");
    expect(() => git("push", "origin", "HEAD:refs/heads/feat/publication")).toThrow();
    expect(() => git("push", "origin", "HEAD:refs/heads/staging")).toThrow();
    expect(git("ls-remote", "--heads", "origin", "refs/heads/staging")).toBe("");
    // One diagnosed CI correction is already authorized; it does not change the contract.
    const repair = (reason: string) => {
      body = recordDeviation(body, "D1-S1", reason).body;
      writeFileSync(join(root, plan), body);
      git("add", plan); git("commit", "-qm", reason);
      const current = git("rev-parse", "HEAD");
      recordCompleteGate(root, plan, "bun run agent:verify:pr");
      if (review === "required") writeFileSync(join(root, "review.md"), `Reviewed-Head: ${current}\nREVIEW VERDICT: APPROVED\n`);
      return { ...input, expectedHead: current };
    };
    const repairInput = repair("CI failed on the published build; corrected its packaging and verified locally.");
    await expect(publishDelivery(repairInput, { github })).rejects.toThrow(/observed CI failure/);
    const failed = () => ({ prUrl: "https://example.test/pull/1", ci: "red" as const, headSha: head, runId: "1", attempt: 1, merged: false });
    expect((await publishDelivery(repairInput, { github, publication: failed })).pushed).toBe(true);
    expect((await publishDelivery(repairInput, { github, publication: failed })).pushed).toBe(false);
    const again = repair("A second CI failure was diagnosed.");
    await expect(publishDelivery(again, { github, publication: failed })).rejects.toThrow(/retry budget/);
    expect(git("ls-remote", "--heads", "origin", "refs/heads/feat/publication")).toContain(repairInput.expectedHead);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

/** @test-id: tst_unit_planctl_publication_002
 * @scenario: scn_planctl_plan_only_001
 * @covers: planctl/src/core/publication.ts::publishDelivery
 * @deterministic: yes
 * @invariant: a plan never triggers CI; lost PR acknowledgement does not create another PR.
 */
it.each(["excluded", "runs", "target"] as const)("tst_unit_planctl_publication_002 checks %s workflows and recovers the draft", async (mode) => {
  const directory = mkdtempSync(join(tmpdir(), "planctl-draft-publication-"));
  const root = join(directory, "work"); const remote = join(directory, "remote");
  mkdirSync(root); mkdirSync(remote);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    execFileSync("git", ["init", "--bare", "-q", remote]);
    git("init", "-q", "-b", "main"); git("config", "user.email", "test@example.com"); git("config", "user.name", "Test");
    git("config", "code-production.base", "main"); git("remote", "add", "origin", remote);
    mkdirSync(join(root, ".github/workflows"), { recursive: true });
    const excluded = "    paths-ignore: ['docs/plans/**']\n";
    writeFileSync(join(root, ".github/workflows/check.yml"), `name: Check\non:\n  push:\n${mode === "runs" ? "" : excluded}  pull_request:\n${excluded}${mode === "target" ? "  pull_request_target:\n" : ""}`);
    git("add", "."); git("commit", "-qm", "workflow");
    const base = git("rev-parse", "HEAD");
    git("checkout", "-qb", "feat/publication");
    const plan = "docs/plans/fixture.md";
    mkdirSync(join(root, "docs/plans"), { recursive: true });
    writeFileSync(join(root, plan), approvedFixture(base, "none"));
    git("add", plan); git("commit", "-qm", "approved plan");
    const head = git("rev-parse", "HEAD");
    let created = 0; let ready = 0; let draft = true;
    const github = (_root: string, args: readonly string[]) => {
      if (args[1] === "list") return JSON.stringify(created ? [{
        url: "https://example.test/pull/2", state: "OPEN", isDraft: draft, headRefOid: head, baseRefName: "main",
      }] : []);
      if (args[1] === "create") {
        expect(args).toContain("--draft");
        created++;
        throw new Error("PR created but acknowledgement lost");
      }
      if (args[1] === "ready") { ready++; draft = false; return ""; }
      throw new Error("Unexpected GitHub operation");
    };
    const input = { plan: join(root, plan), delivery: "D1", expectedHead: head, phase: "plan" as const };
    if (mode !== "excluded") {
      await expect(publishDelivery(input, { github })).rejects.toThrow(/do not exclude/);
      expect(created).toBe(0);
      expect(git("ls-remote", "--heads", "origin")).toBe("");
    } else {
      await expect(publishDelivery(input, { github })).rejects.toThrow(/acknowledgement lost/);
      expect((await publishDelivery(input, { github })).pushed).toBe(false);
      expect(created).toBe(1);
      recordCompleteGate(root, plan, "bun run agent:verify:pr");
      expect((await publishDelivery({ ...input, phase: "implementation" }, { github })).pushed).toBe(false);
      expect(ready).toBe(1);
      expect((await publishDelivery({ ...input, phase: "implementation" }, { github })).pushed).toBe(false);
      expect(ready).toBe(1);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
