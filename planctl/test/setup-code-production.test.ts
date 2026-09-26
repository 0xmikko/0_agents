import { describe, expect, it } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dir, "../..");

/** Fake claude and codex on PATH: `mcp get planctl` fails until `mcp add` ran; every call is logged. */
function fakeAgents(): { readonly bin: string; readonly log: string } {
  const bin = mkdtempSync(join(tmpdir(), "fake-agents-"));
  const log = join(bin, "calls.log");
  for (const name of ["claude", "codex"]) {
    writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $*" >> "${log}"\ncase "$*" in\n  "mcp get planctl") [ -f "${bin}/${name}.registered" ] ;;\n  "mcp add "*) touch "${bin}/${name}.registered" ;;\n  *) exit 0 ;;\nesac\n`);
    chmodSync(join(bin, name), 0o755);
  }
  return { bin, log };
}

function consumer(scripts: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), "consumer-"));
  const git = (...args: readonly string[]): string => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "staging");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ name: "consumer", private: true, scripts: Object.fromEntries(scripts.map((name) => [name, "true"])) }, null, 2)}\n`);
  git("add", "package.json");
  git("commit", "-qm", "consumer");
  return root;
}

const SCRIPTS = ["agent:install", "agent:test:backend", "agent:test:frontend", "agent:test:e2e", "agent:verify:commit", "agent:verify:pr", "agent:verify:docs"];

describe("setup-code-production", () => {
  /**
   * @test-id: tst_unit_planctl_setup_001
   * @scenario: scn_planctl_setup_mcp_001
   * @covers: lib/install-planctl-mcp.sh
   * @deterministic: yes
   * @invariant: the registration runs once per user for Claude and Codex and approves every tool of the server for both, so no call asks; a second run adds nothing.
   */
  it("tst_unit_planctl_setup_001 registers planctl mcp once for Claude and Codex and approves every tool", () => {
    const agents = fakeAgents();
    const home = mkdtempSync(join(tmpdir(), "home-"));
    mkdirSync(join(home, ".codex"));
    writeFileSync(join(home, ".codex/config.toml"), 'approval_policy = "on-request"\n\n[mcp_servers.planctl]\ncommand = "planctl"\nargs = ["mcp"]\n');
    mkdirSync(join(home, ".claude"));
    writeFileSync(join(home, ".claude/settings.json"), `${JSON.stringify({ permissions: { allow: ["Bash(*)"], deny: ["Bash(sudo *)"] } }, null, 2)}\n`);
    try {
      for (let run = 0; run < 2; run += 1) {
        const result = spawnSync("bash", [join(REPO, "lib/install-planctl-mcp.sh")], { encoding: "utf8", env: { ...process.env, HOME: home, PATH: `${agents.bin}:${process.env.PATH ?? ""}` } });
        expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      }
      const calls = readFileSync(agents.log, "utf8").trim().split("\n");
      expect(calls.filter((line) => line === "claude mcp add -s user planctl -- planctl mcp")).toHaveLength(1);
      expect(calls.filter((line) => line === "codex mcp add planctl -- planctl mcp")).toHaveLength(1);
      const tools = execFileSync("bun", [join(REPO, "planctl/src/cli/main.ts"), "mcp", "--tools"], { encoding: "utf8" }).trim().split("\n");
      expect(tools).toContain("submit_spec");
      const codex = readFileSync(join(home, ".codex/config.toml"), "utf8");
      for (const tool of tools) {
        expect(codex.split(`[mcp_servers.planctl.tools.${tool}]\napproval_mode = "approve"\n`)).toHaveLength(2);
      }
      expect(codex.startsWith('approval_policy = "on-request"\n\n[mcp_servers.planctl]\ncommand = "planctl"\nargs = ["mcp"]\n')).toBe(true);
      const claude = JSON.parse(readFileSync(join(home, ".claude/settings.json"), "utf8")) as { permissions: { allow: string[]; deny: string[] } };
      expect(claude.permissions.allow).toEqual(["Bash(*)", "mcp__planctl"]);
      expect(claude.permissions.deny).toEqual(["Bash(sudo *)"]);
    } finally {
      rmSync(agents.bin, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  });

  /**
   * @test-id: tst_unit_planctl_setup_002
   * @scenario: scn_planctl_setup_repo_001
   * @covers: lib/setup-code-production.sh
   * @deterministic: yes
   * @invariant: one command installs the runtime, hooks, workflow, base config and skill copies and registers the server; a repository without the contract is refused by name.
   */
  it("tst_unit_planctl_setup_002 installs everything with one command and refuses a repository without the contract", () => {
    const agents = fakeAgents();
    const good = consumer(SCRIPTS);
    const bad = consumer(SCRIPTS.filter((name) => name !== "agent:verify:pr"));
    const env = { ...process.env, PATH: `${agents.bin}:${process.env.PATH ?? ""}` };
    try {
      const installed = spawnSync("bash", [join(REPO, "lib/setup-code-production.sh"), "--repo", good, "--base", "staging"], { encoding: "utf8", env });
      expect(installed.status, `${installed.stdout}\n${installed.stderr}`).toBe(0);
      for (const path of [
        ".agents/code-production/runtime/planctl.ts",
        ".githooks/pre-commit",
        ".github/workflows/code-production.yml",
        ".claude/skills/blueprint/SKILL.md",
        ".agents/skills/end-work/SKILL.md",
      ]) expect(existsSync(join(good, path)), path).toBe(true);
      expect(execFileSync("git", ["-C", good, "config", "--get", "code-production.base"], { encoding: "utf8" }).trim()).toBe("staging");
      expect(readFileSync(agents.log, "utf8")).toContain("claude mcp add -s user planctl -- planctl mcp");
      const checked = spawnSync("bun", [join(REPO, "shared/code-production/agent-stack.ts"), "check", good], { encoding: "utf8" });
      expect(checked.status, checked.stderr).toBe(0);
      expect(installed.stdout).toContain("agent-stack: install OK");

      const refused = spawnSync("bash", [join(REPO, "lib/setup-code-production.sh"), "--repo", bad, "--base", "staging"], { encoding: "utf8", env });
      expect(refused.status).not.toBe(0);
      expect(`${refused.stdout}${refused.stderr}`).toContain("agent:verify:pr");
      expect(existsSync(join(bad, ".agents/code-production/runtime/planctl.ts"))).toBe(false);
    } finally {
      rmSync(agents.bin, { recursive: true, force: true });
      rmSync(good, { recursive: true, force: true });
      rmSync(bad, { recursive: true, force: true });
    }
  });
});
