import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { audit, type Finding } from "../../shared/code-production/instruction-audit";

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

  // @test-id: tst_audit_002
  // @invariant: a sentence of twelve or more words present in two files is
  // refused and named in both files (one-home).
  it("tst_audit_002 refuses a twelve-word sentence that lives in two files", () => {
    const sentence = "Never rewrite history, never rebase, never amend, never force-push and never squash commits before a pull request.";
    const root = tree({
      "claude/CLAUDE.md": `# Working here\n\n${sentence}\n`,
      "shared/code-production/laws/development-process.md": `# Process\n\n- ${sentence}\n`,
    });
    try {
      const findings = audit(root);
      expect(kinds(findings)).toEqual(["one-home"]);
      expect(findings.map((finding) => finding.file).sort()).toEqual([
        "claude/CLAUDE.md",
        "shared/code-production/laws/development-process.md",
      ]);
      expect(findings[0]?.line).toBe(3);
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
  // @invariant: a banned word in prose is refused; inside a code block it is not.
  it("tst_audit_004 refuses a banned word in prose and not in a code block", () => {
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
      expect(kinds(findings)).toEqual(["banned-word"]);
      expect(findings.map((finding) => finding.subject).sort()).toEqual(["farm", "lane", "receipt", "stand"]);
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
