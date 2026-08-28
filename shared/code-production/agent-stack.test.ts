import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "bun:test";

import { checkStack, installStack } from "./agent-stack";

const roots: string[] = [];

function git(root: string, ...args: readonly string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function packageJson(omit?: string): string {
  const scripts: Record<string, string> = {
    "agent:install": "bun -e \"process.exit(0)\"",
    "agent:test:backend": "bun -e \"process.exit(0)\"",
    "agent:test:frontend": "bun -e \"process.exit(0)\"",
    "agent:test:e2e": "bun -e \"process.exit(0)\"",
    "agent:verify:commit": "bun -e \"process.exit(0)\"",
    "agent:verify:pr": "bun -e \"process.exit(0)\"",
    "agent:verify:docs": "bun -e \"process.exit(0)\"",
  };
  if (omit !== undefined) delete scripts[omit];
  return `${JSON.stringify({ name: "consumer", private: true, scripts }, null, 2)}\n`;
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "agent-stack-"));
  roots.push(root);
  git(root, "init", "-b", "staging");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  writeFileSync(join(root, "package.json"), packageJson());
  git(root, "add", "package.json");
  git(root, "commit", "-m", "test: fixture");
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("agent-stack", () => {
  test("tst_agent_stack_001 installs one framework-agnostic contract", () => {
    const root = fixture();
    const installed = installStack(root);

    expect(installed.files).toHaveLength(7);
    expect(git(root, "config", "--worktree", "--get", "core.hooksPath")).toBe(".githooks");
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toContain("/.worktrees/");
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toContain("/.tmp/code-production/");
    expect(readFileSync(join(root, ".agents/code-production/manifest.json"), "utf8")).toContain("dltxperts/0_agents");
    expect(checkStack(root).files).toEqual(installed.files);
  });

  test("tst_agent_stack_002 rejects an incomplete package command adapter", () => {
    const root = fixture();
    writeFileSync(join(root, "package.json"), packageJson("agent:test:e2e"));

    expect(() => installStack(root)).toThrow("missing required script agent:test:e2e");
  });

  test("tst_agent_stack_003 never overwrites a repository-owned hook", () => {
    const root = fixture();
    mkdirSync(join(root, ".githooks"), { recursive: true });
    writeFileSync(join(root, ".githooks/pre-commit"), "#!/bin/sh\necho project-hook\n");

    expect(() => installStack(root)).toThrow("refusing to overwrite unmanaged .githooks/pre-commit");
    expect(readFileSync(join(root, ".githooks/pre-commit"), "utf8")).toContain("project-hook");
  });

  test("tst_agent_stack_004 check detects drift and install repairs managed files", () => {
    const root = fixture();
    installStack(root);
    const workflow = join(root, ".github/workflows/code-production.yml");
    writeFileSync(workflow, `${readFileSync(workflow, "utf8")}# drift\n`);

    expect(() => checkStack(root)).toThrow("managed stack is missing or stale");
    installStack(root);
    expect(() => checkStack(root)).not.toThrow();
  });

  test("tst_agent_stack_005 hooks allow draft prose but reject raw locked-plan edits", () => {
    const root = fixture();
    installStack(root);
    const planctl = ".agents/code-production/runtime/planctl.ts";
    const plan = "docs/plans/example.md";
    const runPlan = (...args: readonly string[]): number => spawnSync(
      "bun",
      [planctl, ...args],
      { cwd: root, stdio: "pipe" },
    ).status ?? 1;

    expect(runPlan("init", plan, "--title", "Example")).toBe(0);
    expect(spawnSync("git", ["-C", root, "commit", "-m", "plan: draft"], { stdio: "pipe" }).status).toBe(0);

    const draftPath = join(root, plan);
    writeFileSync(draftPath, readFileSync(draftPath, "utf8").replace("<draft>", "A concrete user goal"));
    git(root, "add", plan);
    expect(spawnSync("git", ["-C", root, "commit", "-m", "plan: refine spec"], { stdio: "pipe" }).status).toBe(0);

    expect(runPlan("approve-spec", plan, "--owner-word", "approved-by-owner")).toBe(0);
    expect(spawnSync("git", ["-C", root, "commit", "-m", "plan: lock spec"], { stdio: "pipe" }).status).toBe(0);

    writeFileSync(draftPath, readFileSync(draftPath, "utf8").replace("A concrete user goal", "A silently changed goal"));
    git(root, "add", plan);
    const refused = spawnSync("git", ["-C", root, "commit", "-m", "plan: raw change"], {
      encoding: "utf8",
    });
    expect(refused.status).not.toBe(0);
    expect(`${refused.stdout}${refused.stderr}`).toMatch(/plan-freeze|no journal|lock/i);
  });
});
