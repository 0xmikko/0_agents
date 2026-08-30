import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "bun:test";

import { checkStack, installStack } from "./agent-stack";

const roots: string[] = [];

function git(root: string, ...args: readonly string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function packageJson(
  omit?: string,
  overrides: Readonly<Record<string, string>> = {},
  agentStack?: Readonly<Record<string, string>>,
): string {
  const scripts: Record<string, string> = {
    "agent:install": "bun -e \"process.exit(0)\"",
    "agent:test:backend": "bun -e \"process.exit(0)\"",
    "agent:test:frontend": "bun -e \"process.exit(0)\"",
    "agent:test:e2e": "bun -e \"process.exit(0)\"",
    "agent:verify:commit": "bun -e \"process.exit(0)\"",
    "agent:verify:pr": "bun -e \"process.exit(0)\"",
    "agent:verify:docs": "bun -e \"process.exit(0)\"",
    ...overrides,
  };
  if (omit !== undefined) delete scripts[omit];
  return `${JSON.stringify({
    name: "consumer",
    private: true,
    scripts,
    ...(agentStack === undefined ? {} : { agentStack }),
  }, null, 2)}\n`;
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

  /**
   * @test-id: tst_agent_stack_006
   * @scenario: scn_delivery_gate_001
   * @covers: shared/code-production/templates/hooks/pre-push
   * @deterministic: yes
   * @fixtures: temporary Git repository with counter-backed package scripts
   *
   * Test environment: installed portable stack in a temporary Git repository
   * Clients: direct hook execution
   * Mocks: package scripts replace product verification with deterministic counters
   * Data: one unchanged clean commit
   */
  test("tst_agent_stack_006 reuses the complete gate receipt on an unchanged HEAD", () => {
    const root = fixture();
    writeFileSync(join(root, "package.json"), packageJson(undefined, {
      "agent:verify:docs": "printf d >> docs-gate-count.txt",
      "agent:verify:pr": "printf p >> pr-gate-count.txt",
    }));
    installStack(root);
    git(root, "add", ".");
    git(root, "commit", "-m", "test: install stack");
    rmSync(join(root, "docs-gate-count.txt"), { force: true });

    const first = spawnSync(join(root, ".githooks/pre-push"), [], { cwd: root, encoding: "utf8" });
    const second = spawnSync(join(root, ".githooks/pre-push"), [], { cwd: root, encoding: "utf8" });

    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain("reusing complete gate receipt");
    expect(readFileSync(join(root, "docs-gate-count.txt"), "utf8")).toBe("d");
    expect(readFileSync(join(root, "pr-gate-count.txt"), "utf8")).toBe("p");
  });

  /**
   * @test-id: tst_agent_stack_007
   * @scenario: scn_existing_ci_adoption_001
   * @covers: shared/code-production/agent-stack.ts::managedFiles
   * @deterministic: yes
   * @fixtures: temporary consumer repository with an existing CI workflow
   *
   * Test environment: isolated Git repository
   * Clients: direct installer/checker API
   * Mocks: none
   * Data: explicit external-CI package contract and one project workflow
   */
  test("tst_agent_stack_007 adopts existing CI without installing a duplicate product workflow", () => {
    const root = fixture();
    const workflow = join(root, ".github/workflows/ci.yml");
    mkdirSync(join(root, ".github/workflows"), { recursive: true });
    writeFileSync(workflow, "name: Existing CI\n");
    writeFileSync(join(root, "package.json"), packageJson(undefined, {}, {
      ci: "external",
      ciWorkflow: ".github/workflows/ci.yml",
    }));

    const installed = installStack(root);

    expect(installed.files).toHaveLength(6);
    expect(installed.files).not.toContain(".github/workflows/code-production.yml");
    expect(readFileSync(workflow, "utf8")).toBe("name: Existing CI\n");
    const manifest = readFileSync(join(root, ".agents/code-production/manifest.json"), "utf8");
    expect(manifest).toContain('"kind": "external"');
    expect(manifest).toContain('"workflow": ".github/workflows/ci.yml"');
    expect(checkStack(root).files).toEqual(installed.files);
  });

  /**
   * @test-id: tst_agent_stack_008
   * @scenario: scn_existing_ci_adoption_002
   * @covers: shared/code-production/agent-stack.ts::readPackage
   * @deterministic: yes
   * @fixtures: temporary consumer repository without the declared workflow
   *
   * Test environment: isolated Git repository
   * Clients: direct installer API
   * Mocks: none
   * Data: external-CI package contract pointing to a missing workflow
   */
  test("tst_agent_stack_008 refuses an external CI contract without its named workflow", () => {
    const root = fixture();
    writeFileSync(join(root, "package.json"), packageJson(undefined, {}, {
      ci: "external",
      ciWorkflow: ".github/workflows/ci.yml",
    }));

    expect(() => installStack(root)).toThrow("external CI workflow does not exist");
  });

  test("tst_agent_stack_009 refuses a directory in place of an external CI workflow", () => {
    const root = fixture();
    mkdirSync(join(root, ".github/workflows/ci.yml"), { recursive: true });
    writeFileSync(join(root, "package.json"), packageJson(undefined, {}, {
      ci: "external",
      ciWorkflow: ".github/workflows/ci.yml",
    }));

    expect(() => installStack(root)).toThrow("external CI workflow must be a regular file");
  });

  test("tst_agent_stack_010 refuses inconsistent external CI declarations", () => {
    const candidates: ReadonlyArray<readonly [Readonly<Record<string, string>>, string]> = [
      [{ ciWorkflow: ".github/workflows/ci.yml" }, "requires agentStack.ci = external"],
      [{ ci: "managed", ciWorkflow: ".github/workflows/ci.yml" }, "requires agentStack.ci = external"],
      [{ ci: "unknown" }, "must be managed or external"],
      [{ ci: "external", ciWorkflow: "ci.yml" }, "must name an existing project-owned GitHub workflow"],
      [{ ci: "external", ciWorkflow: ".github/workflows/code-production.yml" }, "must name an existing project-owned GitHub workflow"],
    ];

    for (const [agentStack, message] of candidates) {
      const root = fixture();
      writeFileSync(join(root, "package.json"), packageJson(undefined, {}, agentStack));
      expect(() => installStack(root)).toThrow(message);
    }
  });

  test("tst_agent_stack_011 refuses external ownership while the managed workflow remains", () => {
    const root = fixture();
    const workflows = join(root, ".github/workflows");
    mkdirSync(workflows, { recursive: true });
    const externalWorkflow = join(workflows, "ci.yml");
    const managedWorkflow = join(workflows, "code-production.yml");
    writeFileSync(externalWorkflow, "name: Existing CI\n");
    writeFileSync(managedWorkflow, "# Managed by 0_agents code-production\n");
    writeFileSync(join(root, "package.json"), packageJson(undefined, {}, {
      ci: "external",
      ciWorkflow: ".github/workflows/ci.yml",
    }));

    expect(() => installStack(root)).toThrow("remove it explicitly to avoid duplicate gates");
    expect(readFileSync(externalWorkflow, "utf8")).toBe("name: Existing CI\n");
    expect(readFileSync(managedWorkflow, "utf8")).toContain("Managed by 0_agents");
  });

  test("tst_agent_stack_012 refuses a symlink in place of an external CI workflow", () => {
    const root = fixture();
    const workflows = join(root, ".github/workflows");
    mkdirSync(workflows, { recursive: true });
    writeFileSync(join(workflows, "workflow-target.yml"), "name: Target\n");
    symlinkSync("workflow-target.yml", join(workflows, "ci.yml"));
    writeFileSync(join(root, "package.json"), packageJson(undefined, {}, {
      ci: "external",
      ciWorkflow: ".github/workflows/ci.yml",
    }));

    expect(() => installStack(root)).toThrow("external CI workflow must be a regular file");
  });

  test("tst_agent_stack_013 keeps markerless approved plans operable through the legacy freeze", () => {
    const root = fixture();
    const plan = "docs/plans/legacy.md";
    const planPath = join(root, plan);
    mkdirSync(join(root, "docs/plans"), { recursive: true });
    writeFileSync(planPath, [
      "---",
      "doc_type: plan",
      "status: historical",
      "---",
      "# Legacy plan",
      "",
      "Status: APPROVED",
      "",
      "## Goal",
      "",
      "Original contract.",
      "",
      "## Amendments",
      "",
      "- None.",
      "",
    ].join("\n"));
    git(root, "add", plan);
    git(root, "commit", "-m", "plan: add legacy fixture");
    installStack(root);

    writeFileSync(planPath, readFileSync(planPath, "utf8")
      .replace("Original contract.", "Owner-amended contract.")
      .replace("- None.", "- None.\n- 2026-08-29 (owner word): migrate this approved plan."));
    git(root, "add", plan);

    const committed = spawnSync("git", ["-C", root, "commit", "-m", "plan: amend legacy fixture"], {
      encoding: "utf8",
    });
    expect(`${committed.stdout}${committed.stderr}`).not.toMatch(/no journal|missing canonical protocol/i);
    expect(committed.status).toBe(0);
  });
});
