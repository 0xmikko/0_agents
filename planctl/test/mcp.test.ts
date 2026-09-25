import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
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

  beforeAll(async () => {
    await client.connect(new StdioClientTransport({
      command: "bun",
      args: [join(import.meta.dir, "../src/cli/main.ts"), "mcp"],
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

      const progress = await client.callTool({ name: "progress", arguments: { root } });
      expect(progress.isError ?? false, text(progress)).toBe(false);
      expect((progress.structuredContent as { plan: string; wholePlan: { completedTasks: number } }).plan).toBe(plan);
      expect((progress.structuredContent as { wholePlan: { completedTasks: number } }).wholePlan.completedTasks).toBe(1);

      const malformed = await client.callTool({ name: "start_task", arguments: { plan: absolute, task: 42 } });
      expect(malformed.isError).toBe(true);
      expect(text(malformed)).toContain("task");
      expect(existsSync(join(root, ".git/plan-update-journal.json"))).toBe(true);
    }
    expect(existsSync(join(home, ".git"))).toBe(false);
  }, 120_000);
});
