import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { dispatchTool, toolNames } from "../src/mcp/server";
import { deliveryMetas, mutatePlanFile, planJournalPath, taskRunPath, verifyStagedPlan } from "../src/core/plan-update";
import { decodeTaskRun } from "../src/core/task-run";
import { protocolImplementationHash, protocolSpecHash } from "../src/core/plan-update";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { installStack } from "../../shared/code-production/agent-stack";

interface Fixture {
  readonly root: string;
  readonly git: (...args: readonly string[]) => string;
}

function fixture(name: string): Fixture {
  const root = mkdtempSync(join(tmpdir(), `planctl-mcp-${name}-`));
  const git = (...args: readonly string[]): string => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("commit", "-q", "--allow-empty", "-m", "the repository");
  git("config", "code-production.base", "main");
  git("checkout", "-qb", `feat/${name}`);
  for (const [path, text] of [["src/change.ts", "export const change = 1;\n"], ["src/save.ts", "export const save = 1;\n"], ["test/change.test.ts", "export {};\n"]] as const) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  git("add", "src", "test");
  git("commit", "-qm", "the files the SPEC cites");
  return { root, git };
}

function approvalRevision(name: string, path: string): { expectedRevision?: string } {
  if (name === "approve_spec") return { expectedRevision: protocolSpecHash(readFileSync(path, "utf8")) };
  if (name === "approve_plan") return { expectedRevision: protocolImplementationHash(readFileSync(path, "utf8")) };
  return {};
}

const delivery = {
  id: "D1", title: "Foundation", branch: "feat/foundation", depends: [], gate: ["scripts"], active: true,
  stageGraph: "D1-S1", predictedExternalWaitMinutes: 0,
  description: "What changed for people. The fixture answers over stdio.\n\nWhat changed in the code. One server.\n\nHow it was proven. This suite.",
};
const stage = {
  id: "D1-S1", deliveryId: "D1", title: "One tool sequence", owner: "agent", profile: "fast", depends: [], parallelWith: [],
  writes: ["scripts/"], tempRoot: ".tmp/code-production/fixture/D1-S1", predictedActiveMinutes: 10, predictedCredits: 2,
  verifyActiveMinutes: 2, verifyCredits: 1,
  description: "feat(fixture): one observable behavior\n\nDone for the Goal. The fixture writes one file.\n\nProven by this suite.",
  tasks: [{ id: "MCP_FIX_001", story: "produce one observable fixture behavior in scripts/base.ts", writes: ["scripts/base.ts", "scripts/extra.ts", "scripts/more.ts"], predictedActiveMinutes: 8, predictedCredits: 1, how: "change scripts/base.ts so the behavior exists", red: "bun run agent:test:backend -- test/mcp.test.ts" }],
  criteria: ["`true` exits 0 — the behavior is proven", "Commit"],
};

function text(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as readonly { type: string; text?: string }[];
  return content.map((entry) => entry.text ?? "").join("\n");
}

describe("planctl mcp", () => {
  const home = mkdtempSync(join(tmpdir(), "planctl-mcp-home-"));
  const client = new Client({ name: "mcp-test", version: "0.0.0" });
  const repositories = [fixture("alpha"), fixture("beta")];

  const publisher = join(home, "publish.sh");
  writeFileSync(publisher, "#!/bin/sh\nsha256sum \"$1\" | cut -c1-64 > \"$(dirname \"$0\")/published-$2\"\necho \"http://fixture/$2\"\n", { mode: 0o755 });

  beforeAll(async () => {
    await client.connect(new StdioClientTransport({
      command: "bun",
      args: [join(import.meta.dir, "../src/cli/main.ts"), "mcp", "--publisher", publisher],
      cwd: home,
      env: { ...process.env, HOME: home },
      stderr: "pipe",
    }));
  });

  afterAll(async () => {
    await client.close();
    for (const { root } of repositories) rmSync(root, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  /**
   * @test-id: tst_unit_planctl_mcp_010
   * @scenario: scn_planctl_mcp_journal_001
   * @covers: planctl/src/mcp/server.ts::createPlanctlServer,planctl/src/core/plan-update.ts::mutatePlanFile
   * @deterministic: yes
   * @invariant: the MCP client is told that journal cleanup is automatic; later writes reconcile committed journals without a shell cleanup, while raw plan edits remain refused.
   */
  it("tst_unit_planctl_mcp_010 continues after commits without manual journal cleanup", async () => {
    const { root, git } = fixture("journal-continuation");
    try {
      const started = await client.callTool({ name: "init", arguments: { root, title: "Journal continuation" } });
      expect(started.isError ?? false, text(started)).toBe(false);
      const { plan } = started.structuredContent as { plan: string };
      const absolute = join(root, plan);
      const journal = planJournalPath(root, plan);
      git("commit", "-qm", "create the draft");
      // No post-commit cleanup: an older hook also leaves the per-plan journal in place.
      expect(existsSync(journal)).toBe(true);

      const progress = await client.callTool({ name: "progress", arguments: { root } });
      expect(progress.isError ?? false, text(progress)).toBe(false);
      const spec = readFileSync(join(import.meta.dir, "fixtures/plan-lint.md"), "utf8");
      const submitted = await client.callTool({ name: "submit_spec", arguments: {
        plan: absolute, baseRevision: (progress.structuredContent as { revision: string }).revision,
        ownerRequest: "Reject empty names", spec,
      } });
      expect(submitted.isError ?? false, text(submitted)).toBe(false);
      verifyStagedPlan(root, plan);
      git("commit", "-qm", "write the specification");
      writeFileSync(join(root, "notes.md"), "Research continues.\n");
      git("add", "notes.md");
      git("commit", "-qm", "save research notes");
      const head = git("rev-parse", "HEAD");

      const updated = await client.callTool({ name: "submit_spec", arguments: {
        plan: absolute, baseRevision: (submitted.structuredContent as { revision: string }).revision,
        ownerRequest: "Use the measured baseline", spec: spec.replace("three per release", "five per release"),
      } });
      expect(updated.isError ?? false, text(updated)).toBe(false);
      verifyStagedPlan(root, plan);
      expect(JSON.parse(readFileSync(journal, "utf8"))).toMatchObject({
        baseHead: head, events: [expect.objectContaining({ operation: "set-spec" })],
      });
      git("commit", "-qm", "record the measured baseline");

      const raw = `${readFileSync(absolute, "utf8")}\nUnjournaled edit.\n`;
      writeFileSync(absolute, raw);
      const refused = await client.callTool({ name: "submit_spec", arguments: {
        plan: absolute, baseRevision: protocolSpecHash(raw), ownerRequest: "Reject empty names", spec,
      } });
      expect(refused.isError).toBe(true);
      expect(text(refused)).toContain("dirty preimage");
      expect(readFileSync(absolute, "utf8")).toBe(raw);

      expect(client.getInstructions()).toMatch(/journal cleanup is automatic/i);
      expect(client.getInstructions()).toContain("clear-transaction");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);

  /**
   * @test-id: tst_unit_planctl_mcp_011
   * @scenario: scn_planctl_approval_commit_001
   * @covers: planctl/src/mcp/server.ts, planctl/src/core/plan-gate.ts::freeze CLI
   * @deterministic: yes
   * @fixtures: temporary consumer with installed Git hooks; synthetic owner words
   * @invariant: the documented MCP approval sequence commits once with real hooks;
   * raw edits and a missing journal remain refused, and failed commits preserve approvals.
   * Test environment: stdio MCP and installed runtime, no consumer dependencies.
   * Clients: MCP Client and Git. Mocks: project verification exits, mdurl publisher.
   */
  it("tst_unit_planctl_mcp_011 commits MCP approvals through installed hooks without recreating the plan", async () => {
    const { root, git } = fixture("approval-commit");
    try {
      const scripts = Object.fromEntries([
        "agent:install", "agent:test:backend", "agent:test:frontend", "agent:test:e2e",
        "agent:verify:commit", "agent:verify:pr", "agent:verify:docs",
      ].map((name) => [name, "true"]));
      writeFileSync(join(root, "package.json"), JSON.stringify({ name: "approval-fixture", scripts }));
      installStack(root, { base: "main" });
      git("add", ".");
      git("commit", "-qm", "install the consumer hooks");
      const before = git("rev-parse", "HEAD");
      const started = await client.callTool({ name: "init", arguments: { root, title: "Keep the recorded approval" } });
      expect(started.isError ?? false, text(started)).toBe(false);
      const plan = (started.structuredContent as { plan: string }).plan;
      const absolute = join(root, plan);
      const seen = await client.callTool({ name: "progress", arguments: { root } });
      const spec = readFileSync(join(import.meta.dir, "fixtures/plan-lint.md"), "utf8");
      for (const [name, args] of [
        ["submit_spec", { baseRevision: (seen.structuredContent as { revision: string }).revision, ownerRequest: "Reject empty names", spec }],
        ["approve_spec", { ownerWord: "spec" }],
        ["put_delivery", { delivery }],
        ["put_stage", { stage }],
        ["approve_plan", { ownerWord: "plan" }],
      ] as const) {
        const result = await client.callTool({ name, arguments: { plan: absolute, ...args, ...approvalRevision(name, absolute) } });
        expect(result.isError ?? false, text(result)).toBe(false);
      }
      const approved = readFileSync(absolute, "utf8");
      const journal = planJournalPath(root, plan);
      const proof = readFileSync(journal, "utf8");
      const commit = () => spawnSync("git", ["commit", "-qm", "record the approved plan"], { cwd: root, encoding: "utf8" });
      const committed = commit();
      expect(committed.status, `${committed.stdout}\n${committed.stderr}`).toBe(0);
      expect(git("rev-list", "--count", `${before}..HEAD`)).toBe("1");
      expect(git("show", `HEAD:${plan}`)).toBe(approved.trim());
      expect(existsSync(journal)).toBe(false);

      // Recreate the same staged state in this test-owned repository to inject faults.
      // Never reset a user's checkout or retry a denied real approval.
      git("reset", "--soft", before);
      // Exhaust all 16 combinations of these four validity conditions:
      // the intact case succeeded above; every nonzero fault mask must fail.
      for (let faults = 1; faults < 16; faults += 1) {
        writeFileSync(absolute, approved);
        const changed: { baseHead: string; events: { beforeHash: string }[] } = JSON.parse(proof);
        if (faults & 2) writeFileSync(absolute, `${approved}\nUnjournaled change.\n`);
        if (faults & 4) {
          const first = changed.events[0];
          if (first === undefined) throw new Error("fixture must contain a creation event");
          first.beforeHash = "0".repeat(64);
        }
        if (faults & 8) changed.baseHead = "0".repeat(40);
        writeFileSync(journal, JSON.stringify(changed));
        if (faults & 1) rmSync(journal);
        git("add", plan);
        const refused = commit();
        expect(refused.status, `fault mask ${faults}`).not.toBe(0);
        expect(`${refused.stdout}${refused.stderr}`).toMatch(/journal|candidate|chain/i);
        expect(readFileSync(absolute, "utf8")).toContain("Status: APPROVED");
        expect(git("rev-parse", "HEAD")).toBe(before);
      }
      writeFileSync(absolute, approved);
      writeFileSync(journal, proof);
      git("add", plan);
      const retried = commit();
      expect(retried.status, `${retried.stdout}\n${retried.stderr}`).toBe(0);
      expect(existsSync(journal)).toBe(false);

      const amended = await client.callTool({ name: "amend", arguments: {
        plan: absolute, ownerWord: "rename the title", patch: {
          section: "title", find: "Keep the recorded approval", replace: "Preserve the recorded agreement",
        },
      } });
      expect(amended.isError ?? false, text(amended)).toBe(false);
      const amendmentCommit = commit();
      expect(amendmentCommit.status, `${amendmentCommit.stdout}\n${amendmentCommit.stderr}`).toBe(0);
      expect(readFileSync(absolute, "utf8")).toContain("Preserve the recorded agreement");
      expect(existsSync(journal)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);

  /**
   * @test-id: tst_unit_planctl_mcp_001
   * @scenario: scn_planctl_mcp_sequence_001
   * @covers: planctl/src/mcp/server.ts
   * @deterministic: yes
   * @invariant: one server launched elsewhere serves two repositories through the execution sequence, routes a planless progress by root, refuses with a reason, rejects a malformed argument, and keeps each journal inside its repository.
   */
  it("tst_unit_planctl_mcp_001 drives two repositories through init, put_stage, start, owner wait, complete, close and progress", async () => {
    for (const { root, git } of repositories) {
      const started = await client.callTool({ name: "init", arguments: { root, title: "Fixture plan" } });
      expect(started.isError ?? false, text(started)).toBe(false);
      const plan = (started.structuredContent as { plan: string }).plan;
      expect(plan).toMatch(/^docs\/plans\/\d{4}-\d{2}-\d{2}-(alpha|beta)\.md$/);
      expect((started.structuredContent as { sections: string[] }).sections).toContain("The Goal");
      const absolute = join(root, plan);
      const spec = readFileSync(join(import.meta.dir, "fixtures/plan-lint.md"), "utf8").replace("Reduce invalid changes from three per release to zero.", "Ship one observable result.");
      writeFileSync(join(home, "spec.md"), spec);
      execFileSync("bun", [join(import.meta.dir, "../src/cli/main.ts"), "set-spec", plan, "--from", join(home, "spec.md")], { cwd: root });

      const locked = await client.callTool({ name: "approve_spec", arguments: { plan: absolute, ownerWord: "spec", expectedRevision: protocolSpecHash(readFileSync(absolute, "utf8")) } });
      expect(locked.isError ?? false, text(locked)).toBe(false);
      const putDelivery = await client.callTool({ name: "put_delivery", arguments: { plan: absolute, delivery } });
      expect(putDelivery.isError ?? false, text(putDelivery)).toBe(false);
      const putStage = await client.callTool({ name: "put_stage", arguments: { plan: absolute, stage } });
      expect(putStage.isError ?? false, text(putStage)).toBe(false);
      expect((putStage.structuredContent as { findings: unknown[] }).findings).toEqual([]);
      const approved = await client.callTool({ name: "approve_plan", arguments: { plan: absolute, ownerWord: "plan", expectedRevision: protocolImplementationHash(readFileSync(absolute, "utf8")) } });
      expect(approved.isError ?? false, text(approved)).toBe(false);
      expect(readFileSync(absolute, "utf8")).toContain("Status: APPROVED");

      const brief = await client.callTool({ name: "start_task", arguments: { plan: absolute } });
      expect(brief.isError ?? false, text(brief)).toBe(false);
      expect((brief.structuredContent as { taskId: string }).taskId).toBe("MCP_FIX_001");
      expect(text(brief)).toContain("Goal: Ship one observable result.");

      const waiting = await client.callTool({ name: "needs_owner", arguments: {
        plan: absolute, task: "MCP_FIX_001", context: "Keep or drop empty names",
        options: [{ label: "keep", consequence: "empty names reach storage" }, { label: "drop", consequence: "callers see a refusal" }],
        recommendation: "drop", answerForm: "keep or drop",
      } });
      expect(waiting.isError ?? false, text(waiting)).toBe(false);
      const resumed = await client.callTool({ name: "resume_task", arguments: { plan: absolute, task: "MCP_FIX_001" } });
      expect(resumed.isError ?? false, text(resumed)).toBe(false);
      expect((resumed.structuredContent as { cleared: boolean }).cleared).toBe(true);

      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(join(root, "scripts/base.ts"), "export const base = 1;\n");
      git("add", "-A");
      git("commit", "-qm", "work");
      const commit = git("rev-parse", "HEAD");
      const refused = await client.callTool({ name: "complete_task", arguments: { plan: absolute, taskIds: ["MCP_FIX_001"], commit: "0".repeat(40), result: "nothing" } });
      expect(refused.isError).toBe(true);
      expect(text(refused)).toMatch(/descend|ancestral|cannot inspect/);
      const done = await client.callTool({ name: "complete_task", arguments: { plan: absolute, taskIds: ["MCP_FIX_001"], commit, result: "base behavior shipped" } });
      expect(done.isError ?? false, text(done)).toBe(false);
      expect((done.structuredContent as { paths: string[] }).paths).toEqual(["scripts/base.ts"]);
      const closed = await client.callTool({ name: "close_stage", arguments: { plan: absolute, stage: "D1-S1" } });
      expect(closed.isError ?? false, text(closed)).toBe(false);
      expect((closed.structuredContent as { status: string }).status).toBe("CLOSED");
      expect(readFileSync(absolute, "utf8")).toMatch(/^Ledger: implemented/m);
      expect((closed.structuredContent as { url: string }).url).toBe(`http://fixture/${plan.slice("docs/plans/".length, -3)}`);
      expect(text(closed)).toMatch(/^Plan: http:\/\/fixture\//);

      const progress = await client.callTool({ name: "progress", arguments: { root } });
      expect(progress.isError ?? false, text(progress)).toBe(false);
      expect((progress.structuredContent as { plan: string; wholePlan: { completedTasks: number } }).plan).toBe(plan);
      expect((progress.structuredContent as { wholePlan: { completedTasks: number } }).wholePlan.completedTasks).toBe(1);

      const malformed = await client.callTool({ name: "start_task", arguments: { plan: absolute, task: 42 } });
      expect(malformed.isError).toBe(true);
      expect(text(malformed)).toContain("task");
      expect(existsSync(planJournalPath(root, plan))).toBe(true);
    }
    expect(existsSync(join(home, ".git"))).toBe(false);
  }, 120_000);

  /**
   * @test-id: tst_unit_planctl_mcp_005
   * @scenario: scn_planctl_mcp_repository_001
   * @covers: planctl/src/mcp/server.ts::put_delivery
   * @deterministic: yes
   * @invariant: put_delivery carries the repository name into the plan, and a Delivery without one stays the plan's own.
   */
  it("tst_unit_planctl_mcp_005 put_delivery carries the repository of a Delivery", async () => {
    const { root } = fixture("epsilon");
    const deps = { cwd: home, publication: () => null, sourceCommit: "s".repeat(40), eventLog: join(home, "events-005.jsonl"), publisher: (_repository: string, plan: string) => `http://fixture/${plan}` };
    const spec = readFileSync(join(import.meta.dir, "fixtures/plan-lint.md"), "utf8").replace("Reduce invalid changes from three per release to zero.", "Ship one observable result.");
    try {
      const started = await dispatchTool(deps, "init", { root, title: "Epsilon plan" });
      const absolute = join(root, (started.structuredContent as { plan: string }).plan);
      const seen = await dispatchTool(deps, "progress", { root });
      await dispatchTool(deps, "submit_spec", { plan: absolute, baseRevision: (seen.structuredContent as { revision: string }).revision, ownerRequest: "Reject empty names", spec });
      const locked = await dispatchTool(deps, "approve_spec", { plan: absolute, ownerWord: "spec", expectedRevision: protocolSpecHash(readFileSync(absolute, "utf8")) });
      expect(locked.isError ?? false, text(locked)).toBe(false);
      const catalog = await dispatchTool(deps, "put_delivery", { plan: absolute, delivery: { ...delivery, id: "D2", title: "Catalog side", branch: "feat/catalog", active: false, stageGraph: "D2-S1", repository: "catalog" } });
      expect(catalog.isError ?? false, text(catalog)).toBe(false);
      const body = readFileSync(absolute, "utf8");
      expect(body).toContain('"repository":"catalog"');
      expect(deliveryMetas(body).find((entry) => entry.id === "D2")?.repository).toBe("catalog");
      const own = await dispatchTool(deps, "put_delivery", { plan: absolute, delivery });
      expect(own.isError ?? false, text(own)).toBe(false);
      expect(deliveryMetas(readFileSync(absolute, "utf8")).find((entry) => entry.id === "D1")?.repository).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);

  /**
   * @test-id: tst_unit_planctl_mcp_009
   * @scenario: scn_planctl_mcp_repository_002
   * @covers: planctl/src/mcp/server.ts::start_task; planctl/src/core/plan-update.ts::parentRefusal
   * @deterministic: yes
   * @invariant: progress and start_task observe a parent in its configured repository; the parent's current head is resolved there even when the plan repository has a branch with the same name.
   */
  it("tst_unit_planctl_mcp_009 starts a child using the parent PR and head from the app checkout", async () => {
    const catalog = fixture("parent-catalog");
    const app = fixture("parent-app");
    const calls: { root: string; branch: string }[] = [];
    const head = app.git("rev-parse", "HEAD");
    let publishedHead = head;
    const deps = {
      cwd: home,
      publication: (root: string, branch: string) => {
        calls.push({ root, branch });
        return root === app.root && branch === delivery.branch
          ? { prUrl: "https://example.test/app/pull/299", ci: "green" as const, headSha: publishedHead, runId: "1", attempt: 1, merged: false }
          : null;
      },
      sourceCommit: "s".repeat(40), eventLog: join(home, "events-009.jsonl"),
      publisher: (_repository: string, plan: string) => `http://fixture/${plan}`,
    };
    try {
      app.git("checkout", "-qb", delivery.branch);
      catalog.git("commit", "-q", "--allow-empty", "-m", "the catalog has a different head");
      catalog.git("branch", delivery.branch);
      catalog.git("config", "code-production.repository.app", app.root);
      const started = await dispatchTool(deps, "init", { root: catalog.root, title: "Continue after the app CI passes" });
      const absolute = join(catalog.root, (started.structuredContent as { plan: string }).plan);
      const seen = await dispatchTool(deps, "progress", { root: catalog.root });
      const spec = readFileSync(join(import.meta.dir, "fixtures/plan-lint.md"), "utf8").replace("Reduce invalid changes from three per release to zero.", "Ship one observable result.");
      const submitted = await dispatchTool(deps, "submit_spec", { plan: absolute, baseRevision: (seen.structuredContent as { revision: string }).revision, ownerRequest: "Continue after the app CI passes", spec });
      expect(submitted.isError ?? false, text(submitted)).toBe(false);
      const locked = await dispatchTool(deps, "approve_spec", { plan: absolute, ownerWord: "spec", expectedRevision: protocolSpecHash(readFileSync(absolute, "utf8")) });
      expect(locked.isError ?? false, text(locked)).toBe(false);
      for (const [name, args] of [
        ["put_delivery", { delivery: { ...delivery, repository: "app" } }],
        ["put_stage", { stage }],
        ["put_delivery", { delivery: { ...delivery, id: "D2", title: "Catalog", branch: "feat/parent-catalog", depends: ["D1"], active: false, stageGraph: "D2-S1" } }],
        ["put_stage", { stage: { ...stage, id: "D2-S1", deliveryId: "D2", tempRoot: ".tmp/code-production/fixture/D2-S1", tasks: stage.tasks.map((task) => ({ ...task, id: "MCP_FIX_002" })) } }],
        ["approve_plan", { ownerWord: "plan" }],
      ] as const) {
        const result = await dispatchTool(deps, name, { plan: absolute, ...args, ...approvalRevision(name, absolute) });
        expect(result.isError ?? false, text(result)).toBe(false);
      }
      const progress = await dispatchTool(deps, "progress", { plan: absolute });
      expect(progress.structuredContent?.publication).toMatchObject({ prUrl: "https://example.test/app/pull/299", ci: "green", headSha: head });
      publishedHead = catalog.git("rev-parse", delivery.branch);
      const stale = await dispatchTool(deps, "start_task", { plan: absolute, task: "MCP_FIX_002" });
      expect(stale.isError, text(stale)).toBe(true);
      expect(text(stale)).toContain(`PR head ${publishedHead.slice(0, 7)} is not the current head ${head.slice(0, 7)}`);
      expect(readFileSync(absolute, "utf8")).toMatch(/^Active Delivery: D1\s*$/m);
      publishedHead = head;
      calls.length = 0;
      const brief = await dispatchTool(deps, "start_task", { plan: absolute, task: "MCP_FIX_002" });
      expect(brief.isError ?? false, text(brief)).toBe(false);
      expect(brief.structuredContent?.taskId).toBe("MCP_FIX_002");
      expect(calls).toEqual([{ root: app.root, branch: delivery.branch }]);
      expect(readFileSync(absolute, "utf8")).toMatch(/^Active Delivery: D2\s*$/m);
      // A completed local parent also unlocks the child before any push or CI.
      mutatePlanFile(catalog.root, absolute, "fixture-completed-parent", current => ({ body: current
        .replace(/^Active Delivery: D2/m, "Active Delivery: D1")
        .replace(/(<!-- plan:stage:D1-S1:start -->)([\s\S]*?)(<!-- plan:stage:D1-S1:end -->)/,
          (_whole, start: string, block: string, end: string) => start + block.replace(/^- \[ \] (.*)$/gm, `- [x] $1 — ${head}`) + end) }));
      const ready = await dispatchTool({ ...deps, publication: () => null }, "progress", { plan: absolute });
      expect(ready.structuredContent?.next).toMatchObject({ taskId: "MCP_FIX_002", blockedBy: null });
      const local = await dispatchTool({ ...deps, publication: () => null }, "start_task", { plan: absolute, task: "MCP_FIX_002" });
      expect(local.isError ?? false, text(local)).toBe(false);
      expect(local.structuredContent?.taskId).toBe("MCP_FIX_002");
    } finally {
      rmSync(catalog.root, { recursive: true, force: true });
      rmSync(app.root, { recursive: true, force: true });
    }
  }, 120_000);

  /** An app plan whose one active Delivery lives in a catalog checkout on the Delivery's branch; the config line binds the name. */
  async function catalogPlan(name: string, criteria: readonly string[]): Promise<{ app: Fixture; catalog: Fixture; deps: Parameters<typeof dispatchTool>[0]; absolute: string; plan: string }> {
    const app = fixture(`${name}-app`);
    const catalog = fixture(`${name}-catalog`);
    catalog.git("checkout", "-qb", delivery.branch);
    // Two fixtures born in the same second share their commit ids: the catalog moves one commit ahead so an app commit is a stranger to it.
    catalog.git("commit", "-q", "--allow-empty", "-m", "the catalog diverges");
    app.git("config", "code-production.repository.catalog", catalog.root);
    const deps = { cwd: home, publication: () => null, sourceCommit: "s".repeat(40), eventLog: join(home, `events-${name}.jsonl`), publisher: (_repository: string, plan: string) => `http://fixture/${plan}` };
    const spec = readFileSync(join(import.meta.dir, "fixtures/plan-lint.md"), "utf8").replace("Reduce invalid changes from three per release to zero.", "Ship one observable result.");
    const started = await dispatchTool(deps, "init", { root: app.root, title: `${name} plan` });
    const plan = (started.structuredContent as { plan: string }).plan;
    const absolute = join(app.root, plan);
    const seen = await dispatchTool(deps, "progress", { root: app.root });
    await dispatchTool(deps, "submit_spec", { plan: absolute, baseRevision: (seen.structuredContent as { revision: string }).revision, ownerRequest: "Reject empty names", spec });
    await dispatchTool(deps, "approve_spec", { plan: absolute, ownerWord: "spec", expectedRevision: protocolSpecHash(readFileSync(absolute, "utf8")) });
    const put = await dispatchTool(deps, "put_delivery", { plan: absolute, delivery: { ...delivery, repository: "catalog" } });
    expect(put.isError ?? false, text(put)).toBe(false);
    const staged = await dispatchTool(deps, "put_stage", { plan: absolute, stage: { ...stage, criteria } });
    expect(staged.isError ?? false, text(staged)).toBe(false);
    const approved = await dispatchTool(deps, "approve_plan", { plan: absolute, ownerWord: "plan", expectedRevision: protocolImplementationHash(readFileSync(absolute, "utf8")) });
    expect(approved.isError ?? false, text(approved)).toBe(false);
    return { app, catalog, deps, absolute, plan };
  }

  /**
   * @test-id: tst_unit_planctl_mcp_006
   * @scenario: scn_planctl_mcp_repository_001
   * @covers: planctl/src/mcp/server.ts::start_task,complete_task; planctl/src/core/plan-update.ts::completeTask
   * @deterministic: yes
   * @invariant: a Task of a catalog Delivery starts with its record in the app and its worktree in the catalog; a commit of the app is refused as not descending from the start base; a commit of the catalog completes and its paths land in the plan.
   */
  it("tst_unit_planctl_mcp_006 completes a catalog Delivery with a catalog commit and refuses an app commit", async () => {
    const { app, catalog, deps, absolute, plan } = await catalogPlan("zeta", ["`true` exits 0 — the behavior is proven", "Commit"]);
    try {
      const brief = await dispatchTool(deps, "start_task", { plan: absolute });
      expect(brief.isError ?? false, text(brief)).toBe(false);
      const record = decodeTaskRun(JSON.parse(readFileSync(taskRunPath(app.root, plan, "MCP_FIX_001"), "utf8")));
      expect(record.version === 3 ? record.worktree : null).toBe(catalog.git("rev-parse", "--show-toplevel"));
      const wrong = await dispatchTool(deps, "complete_task", { plan: absolute, taskIds: ["MCP_FIX_001"], commit: app.git("rev-parse", "HEAD"), result: "nothing" });
      expect(wrong.isError).toBe(true);
      expect(text(wrong)).toContain("does not descend from its start base");
      mkdirSync(join(catalog.root, "scripts"), { recursive: true });
      writeFileSync(join(catalog.root, "scripts/base.ts"), "export const base = 1;\n");
      catalog.git("add", "scripts/base.ts");
      catalog.git("commit", "-qm", "work in the catalog");
      const done = await dispatchTool(deps, "complete_task", { plan: absolute, taskIds: ["MCP_FIX_001"], commit: catalog.git("rev-parse", "HEAD"), result: "base shipped in the catalog" });
      expect(done.isError ?? false, text(done)).toBe(false);
      expect((done.structuredContent as { paths: string[] }).paths).toEqual(["scripts/base.ts"]);
      expect(readFileSync(absolute, "utf8")).toContain(catalog.git("rev-parse", "HEAD").slice(0, 7));
    } finally {
      rmSync(app.root, { recursive: true, force: true });
      rmSync(catalog.root, { recursive: true, force: true });
    }
  }, 120_000);

  /**
   * @test-id: tst_unit_planctl_mcp_007
   * @scenario: scn_planctl_mcp_repository_001
   * @covers: planctl/src/mcp/server.ts::close_stage; planctl/src/core/plan-update.ts::closePlanStage
   * @deterministic: yes
   * @invariant: close_stage runs a catalog Delivery's criteria with the catalog checkout as the working directory and reports the catalog head.
   */
  it("tst_unit_planctl_mcp_007 closes a catalog Delivery's Stage in the catalog checkout", async () => {
    const { app, catalog, deps, absolute } = await catalogPlan("eta", ["`test -f scripts/base.ts` exits 0 — the file exists in the checkout", "Commit"]);
    try {
      await dispatchTool(deps, "start_task", { plan: absolute });
      mkdirSync(join(catalog.root, "scripts"), { recursive: true });
      writeFileSync(join(catalog.root, "scripts/base.ts"), "export const base = 1;\n");
      catalog.git("add", "scripts/base.ts");
      catalog.git("commit", "-qm", "work in the catalog");
      const done = await dispatchTool(deps, "complete_task", { plan: absolute, taskIds: ["MCP_FIX_001"], commit: catalog.git("rev-parse", "HEAD"), result: "base shipped in the catalog" });
      expect(done.isError ?? false, text(done)).toBe(false);
      const closed = await dispatchTool(deps, "close_stage", { plan: absolute, stage: "D1-S1" });
      expect(closed.isError ?? false, text(closed)).toBe(false);
      expect((closed.structuredContent as { status: string }).status).toBe("CLOSED");
      expect((closed.structuredContent as { head: string }).head).toBe(catalog.git("rev-parse", "HEAD"));
      expect(existsSync(join(app.root, "scripts/base.ts"))).toBe(false);
    } finally {
      rmSync(app.root, { recursive: true, force: true });
      rmSync(catalog.root, { recursive: true, force: true });
    }
  }, 120_000);

  /**
   * @test-id: tst_unit_planctl_mcp_008
   * @scenario: scn_planctl_mcp_authoring_002
   * @covers: planctl/src/mcp/server.ts::submit_spec,approve_spec,amend
   * @deterministic: yes
   * @invariant: editorial advice does not force a SPEC rewrite or a third approval; approved content changes only under the owner's word.
   */
  it("tst_unit_planctl_mcp_008 preserves research through submission, approval and amendment", async () => {
    const { root } = fixture("advice");
    const deps = { cwd: home, publication: () => null, sourceCommit: "s".repeat(40), eventLog: join(home, "events-008.jsonl"), publisher: (_repository: string, plan: string) => `http://fixture/${plan}` };
    const original = readFileSync(join(import.meta.dir, "fixtures/plan-lint.md"), "utf8");
    const map = original.slice(original.indexOf("| Implementation map"), original.indexOf("### Interfaces"));
    const spec = original.replace(map, "").replace("### Reject an empty name\n\n", "").replace("## Why now", "## Observed behavior");
    try {
      const started = await dispatchTool(deps, "init", { root, title: "Evidence" });
      expect(text(started)).not.toContain("Why now");
      const plan = join(root, (started.structuredContent as { plan: string }).plan);
      const submitted = await dispatchTool(deps, "submit_spec", { plan, baseRevision: protocolSpecHash(readFileSync(plan, "utf8")), ownerRequest: "Preserve the findings", spec });
      expect(submitted.isError ?? false, text(submitted)).toBe(false);
      const findings = (submitted.structuredContent as { findings: { blocking: boolean }[] }).findings;
      expect(findings).toEqual([]);
      expect(findings.every((finding) => !finding.blocking)).toBe(true);
      expect(text(submitted)).not.toContain("Why now");
      expect(readFileSync(plan, "utf8")).toContain(spec.trim());
      const approved = await dispatchTool(deps, "approve_spec", { plan, ownerWord: "spec", expectedRevision: protocolSpecHash(readFileSync(plan, "utf8")) });
      expect(approved.isError ?? false, text(approved)).toBe(false);
      const saved = readFileSync(plan, "utf8");
      const refused = await dispatchTool(deps, "submit_spec", { plan, baseRevision: protocolSpecHash(saved), ownerRequest: "Replace", spec: "## The Goal\n\nSomething else." });
      expect(refused.isError).toBe(true);
      expect(readFileSync(plan, "utf8")).toBe(saved);
      const amended = await dispatchTool(deps, "amend", { plan, ownerWord: "keep the evidence", patch: { section: "spec", find: "The current parser accepts empty names.", replace: `The blueprint document records the observed behavior: ${"word ".repeat(31)}ends.` } });
      expect(amended.isError ?? false, text(amended)).toBe(false);
      expect(readFileSync(plan, "utf8")).toContain("The blueprint document records the observed behavior:");
      expect(toolNames().filter((name) => name.startsWith("approve_"))).toEqual(["approve_spec", "approve_plan"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);

  /**
   * @test-id: tst_unit_planctl_mcp_004
   * @scenario: scn_planctl_mcp_authoring_003
   * @covers: planctl/src/mcp/server.ts::submit_spec,approve_spec; planctl/src/core/plan-gate.ts::lint
   * @deterministic: yes
   * @invariant: draft goals and flows remain editable; missing files are errors, repeated prose is advice, and the SPEC can be approved.
   */
  it("tst_unit_planctl_mcp_004 accepts evolving drafts and diagnoses missing files separately from repeated prose", async () => {
    const { root } = fixture("delta");
    const deps = { cwd: home, publication: () => null, sourceCommit: "s".repeat(40), eventLog: join(home, "events-004.jsonl"), publisher: (_repository: string, plan: string) => `http://fixture/${plan}` };
    const spec = readFileSync(join(import.meta.dir, "fixtures/plan-lint.md"), "utf8").replace("Reduce invalid changes from three per release to zero.", "Ship one observable result.");
    try {
      const started = await dispatchTool(deps, "init", { root, title: "Delta plan" });
      const plan = (started.structuredContent as { plan: string }).plan;
      const absolute = join(root, plan);
      const seen = await dispatchTool(deps, "progress", { root });
      const errorsOf = (result: { structuredContent?: Record<string, unknown> }) => ((result.structuredContent as { findings: { blocking: boolean; text: string }[] }).findings).filter((finding) => finding.blocking).map((finding) => finding.text);
      let revision = (seen.structuredContent as { revision: string }).revision;
      const renamed = await dispatchTool(deps, "submit_spec", { plan: absolute, baseRevision: revision, ownerRequest: "Reject empty names", spec: spec.replace("### Reject an empty name", "### Reject every name") });
      expect(renamed.isError ?? false, text(renamed)).toBe(false);
      expect(errorsOf(renamed)).toEqual([]);
      revision = (renamed.structuredContent as { revision: string }).revision;
      const regoaled = await dispatchTool(deps, "submit_spec", { plan: absolute, baseRevision: revision, ownerRequest: "Reject empty names", spec: spec.replace("Ship one observable result.", "Ship two observable results.") });
      expect(errorsOf(regoaled)).toEqual([]);
      revision = (regoaled.structuredContent as { revision: string }).revision;
      const ghost = await dispatchTool(deps, "submit_spec", { plan: absolute, baseRevision: revision, ownerRequest: "Reject empty names", spec: spec.replace("| Target files | `src/change.ts`; `src/save.ts` |", "| Target files | `src/change.ts`; `src/ghost.ts` |") });
      expect(errorsOf(ghost)).toContain("file does not exist: src/ghost.ts; name it CREATE in the Target tree if the plan creates it");
      revision = (ghost.structuredContent as { revision: string }).revision;
      const twice = "The parser refuses an empty name before it is ever saved.";
      const repeated = await dispatchTool(deps, "submit_spec", { plan: absolute, baseRevision: revision, ownerRequest: "Reject empty names", spec: spec.replace("Reject empty names before saving.", `${twice}\n\n${twice}`) });
      expect(errorsOf(repeated)).toEqual([]);
      expect(text(repeated)).toMatch(/Advice: line \d+ repeats line \d+/);
      revision = (repeated.structuredContent as { revision: string }).revision;
      const conforming = await dispatchTool(deps, "submit_spec", { plan: absolute, baseRevision: revision, ownerRequest: "Reject empty names", spec });
      expect(errorsOf(conforming)).toEqual([]);
      expect(text(conforming)).toContain("Checks: 0 errors");
      const approved = await dispatchTool(deps, "approve_spec", { plan: absolute, ownerWord: "spec", expectedRevision: protocolSpecHash(readFileSync(absolute, "utf8")) });
      expect(approved.isError ?? false, text(approved)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);

  /**
   * @test-id: tst_unit_planctl_mcp_002
   * @scenario: scn_planctl_mcp_authoring_001
   * @covers: planctl/src/mcp/server.ts::dispatchTool,published
   * @deterministic: yes
   * @invariant: one client authors and executes a plan through the tools alone with returned revisions; every write publishes the saved bytes and returns url and reply; approve_plan finds nothing put_stage did not already return; a duplicate Task ID and a dependency cycle are findings before approval.
   */
  it("tst_unit_planctl_mcp_002 authors and executes a plan through the tools alone, publishing after every write", async () => {
    const { root, git } = fixture("gamma");
    const received: { plan: string; bytes: string }[] = [];
    const deps = {
      cwd: home,
      publication: () => null,
      sourceCommit: "s".repeat(40),
      eventLog: join(home, "events-002.jsonl"),
      publisher: (repository: string, plan: string) => {
        received.push({ plan, bytes: readFileSync(join(repository, plan), "utf8") });
        return `http://fixture/${plan}`;
      },
    };
    try {
      const started = await dispatchTool(deps, "init", { root, title: "Gamma plan" });
      expect(started.isError ?? false, text(started)).toBe(false);
      const plan = (started.structuredContent as { plan: string }).plan;
      const absolute = join(root, plan);
      const spec = readFileSync(join(import.meta.dir, "fixtures/plan-lint.md"), "utf8").replace("Reduce invalid changes from three per release to zero.", "Ship one observable result.");
      // A plan continued in a later session has no init reply: progress names the revision submit_spec needs.
      const seen = await dispatchTool(deps, "progress", { root });
      expect((seen.structuredContent as { revision?: string }).revision).toBe(protocolSpecHash(readFileSync(absolute, "utf8")));
      expect(text(seen)).toContain(`Revision  ${protocolSpecHash(readFileSync(absolute, "utf8"))}`);
      // The title is part of the submission: submit_spec renames the draft, and a title in another language is refused at the door.
      const renamed = await dispatchTool(deps, "submit_spec", { plan: absolute, baseRevision: (seen.structuredContent as { revision: string }).revision, ownerRequest: "Reject empty names", spec, title: "Gamma plan, renamed" });
      expect(renamed.isError ?? false, text(renamed)).toBe(false);
      expect(readFileSync(absolute, "utf8").startsWith("# Gamma plan, renamed\n")).toBe(true);
      const cyrillic = await dispatchTool(deps, "submit_spec", { plan: absolute, baseRevision: (renamed.structuredContent as { revision: string }).revision, ownerRequest: "Reject empty names", spec, title: "План гамма" });
      expect(cyrillic.isError).toBe(true);
      expect(text(cyrillic)).toContain("the plan is written in English, title included");
      // The map is authoring advice; it does not reject the submitted draft.
      const withoutMap = spec.replace(spec.slice(spec.indexOf("| Implementation map"), spec.indexOf("### Interfaces")), "");
      const refused = await dispatchTool(deps, "submit_spec", { plan: absolute, baseRevision: (renamed.structuredContent as { revision: string }).revision, ownerRequest: "Reject empty names", spec: withoutMap });
      expect(refused.isError ?? false, text(refused)).toBe(false);
      expect(text(refused)).not.toContain("has no implementation map");
      expect(text(refused)).toContain("Checks: 0 errors");
      const submitted = await dispatchTool(deps, "submit_spec", { plan: absolute, baseRevision: (refused.structuredContent as { revision: string }).revision, ownerRequest: "Reject empty names", spec });
      expect(submitted.isError ?? false, text(submitted)).toBe(false);
      expect(text(submitted)).not.toContain("Example flow:");
      const submission = submitted.structuredContent as { revision: string; url: string; reply: string; checkStatus: string };
      expect(submission.checkStatus).toBe("checked");
      expect(submission.url).toBe(`http://fixture/${plan}`);
      expect(submission.reply).toBe(`Plan: http://fixture/${plan}\nDraft solution.\nChecks: 0 errors`);
      expect(received.at(-1)?.bytes).toBe(readFileSync(absolute, "utf8"));

      const locked = await dispatchTool(deps, "approve_spec", { plan: absolute, ownerWord: "spec", expectedRevision: protocolSpecHash(readFileSync(absolute, "utf8")) });
      expect(locked.isError ?? false, text(locked)).toBe(false);
      expect((locked.structuredContent as { revision: string }).revision).toBe(submission.revision);
      // An amendment never adds a lint error: the SPEC stays in English and in shape at every write.
      const russian = await dispatchTool(deps, "amend", { plan: absolute, ownerWord: "spec", patch: { section: "spec", find: "Reject empty names before saving.", replace: "Отклонять пустые имена до сохранения." } });
      expect(russian.isError).toBe(true);
      expect(text(russian)).toContain("amendment adds 1 error(s)");
      expect(text(russian)).toContain("the plan is written in English");
      const amended = await dispatchTool(deps, "amend", { plan: absolute, ownerWord: "spec", patch: { section: "spec", find: "Reject empty names before saving.", replace: "Reject empty names before saving, at the parser." } });
      expect(amended.isError ?? false, text(amended)).toBe(false);
      expect(text(amended)).toContain("Checks: 0 errors");
      // The title of a locked plan changes through amend too, under the owner's word, in English, never by hand.
      const retitled = await dispatchTool(deps, "amend", { plan: absolute, ownerWord: "title", patch: { section: "title", find: "Gamma plan, renamed", replace: "Gamma plan, approved" } });
      expect(retitled.isError ?? false, text(retitled)).toBe(false);
      expect(readFileSync(absolute, "utf8").startsWith("# Gamma plan, approved\n")).toBe(true);
      expect(readFileSync(absolute, "utf8")).toContain("amend title owner:title");
      const wrongFind = await dispatchTool(deps, "amend", { plan: absolute, ownerWord: "title", patch: { section: "title", find: "Gamma plan, renamed", replace: "Gamma plan, again" } });
      expect(wrongFind.isError).toBe(true);
      expect(text(wrongFind)).toContain("title is");
      const russianTitle = await dispatchTool(deps, "amend", { plan: absolute, ownerWord: "title", patch: { section: "title", find: "Gamma plan, approved", replace: "План гамма" } });
      expect(russianTitle.isError).toBe(true);
      expect(text(russianTitle)).toContain("the plan is written in English, title included");
      const withDelivery = await dispatchTool(deps, "put_delivery", { plan: absolute, delivery: { ...delivery, stageGraph: "D1-S1 -> D1-S2 -> D1-S3" } });
      expect(withDelivery.isError ?? false, text(withDelivery)).toBe(false);
      const first = await dispatchTool(deps, "put_stage", { plan: absolute, stage });
      expect(first.isError ?? false, text(first)).toBe(false);
      expect((first.structuredContent as { findings: unknown[] }).findings).toEqual([]);
      expect(received.at(-1)?.bytes).toBe(readFileSync(absolute, "utf8"));
      expect((first.structuredContent as { reply: string }).reply).toBe(`Plan: http://fixture/${plan}\nSolution approved; implementation breakdown follows.`);

      const duplicate = await dispatchTool(deps, "put_stage", { plan: absolute, stage: { ...stage, id: "D1-S2", title: "Duplicate", depends: ["D1-S1"], writes: ["lib/"], tempRoot: ".tmp/code-production/fixture/D1-S2", tasks: [{ ...stage.tasks[0], writes: ["lib/a.ts", "lib/b.ts", "lib/c.ts"] }] } });
      expect(duplicate.isError ?? false, text(duplicate)).toBe(false);
      expect(JSON.stringify((duplicate.structuredContent as { findings: unknown[] }).findings)).toContain("Plan Task IDs");
      const third = await dispatchTool(deps, "put_stage", { plan: absolute, stage: { ...stage, id: "D1-S3", title: "Cycle back", depends: ["D1-S2"], writes: ["app/"], tempRoot: ".tmp/code-production/fixture/D1-S3", tasks: [{ ...stage.tasks[0], id: "MCP_FIX_003", writes: ["app/a.ts", "app/b.ts", "app/c.ts"] }] } });
      expect(third.isError ?? false, text(third)).toBe(false);
      const cyclic = await dispatchTool(deps, "put_stage", { plan: absolute, stage: { ...stage, id: "D1-S2", title: "Cycle", depends: ["D1-S3"], writes: ["lib/"], tempRoot: ".tmp/code-production/fixture/D1-S2", tasks: [{ ...stage.tasks[0], id: "MCP_FIX_002", writes: ["lib/a.ts", "lib/b.ts", "lib/c.ts"] }] } });
      expect(cyclic.isError).toBe(true);
      expect(text(cyclic)).toContain("cycle");
      let lastRevision = "";
      for (const id of ["D1-S3", "D1-S2"]) {
        const removed = await dispatchTool(deps, "remove_stage", { plan: absolute, stage: id });
        expect(removed.isError ?? false, text(removed)).toBe(false);
        lastRevision = (removed.structuredContent as { revision: string }).revision;
      }
      const approved = await dispatchTool(deps, "approve_plan", { plan: absolute, ownerWord: "plan", expectedRevision: protocolImplementationHash(readFileSync(absolute, "utf8")) });
      expect(approved.isError ?? false, text(approved)).toBe(false);
      expect((approved.structuredContent as { revision: string }).revision).toBe(lastRevision);

      const brief = await dispatchTool(deps, "start_task", { plan: absolute });
      expect((brief.structuredContent as { taskId: string }).taskId).toBe("MCP_FIX_001");
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(join(root, "scripts/base.ts"), "export const base = 1;\n");
      git("add", "-A");
      git("commit", "-qm", "work");
      const done = await dispatchTool(deps, "complete_task", { plan: absolute, taskIds: ["MCP_FIX_001"], commit: git("rev-parse", "HEAD"), result: "base shipped" });
      expect(done.isError ?? false, text(done)).toBe(false);
      const closed = await dispatchTool(deps, "close_stage", { plan: absolute, stage: "D1-S1" });
      expect((closed.structuredContent as { status: string; url: string }).status).toBe("CLOSED");
      expect((closed.structuredContent as { url: string }).url).toBe(`http://fixture/${plan}`);
      expect(received.at(-1)?.bytes).toBe(readFileSync(absolute, "utf8"));
      const terms = await dispatchTool(deps, "vocabulary", { root });
      expect((terms.structuredContent as { terms: { word: string; term: string }[] }).terms.some((pair) => pair.term === "plan")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);
});

/**
 * @test-id: tst_unit_planctl_mcp_012
 * @scenario: scn_planctl_telemetry_failure_001
 * @covers: planctl/src/mcp/server.ts::dispatchTool
 * @deterministic: yes
 * @invariant: unavailable diagnostic logging cannot turn an already journaled mutation into an apparent failure.
 */
it("tst_unit_planctl_mcp_012 preserves the actual result when telemetry is unwritable", async () => {
  const { root } = fixture("telemetry");
  try {
    const result = await dispatchTool({ cwd: root, publication: () => null, sourceCommit: "test", eventLog: root,
      publisher: () => "http://fixture/plan" }, "init", { root, title: "Preserve the real outcome" });
    expect(result.isError ?? false, text(result)).toBe(false);
    expect(result.structuredContent?.diagnostics).toEqual(["Diagnostic event logging is unavailable; the operation result and plan journal are unchanged."]);
    const plan = String(result.structuredContent?.plan);
    expect(existsSync(planJournalPath(root, plan))).toBe(true);
    expect(readFileSync(join(root, plan), "utf8")).toContain("SPEC_DRAFT");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
