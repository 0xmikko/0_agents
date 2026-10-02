import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { dispatchTool } from "../src/mcp/server";
import { deliveryMetas, planJournalPath } from "../src/core/plan-update";
import { protocolSpecHash } from "../src/core/plan-update";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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

      const locked = await client.callTool({ name: "approve_spec", arguments: { plan: absolute, ownerWord: "spec" } });
      expect(locked.isError ?? false, text(locked)).toBe(false);
      const putDelivery = await client.callTool({ name: "put_delivery", arguments: { plan: absolute, delivery } });
      expect(putDelivery.isError ?? false, text(putDelivery)).toBe(false);
      const putStage = await client.callTool({ name: "put_stage", arguments: { plan: absolute, stage } });
      expect(putStage.isError ?? false, text(putStage)).toBe(false);
      expect((putStage.structuredContent as { findings: unknown[] }).findings).toEqual([]);
      const approved = await client.callTool({ name: "approve_plan", arguments: { plan: absolute, ownerWord: "plan" } });
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
      const locked = await dispatchTool(deps, "approve_spec", { plan: absolute, ownerWord: "spec" });
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
   * @test-id: tst_unit_planctl_mcp_004
   * @scenario: scn_planctl_mcp_outline_001
   * @covers: planctl/src/mcp/server.ts::submit_outline,approve_outline; planctl/src/core/plan-gate.ts::lint
   * @deterministic: yes
   * @invariant: the owner approves an outline first; the SPEC then fills exactly its flows: a renamed flow, a changed Goal, a path that does not exist and a repeated line are errors named by line, and the conforming SPEC passes.
   */
  it("tst_unit_planctl_mcp_004 locks an outline and lets the SPEC fill exactly it, citing files that exist", async () => {
    const { root } = fixture("delta");
    const deps = { cwd: home, publication: () => null, sourceCommit: "s".repeat(40), eventLog: join(home, "events-004.jsonl"), publisher: (_repository: string, plan: string) => `http://fixture/${plan}` };
    const spec = readFileSync(join(import.meta.dir, "fixtures/plan-lint.md"), "utf8").replace("Reduce invalid changes from three per release to zero.", "Ship one observable result.");
    try {
      const started = await dispatchTool(deps, "init", { root, title: "Delta plan" });
      const plan = (started.structuredContent as { plan: string }).plan;
      const absolute = join(root, plan);
      const seen = await dispatchTool(deps, "progress", { root });
      const outlined = await dispatchTool(deps, "submit_outline", { plan: absolute, baseRevision: (seen.structuredContent as { revision: string }).revision, goal: "Ship one observable result.", flows: [{ name: "Reject an empty name", line: "The parser refuses an empty name before saving." }] });
      expect(outlined.isError ?? false, text(outlined)).toBe(false);
      expect(readFileSync(absolute, "utf8")).toContain("### Reject an empty name\n\nThe parser refuses an empty name before saving.");
      const russian = await dispatchTool(deps, "submit_outline", { plan: absolute, baseRevision: (outlined.structuredContent as { revision: string }).revision, goal: "Отклонять пустые имена.", flows: [{ name: "Reject an empty name", line: "One line." }] });
      expect(russian.isError).toBe(true);
      const locked = await dispatchTool(deps, "approve_outline", { plan: absolute, ownerWord: "outline" });
      expect(locked.isError ?? false, text(locked)).toBe(false);
      const saved = readFileSync(absolute, "utf8");
      expect(saved).toMatch(/^Outline lock: sha256:[0-9a-f]{64} owner:outline/m);
      expect(saved).toContain('<!-- plan:outline-meta:{"goal":"Ship one observable result.","flows":["Reject an empty name"]} -->');
      expect(saved).toContain("lock-outline sha256:");
      const errorsOf = (result: { structuredContent?: Record<string, unknown> }) => ((result.structuredContent as { findings: { blocking: boolean; text: string }[] }).findings).filter((finding) => finding.blocking).map((finding) => finding.text);
      let revision = (locked.structuredContent as { revision: string }).revision;
      const renamed = await dispatchTool(deps, "submit_spec", { plan: absolute, baseRevision: revision, ownerRequest: "Reject empty names", spec: spec.replace("### Reject an empty name", "### Reject every name") });
      expect(renamed.isError ?? false, text(renamed)).toBe(false);
      expect(errorsOf(renamed)).toEqual(expect.arrayContaining(["outline flow «Reject an empty name» is missing", "flow «Reject every name» is not in the approved outline"]));
      revision = (renamed.structuredContent as { revision: string }).revision;
      const regoaled = await dispatchTool(deps, "submit_spec", { plan: absolute, baseRevision: revision, ownerRequest: "Reject empty names", spec: spec.replace("Ship one observable result.", "Ship two observable results.") });
      expect(errorsOf(regoaled)).toContain("the Goal differs from the approved outline");
      revision = (regoaled.structuredContent as { revision: string }).revision;
      const ghost = await dispatchTool(deps, "submit_spec", { plan: absolute, baseRevision: revision, ownerRequest: "Reject empty names", spec: spec.replace("| Target files | `src/change.ts`; `src/save.ts` |", "| Target files | `src/change.ts`; `src/ghost.ts` |") });
      expect(errorsOf(ghost)).toContain("file does not exist: src/ghost.ts; name it CREATE in the Target tree if the plan creates it");
      revision = (ghost.structuredContent as { revision: string }).revision;
      const twice = "The parser refuses an empty name before it is ever saved.";
      const repeated = await dispatchTool(deps, "submit_spec", { plan: absolute, baseRevision: revision, ownerRequest: "Reject empty names", spec: spec.replace("Reject empty names before saving.", `${twice}\n\n${twice}`) });
      expect(errorsOf(repeated).some((entry) => /^line \d+ repeats line \d+$/.test(entry))).toBe(true);
      revision = (repeated.structuredContent as { revision: string }).revision;
      const conforming = await dispatchTool(deps, "submit_spec", { plan: absolute, baseRevision: revision, ownerRequest: "Reject empty names", spec });
      expect(errorsOf(conforming)).toEqual([]);
      expect(text(conforming)).toContain("Checks: 0 errors");
      const approved = await dispatchTool(deps, "approve_spec", { plan: absolute, ownerWord: "spec" });
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
      // A flow refused for its missing map gets the example flow in the same reply: a continued plan never sees init.
      const withoutMap = spec.replace(spec.slice(spec.indexOf("| Implementation map"), spec.indexOf("### Interfaces")), "");
      const refused = await dispatchTool(deps, "submit_spec", { plan: absolute, baseRevision: (renamed.structuredContent as { revision: string }).revision, ownerRequest: "Reject empty names", spec: withoutMap });
      expect(refused.isError ?? false, text(refused)).toBe(false);
      expect(text(refused)).toContain("flow «Reject an empty name» has no implementation map");
      expect(text(refused)).toContain("Example flow:\n### Browser OAuth returns a provider URL");
      const submitted = await dispatchTool(deps, "submit_spec", { plan: absolute, baseRevision: (refused.structuredContent as { revision: string }).revision, ownerRequest: "Reject empty names", spec });
      expect(submitted.isError ?? false, text(submitted)).toBe(false);
      expect(text(submitted)).not.toContain("Example flow:");
      const submission = submitted.structuredContent as { revision: string; url: string; reply: string; checkStatus: string };
      expect(submission.checkStatus).toBe("checked");
      expect(submission.url).toBe(`http://fixture/${plan}`);
      expect(submission.reply).toBe(`Plan: http://fixture/${plan}\nRevision ${submission.revision}, SPEC_DRAFT\nChecks: 0 errors`);
      expect(received.at(-1)?.bytes).toBe(readFileSync(absolute, "utf8"));

      const locked = await dispatchTool(deps, "approve_spec", { plan: absolute, ownerWord: "spec" });
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
      expect((first.structuredContent as { reply: string }).reply).toBe(`Plan: http://fixture/${plan}\nRevision ${(first.structuredContent as { revision: string }).revision}, SPEC_LOCKED`);

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
      const approved = await dispatchTool(deps, "approve_plan", { plan: absolute, ownerWord: "plan" });
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
