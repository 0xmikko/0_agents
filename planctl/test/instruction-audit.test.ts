import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { audit, type Finding } from "../../shared/code-production/instruction-audit";
import { retroStatus } from "../src/core/retro-register";

/** A fixture tree with the same layout as 0_agents: every file of the set
 * present and clean unless a test overrides it. */
function tree(overrides: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "instruction-audit-"));
  const clean: Record<string, string> = {
    "claude/CLAUDE.md": "# Working here\n\nOne name per thing.\n",
    "codex/AGENTS.md": "# Working here\n\nOne name per thing.\n",
    "shared/code-production/laws/development-process.md": "# Process\n\nOne commit per Stage.\n",
    "shared/code-production/laws/plan-format.md": "# Plan format\n\nThe Goal comes first.\n",
    "shared/lang/typescript.md": "# TypeScript\n\nNo any.\n",
    "shared/lang/rust.md": "# Rust\n\nNo unwrap.\n",
    "shared/skills/blueprint/SKILL.md": "# Blueprint\n\nWrite the plan.\n",
    "shared/skills/blueprint-start/SKILL.md": "# Blueprint start\n\nRun the plan.\n",
    "shared/skills/end-work/SKILL.md": "# End work\n\nClose the Delivery.\n",
    "shared/skills/bug/SKILL.md": "# Bug\n\nRed test first.\n",
    "claude/agents/coherence-cop.md": "# Coherence\n\nReuse.\n",
    "claude/agents/coverage-cop.md": "# Coverage\n\nTests.\n",
    "claude/agents/simplicity-cop.md": "# Simplicity\n\nLess.\n",
    "shared/code-production/vocabulary.md":
      "# Vocabulary\n\n| Term | What it names | Not |\n|---|---|---|\n| Stage result file | stage-result.json | receipt |\n| suite | one project's tests | lane |\n| dev server | a running backend | stand, farm |\n",
    ...overrides,
  };
  for (const [path, text] of Object.entries(clean)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function kinds(findings: readonly Finding[]): string[] {
  return [...new Set(findings.map((finding) => finding.kind))].sort();
}

describe("instruction audit", () => {
  // @test-id: tst_audit_001
  // @covers: shared/code-production/instruction-audit.ts::audit
  // @deterministic: yes
  // @invariant: a clean set of instruction files passes with no finding.
  it("tst_audit_001 a clean set passes", () => {
    const root = tree();
    try {
      expect(audit(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // @test-id: tst_audit_003
  // @invariant: a path into this repository or a /skill that does not exist
  // is refused; a path into a consumer repository is not judged here.
  it("tst_audit_003 refuses a dead path and a dead skill, ignores consumer paths", () => {
    const root = tree({
      "claude/CLAUDE.md":
        "# Working here\n\nRead `shared/lang/typescript.md` for `.ts` files.\nSee `claude/agents/git.md`.\nRun /blueprint or /start-work.\nHooks live in `.githooks/pre-push` and `docs/testing/policy.md`; mdurl installs into /usr/local/bin.\n",
    });
    try {
      const findings = audit(root);
      expect(kinds(findings)).toEqual(["dead-reference"]);
      expect(findings.map((finding) => `${finding.line}:${finding.subject}`).sort()).toEqual([
        "4:claude/agents/git.md",
        "5:/start-work",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // @test-id: tst_audit_004
  // @invariant: a synonym of a vocabulary term in prose is refused and the
  // term is named; inside a code block it is not; the vocabulary page itself
  // is not judged.
  it("tst_audit_004 refuses a synonym of a vocabulary term in prose, names the term, spares code blocks", () => {
    const root = tree({
      "shared/code-production/laws/plan-format.md":
        "# Plan format\n\nEach lane buys its receipt at the stand.\n\n```bash\nplanctl --lane fast\n```\n",
      // a utility skill outside the counted set is still judged
      "shared/skills/mdurl/SKILL.md": "# mdurl\n\nPublish to the farm.\n",
      // the owner's business skills are not
      "shared/skills/investor/SKILL.md": "# Investor\n\nThe ceremony of a pitch.\n",
    });
    try {
      const findings = audit(root);
      expect(kinds(findings)).toEqual(["vocabulary"]);
      expect(findings.map((finding) => finding.subject).sort()).toEqual(["farm", "lane", "receipt", "stand"]);
      expect(findings.find((finding) => finding.subject === "receipt")?.message).toBe('not a term here; say "Stage result file"');
      expect(findings.filter((finding) => finding.file.endsWith("plan-format.md")).every((finding) => finding.line === 3)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // @test-id: tst_audit_005
  // @invariant: a language guide is named only on a line that routes by file
  // extension.
  it("tst_audit_005 refuses a language guide named without a file extension", () => {
    const root = tree({
      "claude/CLAUDE.md":
        "# Working here\n\nLanguage guide by file: `.ts`/`.tsx` → `shared/lang/typescript.md`, `.rs` → `shared/lang/rust.md`.\nRead `shared/lang/rust.md` for every task that touches Rust.\n",
    });
    try {
      const findings = audit(root);
      expect(kinds(findings)).toEqual(["language-by-file"]);
      expect(findings.map((finding) => finding.line)).toEqual([4]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // @test-id: tst_audit_006
  // @invariant: the always-loaded set plus the two laws and the four process
  // skills is at most 900 lines, counted as one number.
  it("tst_audit_006 refuses a set over 900 lines and names the count", () => {
    const root = tree({ "shared/skills/blueprint/SKILL.md": `# Blueprint\n\n${"A line.\n".repeat(900)}` });
    try {
      const findings = audit(root);
      expect(kinds(findings)).toEqual(["size"]);
      expect(findings[0]?.message).toMatch(/9\d\d lines/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    // a utility skill's lines are judged but not counted
    const utility = tree({ "shared/skills/mdurl/SKILL.md": `# mdurl\n\n${"A line.\n".repeat(900)}` });
    try {
      expect(audit(utility)).toEqual([]);
    } finally {
      rmSync(utility, { recursive: true, force: true });
    }
  });
});

describe("the global screen", () => {
  const root = join(import.meta.dir, "../..");
  // @test-id: tst_audit_screen_001
  // @covers: claude/CLAUDE.md, codex/AGENTS.md
  // @deterministic: yes
  // @invariant: the always-on screen is one short page, byte-identical for
  // Claude and Codex, with exactly one IMPORTANT line and the numbered
  // mistakes list, naming no skill but the two modes and no banned word.
  it("tst_audit_screen_001 one page, identical for Claude and Codex, one IMPORTANT, the mistakes list, no dead skill", () => {
    const claude = readFileSync(join(root, "claude/CLAUDE.md"), "utf8");
    const codex = readFileSync(join(root, "codex/AGENTS.md"), "utf8");
    expect(codex).toBe(claude);
    const lines = claude.split("\n").filter((line) => line.trim() !== "");
    expect(lines.length).toBeLessThanOrEqual(30);
    expect(claude.match(/IMPORTANT/g)?.length).toBe(1);
    expect(claude).toMatch(/Mistakes this model keeps making/);
    expect(claude.match(/^- /gm)?.length).toBe(5);
    for (const skill of ["/start-work", "/end-work", "/test-protocol", "/fix-ci-cd", "/execute", "/finish-plan"]) {
      expect(claude).not.toContain(skill);
    }
    expect(claude).toContain("/blueprint");
    expect(claude).toContain("/blueprint-start");
    expect(audit(root).filter((finding) => finding.file === "claude/CLAUDE.md")).toEqual([]);
  });
});

describe("the skills", () => {
  const root = join(import.meta.dir, "../..");
  /** The four skills that are the process, and the words each must say
   * because the SPEC says it does. */
  const PROCESS: Record<string, readonly string[]> = {
    blueprint: ["origin/staging", "Why now", "Interfaces", "Stage 0", "approve-spec", "approve-plan"],
    "blueprint-start": ["start-task", "complete-task", "add-deviation", "pre-push", "coherence", "coverage", "simplicity"],
    "end-work": ["merged", "register", "retro-status", "worktree"],
    bug: ["red", "Skipping red test"],
  };
  /** The cargo-era and Cyrus skills. A retired skill is gone when no skill
   * directory carries its name and no living skill or page invokes it. */
  const RETIRED = [
    "start-work", "test-protocol", "completion-note", "verify-app", "verify-frontend", "fast-precommit",
    "fix-ci-cd", "quick-fix", "plan", "review-plan", "execute", "finish-plan", "git",
    "dispatch-to-linear", "execute-from-linear", "launch-e2e",
  ];
  function skillFiles(dir: string): string[] {
    const home = join(root, dir);
    return readdirSync(home)
      .map((name) => join(dir, name, "SKILL.md"))
      .filter((file) => existsSync(join(root, file)));
  }
  // @test-id: tst_audit_skills_001
  // @covers: shared/skills/*/SKILL.md, claude/skills, codex/skills, README.md, ONBOARDING.md
  // @deterministic: yes
  // @invariant: the four process skills are each under 60 lines and say what
  // the SPEC says they say; the sixteen retired skills have no directory and
  // are named by no living skill, README or ONBOARDING.
  it("tst_audit_skills_001 four process skills under 60 lines, sixteen retired skills gone and unnamed", () => {
    for (const [name, says] of Object.entries(PROCESS)) {
      const text = readFileSync(join(root, "shared/skills", name, "SKILL.md"), "utf8");
      const lines = text.trimEnd().split("\n").length;
      expect({ name, lines, under60: lines < 60 }).toEqual({ name, lines, under60: true });
      expect({ name, missing: says.filter((word) => !text.includes(word)) }).toEqual({ name, missing: [] });
    }
    const dirs = ["shared/skills", "claude/skills", "codex/skills"];
    const present = dirs.flatMap((dir) => RETIRED.filter((name) => existsSync(join(root, dir, name))).map((name) => `${dir}/${name}`));
    expect(present).toEqual([]);
    const pages = [...dirs.flatMap(skillFiles), "README.md", "ONBOARDING.md"];
    const named = pages.flatMap((file) => {
      const text = readFileSync(join(root, file), "utf8");
      return RETIRED.filter((name) => new RegExp(`(^|[\\s\`(])/${name}\\b`, "m").test(text)).map((name) => `${file} names /${name}`);
    });
    expect(named).toEqual([]);
  });
});

describe("the laws", () => {
  const root = join(import.meta.dir, "../..");
  const LAWS = "shared/code-production/laws";
  // @test-id: tst_audit_laws_001
  // @covers: shared/code-production/laws/development-process.md, plan-format.md
  // @deterministic: yes
  // @invariant: two laws carry every surviving rule once: the process under
  // 100 lines with the three tiers (the owner's word named only after the
  // refused tier) and the register of experiments; the plan format under 100;
  // the audit finds nothing in them.
  it("tst_audit_laws_001 two laws, each under 100 lines, three tiers, a register, clean audit", () => {
    expect(readdirSync(join(root, LAWS)).sort()).toEqual(["development-process.md", "plan-format.md"]);
    const process = readFileSync(join(root, LAWS, "development-process.md"), "utf8");
    const format = readFileSync(join(root, LAWS, "plan-format.md"), "utf8");
    const count = (text: string): number => text.trimEnd().split("\n").length;
    expect({ process: count(process), format: count(format), fits: count(process) < 100 && count(format) < 100 })
      .toEqual({ process: count(process), format: count(format), fits: true });
    const tiers = process.slice(process.indexOf("## Three tiers"), process.indexOf("## Git"));
    expect(tiers.match(/^(Free|Recorded|Refused by planctl) — /gm)).toEqual(["Free — ", "Recorded — ", "Refused by planctl — "]);
    expect(tiers.match(/owner's word/g)?.length).toBe(1);
    expect(tiers.indexOf("owner's word")).toBeGreaterThan(tiers.indexOf("Refused by planctl"));
    expect(retroStatus(join(root, LAWS, "development-process.md")).ok).toBe(true);
    expect(audit(root).filter((finding) => finding.file.startsWith(LAWS))).toEqual([]);
  });
});

describe("the audit as a command", () => {
  // @test-id: tst_audit_007
  // @covers: shared/code-production/instruction-audit.ts (main)
  // @deterministic: yes
  // @invariant: findings fail the run only under --strict; without it the
  // audit reports and exits 0, so the diet's Stages can publish before it ends.
  it("tst_audit_007 reports without --strict and refuses with it", () => {
    const root = tree({ "claude/CLAUDE.md": "# Working here\n\nSee `claude/agents/git.md`.\n" });
    const script = join(import.meta.dir, "../../shared/code-production/instruction-audit.ts");
    try {
      const report = Bun.spawnSync(["bun", script, root], { stdout: "pipe", stderr: "pipe" });
      expect(report.exitCode).toBe(0);
      expect(report.stdout.toString()).toContain("1 finding(s) (reported, not enforced until --strict)");
      const strict = Bun.spawnSync(["bun", script, "--strict", root], { stdout: "pipe", stderr: "pipe" });
      expect(strict.exitCode).toBe(1);
      expect(strict.stdout.toString()).toContain("dead-reference claude/agents/git.md");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
