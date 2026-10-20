import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import { z } from "zod";
import type { GateViolation } from "./plan-gate";

export interface VocabularyEntry {
  readonly term: string;
  readonly meaning: string;
  readonly forbidden: readonly string[];
  readonly definitions: readonly { readonly repository: string; readonly path: string; readonly name: string }[];
}

export interface VocabularyChange {
  readonly before: VocabularyEntry | null;
  readonly after: VocabularyEntry | null;
  readonly reason: string;
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Worktree-local Git storage keeps generated evidence out of work commits. */
export function cacheDirectory(root: string, name: string): string {
  const result = spawnSync("git", ["-C", root, "rev-parse", "--path-format=absolute", "--git-path", `planctl/${name}`], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : resolve(root, ".tmp/planctl", name);
}

/** Paths in evidence are repository-relative, including their real symlink destination. */
export function evidencePath(root: string, path: string): string {
  if (isAbsolute(path) || path.split(/[\\/]/).includes("..")) throw new Error("definition path must stay inside its repository");
  const absolute = resolve(root, path);
  let existing = absolute;
  while (!existsSync(existing) && dirname(existing) !== existing) existing = dirname(existing);
  if (relative(realpathSync(root), realpathSync(existing)).startsWith("..")) {
    throw new Error("definition symlink leaves its repository");
  }
  return absolute;
}

/** Reuse the existing repository mapping. No guessed checkout when it is absent. */
function definitionRoot(root: string, repository: string): string {
  if (repository === ".") return root;
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(repository)) throw new Error("invalid repository name");
  const r = spawnSync("git", ["-C", root, "config", "--get", `code-production.repository.${repository}`], { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout.trim()) throw new Error(`repository ${repository} has no configured checkout`);
  return resolve(root, r.stdout.trim());
}

/** Markdown stays readable. Definition cells use repo:path#Symbol, or path#Symbol locally. */
export function parseVocabulary(text: string): readonly VocabularyEntry[] {
  const lines = text.split("\n");
  const header = lines.findIndex(line => /^\|\s*Term\s*\|\s*(?:Meaning|What it names)\s*\|/i.test(line));
  if (header < 0) return [];
  const rows: string[][] = [];
  for (const line of lines.slice(header + 2)) {
    if (!line.trim().startsWith("|")) break;
    rows.push(line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim().replace(/`/g, "")));
  }
  const entries: VocabularyEntry[] = [];
  for (const row of rows) {
    const [term, meaning, forbidden = "", definitions = ""] = row;
    if (!term || !meaning || /^(?:Term|-+)$/i.test(term)) continue;
    entries.push({
      term, meaning, forbidden: forbidden.split(",").map(s => s.trim()).filter(Boolean),
      definitions: definitions.split(",").map(s => s.trim()).filter(Boolean).map(ref => {
        const [file, name] = ref.split("#");
        if (!file || !name) throw new Error(`definition ${ref} must name path#Symbol`);
        const colon = file.indexOf(":");
        return { repository: colon < 0 ? "." : file.slice(0, colon), path: colon < 0 ? file : file.slice(colon + 1), name };
      }),
    });
  }
  return entries;
}

const cell = z.string().min(1).refine(s => !/[\r\n|]/.test(s), "Use a single Markdown table cell");
export const vocabularyEntrySchema = z.object({
  term: cell, meaning: cell, forbidden: z.array(cell),
  definitions: z.array(z.object({ repository: cell, path: cell, name: cell })),
});
export const vocabularyChangesSchema = z.object({
  baseRevision: z.string(),
  entries: z.array(z.object({
    before: vocabularyEntrySchema.nullable(), after: vocabularyEntrySchema.nullable(), reason: cell,
  }).refine(c => c.before !== null || c.after !== null, "A vocabulary change needs before or after")),
});

const PROPOSAL_START = "<!-- vocabulary-proposal:start -->";
const PROPOSAL_END = "<!-- vocabulary-proposal:end -->";

/** Proposals are part of the SPEC bytes the owner approves, not a hidden side database. */
export function withVocabularyProposal(spec: string, changes: { readonly baseRevision: string; readonly entries: readonly VocabularyChange[] }): string {
  const parsed = vocabularyChangesSchema.parse(changes);
  if (spec.includes(PROPOSAL_START)) throw new Error("Use vocabularyChanges for the dictionary proposal; do not duplicate its stored block.");
  return `${spec}\n\n### Proposed vocabulary changes\n\n${parsed.entries.map(c =>
    `- **${c.after?.term ?? c.before?.term}**: ${c.reason}\n`
      + `  Before: ${c.before === null ? "not defined" : `${c.before.term} — ${c.before.meaning}; avoided names: ${c.before.forbidden.join(", ") || "none"}; definitions: ${c.before.definitions.map(d => `${d.repository}:${d.path}#${d.name}`).join(", ") || "not linked"}`}\n`
      + `  After: ${c.after === null ? "removed" : `${c.after.term} — ${c.after.meaning}; avoided names: ${c.after.forbidden.join(", ") || "none"}; definitions: ${c.after.definitions.map(d => `${d.repository}:${d.path}#${d.name}`).join(", ") || "not linked"}`}`).join("\n")}\n\n${PROPOSAL_START}\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\`\n${PROPOSAL_END}`;
}

/** Produce the dictionary bytes; the plan writer commits them together with approval. */
export function approvedVocabularyFile(root: string, spec: string): { path: "docs/vocabulary.md"; before: string | null; after: string } | null {
  const start = spec.indexOf(PROPOSAL_START);
  if (start < 0) return null;
  const end = spec.indexOf(PROPOSAL_END, start);
  if (end < 0) throw new Error("Incomplete vocabulary proposal");
  const raw = spec.slice(start + PROPOSAL_START.length, end).trim().replace(/^```json\s*\n/, "").replace(/\n```$/, "");
  const changes = vocabularyChangesSchema.parse(JSON.parse(raw));
  const dictionary = readVocabulary(root);
  if (dictionary.vocabularyRevision !== changes.baseRevision) throw new Error("The vocabulary changed after this proposal; read its current definitions and revise the proposal.");
  const path = "docs/vocabulary.md";
  const absolute = evidencePath(root, path);
  const before = existsSync(absolute) ? readFileSync(absolute, "utf8") : null;
  const entries = [...parseVocabulary(before ?? "")];
  for (const change of changes.entries) {
    const old = change.before;
    const index = entries.findIndex(e => e.term === (old?.term ?? change.after?.term));
    if (old === null && index >= 0) throw new Error(`Vocabulary term ${change.after?.term} already exists`);
    if (old !== null && (index < 0 || JSON.stringify(entries[index]) !== JSON.stringify(old))) throw new Error(`Vocabulary preimage differs for ${old.term}`);
    if (index >= 0) entries.splice(index, 1);
    if (change.after !== null) {
      if (entries.some(e => e.term === change.after?.term)) throw new Error(`Duplicate vocabulary term ${change.after.term}`);
      entries.push(change.after);
    }
  }
  const table = "| Term | Meaning | Not | Definitions |\n|---|---|---|---|\n"
    + entries.map(e => `| ${e.term} | ${e.meaning} | ${e.forbidden.join(", ")} | ${e.definitions.map(d =>
      `${d.repository === "." ? "" : `${d.repository}:`}${d.path}#${d.name}`).join(", ")} |`).join("\n") + "\n";
  // Replace only the dictionary table. Explanations and unrelated tables remain intact.
  const lines = (before ?? "# Project vocabulary\n").split("\n");
  const from = lines.findIndex(line => /^\|\s*Term\s*\|\s*(?:Meaning|What it names)\s*\|/i.test(line));
  let to = from;
  if (from >= 0) while (to < lines.length && lines[to]?.trim().startsWith("|")) to++;
  const after = from < 0 ? `${lines.join("\n").trimEnd()}\n\n${table}`
    : [...lines.slice(0, from), table.trimEnd(), ...lines.slice(to)].join("\n");
  return { path, before, after };
}

/**
 * @tested-by: tst_unit_planctl_content_002
 * @invariant: entries and actual declaration bytes participate in the revision; missing evidence remains explicit.
 */
export function readVocabulary(root: string): {
  readonly entries: readonly VocabularyEntry[];
  readonly vocabularyRevision: string;
  readonly evidence: readonly { readonly path: string; readonly quote: string }[];
  readonly findings: readonly GateViolation[];
  readonly missing: readonly string[];
} {
  const entries: VocabularyEntry[] = [];
  const evidence: { path: string; quote: string }[] = [];
  const findings: GateViolation[] = [];
  const missing: string[] = [];
  const revisions: string[] = [];
  for (const path of [resolve(import.meta.dir, "../../../shared/code-production/vocabulary.md"), resolve(root, "docs/vocabulary.md")]) {
    if (!existsSync(path)) { missing.push(path); revisions.push(`${path}:missing`); continue; }
    const text = readFileSync(path, "utf8");
    revisions.push(path, text);
    try { entries.push(...parseVocabulary(text)); }
    catch (error: unknown) {
      findings.push({ kind: "protocol-shape", rule: "vocabulary", blocking: true, line: 1, quote: path,
        text: error instanceof Error ? error.message : "Invalid vocabulary", replacement: null });
    }
  }
  for (const entry of entries) {
    for (const definition of entry.definitions) {
      const display = `${definition.repository}:${definition.path}#${definition.name}`;
      try {
        const path = evidencePath(definitionRoot(root, definition.repository), definition.path);
        const text = readFileSync(path, "utf8");
        revisions.push(display, text);
        const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
        const nodes: ts.Node[] = [];
        const visit = (node: ts.Node): void => {
          if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isClassDeclaration(node)
            || ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText(source) === definition.name) nodes.push(node);
          ts.forEachChild(node, visit);
        };
        visit(source);
        if (nodes.length !== 1) throw new Error("declaration is missing or ambiguous");
        evidence.push({ path: display, quote: nodes[0]!.getText(source) });
      } catch {
        revisions.push(`${display}:unresolved`);
        findings.push({ kind: "protocol-shape", rule: "vocabulary", blocking: true, line: 1, quote: display,
          text: `Cannot resolve canonical definition ${display}; inspect its repository, path and symbol.`, replacement: null });
      }
    }
  }
  return { entries, vocabularyRevision: contentHash(JSON.stringify(revisions)), evidence, findings, missing };
}
