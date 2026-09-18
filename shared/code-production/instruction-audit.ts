/**
 * The instruction audit: the machine that keeps the instruction set on a diet.
 *
 * Reads the always-on set of agent instructions in this repository and refuses
 * four things: a path into this repository or a /skill that does not exist, a
 * synonym of a vocabulary term in prose, a language guide named outside a
 * by-extension rule, and a set over 900 lines. One line per finding, exit 1 when there is any.
 *
 *   bun shared/code-production/instruction-audit.ts [root]
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

export interface Finding {
  readonly kind: "dead-reference" | "vocabulary" | "language-by-file" | "size";
  readonly file: string;
  readonly line: number;
  readonly subject: string;
  readonly message: string;
}

/** The files an agent loads without asking, plus the two laws, the four
 * process skills and the three reviewers. Sizes are counted over this list. */
export const THE_SET: readonly string[] = [
  "claude/CLAUDE.md",
  "codex/AGENTS.md",
  "shared/code-production/laws/development-process.md",
  "shared/code-production/laws/plan-format.md",
  "shared/lang/typescript.md",
  "shared/lang/rust.md",
  "shared/skills/blueprint/SKILL.md",
  "shared/skills/blueprint-start/SKILL.md",
  "shared/skills/end-work/SKILL.md",
  "shared/skills/bug/SKILL.md",
  "claude/agents/coherence-cop.md",
  "claude/agents/coverage-cop.md",
  "claude/agents/simplicity-cop.md",
];

export const SIZE_LIMIT = 900;
export const VOCABULARY = "shared/code-production/vocabulary.md";
const LANGUAGE_GUIDES = ["typescript.md", "rust.md"];
const EXTENSION = /`\.[a-z]+`|\.tsx?\b|\.rs\b/;
/** The first path segment of a reference into this repository; anything
 * else names a consumer repository and is not judged here. */
const REPO_ROOTS = ["claude", "codex", "shared", "planctl", "lib"];

interface Line {
  readonly file: string;
  readonly number: number;
  readonly text: string;
  readonly prose: boolean;
}

function lines(root: string, file: string): Line[] {
  const text = readFileSync(join(root, file), "utf8");
  let inCode = false;
  return text.split("\n").map((raw, index) => {
    if (raw.trimStart().startsWith("```")) {
      inCode = !inCode;
      return { file, number: index + 1, text: raw, prose: false };
    }
    return { file, number: index + 1, text: raw, prose: !inCode };
  });
}

function deadReferences(root: string, all: readonly Line[], skills: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  for (const line of all) {
    for (const match of line.text.matchAll(/`([^`\s]+)`/g)) {
      const token = (match[1] ?? "").replace(/[.,;:)]+$/, "");
      const first = token.split("/")[0] ?? "";
      if (!token.includes("/") || !REPO_ROOTS.includes(first)) continue;
      if (/[*<>{}$]/.test(token)) continue;
      if (!existsSync(join(root, token))) {
        findings.push({ kind: "dead-reference", file: line.file, line: line.number, subject: token, message: "path does not exist in this repository" });
      }
    }
    if (!line.prose) continue;
    for (const match of line.text.matchAll(/(?:^|[\s(])\/([a-z][a-z0-9-]+)\b(?!\/)/g)) {
      const name = match[1] ?? "";
      if (!skills.includes(name)) {
        findings.push({ kind: "dead-reference", file: line.file, line: line.number, subject: `/${name}`, message: "no such skill" });
      }
    }
  }
  return findings;
}

/** The vocabulary table: term → the words that mean the same thing here and
 * are therefore not used. Read from the "Not" column of every row. */
export function synonyms(root: string): Map<string, string> {
  const path = join(root, VOCABULARY);
  if (!existsSync(path)) return new Map();
  const map = new Map<string, string>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length < 5 || cells[1] === "Term" || cells[1]?.startsWith("---")) continue;
    const term = cells[1] ?? "";
    for (const word of (cells[3] ?? "").split(",").map((w) => w.trim().toLowerCase()).filter((w) => w !== "")) {
      if (!map.has(word)) map.set(word, term);
    }
  }
  return map;
}

function vocabulary(root: string, all: readonly Line[]): Finding[] {
  const map = synonyms(root);
  if (map.size === 0) return [];
  const words = [...map.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const pattern = new RegExp(`\\b(${words.join("|")})(?:s|es)?\\b`, "gi");
  const findings: Finding[] = [];
  for (const line of all) {
    if (!line.prose || line.file === VOCABULARY) continue;
    for (const match of line.text.matchAll(pattern)) {
      const word = (match[1] ?? "").toLowerCase();
      findings.push({ kind: "vocabulary", file: line.file, line: line.number, subject: word, message: `not a term here; say "${map.get(word) ?? ""}"` });
    }
  }
  return findings;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function languageByFile(all: readonly Line[]): Finding[] {
  const findings: Finding[] = [];
  for (const line of all) {
    if (!line.prose) continue;
    const named = LANGUAGE_GUIDES.filter((guide) => line.text.includes(guide));
    if (named.length > 0 && !EXTENSION.test(line.text)) {
      findings.push({ kind: "language-by-file", file: line.file, line: line.number, subject: named.join(", "), message: "a language guide is named without the file extension that loads it" });
    }
  }
  return findings;
}

function size(all: readonly Line[]): Finding[] {
  const total = all.length;
  if (total <= SIZE_LIMIT) return [];
  return [{ kind: "size", file: "(the set)", line: 0, subject: String(total), message: `${total} lines in the set, the limit is ${SIZE_LIMIT}` }];
}

/** The owner's business skills are content, not process, and are not judged. */
const NOT_JUDGED = ["startup-pressure-test", "icp-pain", "investor"];

function everySkill(root: string): string[] {
  const dir = join(root, "shared/skills");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !NOT_JUDGED.includes(name) && existsSync(join(dir, name, "SKILL.md")))
    .map((name) => `shared/skills/${name}/SKILL.md`);
}

/** Two paths that resolve to one file (a symbolic link) are one home. */
function distinctFiles(root: string, files: readonly string[]): string[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    const real = realpathSync(join(root, file));
    if (seen.has(real)) return false;
    seen.add(real);
    return true;
  });
}

export function audit(root: string): Finding[] {
  const counted = distinctFiles(root, THE_SET.filter((file) => existsSync(join(root, file))));
  const judged = distinctFiles(root, [...new Set([...counted, ...everySkill(root)])]);
  const all = judged.flatMap((file) => lines(root, file));
  const countedLines = counted.flatMap((file) => lines(root, file));
  const skills = ["blueprint", "blueprint-start", "end-work", "bug", "rename", "review-implementation", "cleanup-worktrees", "mdurl", "dictate", "nvim"]
    .filter((name) => existsSync(join(root, "shared/skills", name)) || existsSync(join(root, "claude/skills", name)));
  return [
    ...size(countedLines),
    ...deadReferences(root, all, skills),
    ...vocabulary(root, all),
    ...languageByFile(all),
  ].sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
}

if (import.meta.main) {
  const root = resolve(process.argv[2] ?? ".");
  const findings = audit(root);
  for (const finding of findings) {
    console.log(`${finding.file}:${finding.line} ${finding.kind} ${finding.subject} — ${finding.message}`);
  }
  console.log(findings.length === 0 ? "instruction audit: clean" : `instruction audit: ${findings.length} finding(s)`);
  process.exitCode = findings.length === 0 ? 0 : 1;
}
