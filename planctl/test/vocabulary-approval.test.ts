import { expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { dispatchTool } from "../src/mcp/server";
import { planJournalPath, protocolSpecHash, recoverPlanMutation, verifyStagedPlan } from "../src/core/plan-update";
import { approvedVocabularyFile, readVocabulary, withVocabularyProposal } from "../src/core/vocabulary";

/**
 * @test-id: tst_unit_planctl_vocabulary_approval_001
 * @scenario: scn_planctl_vocabulary_approval_001
 * @covers: planctl/src/mcp/server.ts::approve_spec, planctl/src/core/plan-update.ts::recoverPlanMutation
 * @deterministic: yes
 * @invariant: stale approval writes nothing; exact approval applies the vocabulary,
 * and interrupted before/after combinations recover from the same durable journal.
 */
it("tst_unit_planctl_vocabulary_approval_001 approves exact bytes and recovers interrupted dictionary writes", async () => {
  const root = mkdtempSync(join(tmpdir(), "vocabulary-approval-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git("init", "-q", "-b", "main"); git("config", "user.email", "test@example.com"); git("config", "user.name", "Test");
    git("commit", "--allow-empty", "-qm", "fixture"); git("config", "code-production.base", "main");
    git("checkout", "-qb", "feat/vocabulary");
    const deps = { cwd: root, sourceCommit: git("rev-parse", "HEAD"), eventLog: join(root, "events.jsonl"),
      publisher: () => "http://fixture/plan", publication: () => null };
    const init = await dispatchTool(deps, "init", { root, title: "One dictionary proposal" });
    expect(init.isError).not.toBe(true);
    const plan = String(init.structuredContent?.plan);
    const absolute = join(root, plan);
    const spec = "## The Goal\n\nStore the selected value.\n\n## The target\n\n### Save\n\nThe caller sends a value to Store; Store writes it and returns success. Failed writes return an error.\n\n#### Interfaces\n\n```typescript\nexport interface Store {\n  save(value: string): void;\n}\n```\n";
    const saved = await dispatchTool(deps, "submit_spec", {
      plan: absolute, baseRevision: protocolSpecHash(readFileSync(absolute, "utf8")), ownerRequest: "Store the value", spec,
      vocabularyChanges: { baseRevision: readVocabulary(root).vocabularyRevision, entries: [{
        before: null, after: { term: "Store", meaning: "Owns value persistence", forbidden: [], definitions: [] },
        reason: "The proposed persistence responsibility has no existing project definition.",
      }] },
    });
    expect(saved.isError, JSON.stringify(saved.content)).not.toBe(true);
    const before = readFileSync(absolute, "utf8");
    const stale = await dispatchTool(deps, "approve_spec", { plan: absolute, ownerWord: "Approve this SPEC", expectedRevision: "stale" });
    expect(stale.isError).toBe(true);
    expect(readFileSync(absolute, "utf8")).toBe(before);
    expect(existsSync(join(root, "docs/vocabulary.md"))).toBe(false);
    const approved = await dispatchTool(deps, "approve_spec", {
      plan: absolute, ownerWord: "Approve this SPEC", expectedRevision: saved.structuredContent?.revision,
    });
    expect(approved.isError, JSON.stringify(approved.content)).not.toBe(true);
    const after = readFileSync(absolute, "utf8");
    expect(after).toContain("Status: SPEC_LOCKED");
    expect(readVocabulary(root).entries.some(e => e.term === "Store")).toBe(true);
    const path = planJournalPath(root, plan);
    const complete = JSON.parse(readFileSync(path, "utf8"));
    for (const planWritten of [false, true]) for (const dictionaryWritten of [false, true]) {
      writeFileSync(absolute, planWritten ? after : before);
      if (!dictionaryWritten) rmSync(join(root, "docs/vocabulary.md"), { force: true });
      else writeFileSync(join(root, "docs/vocabulary.md"), complete.vocabularyFile.after);
      writeFileSync(path, JSON.stringify({ ...complete, pending: { before, after } }));
      recoverPlanMutation(root, plan);
      expect(readFileSync(absolute, "utf8")).toBe(after);
      expect(readFileSync(join(root, "docs/vocabulary.md"), "utf8")).toBe(complete.vocabularyFile.after);
      expect(JSON.parse(readFileSync(path, "utf8")).pending).toBeUndefined();
      verifyStagedPlan(root, plan);
    }
    writeFileSync(join(root, "docs/vocabulary.md"), "Unapproved replacement.");
    git("add", "docs/vocabulary.md");
    expect(() => verifyStagedPlan(root, plan)).toThrow(/vocabulary/i);
    writeFileSync(join(root, "docs/vocabulary.md"), complete.vocabularyFile.after);
    git("add", "docs/vocabulary.md");
    // A third version is never overwritten by recovery.
    writeFileSync(path, JSON.stringify({ ...complete, pending: { before, after } }));
    writeFileSync(join(root, "docs/vocabulary.md"), "A concurrent owner's edit.");
    expect(() => recoverPlanMutation(root, plan)).toThrow(/conflicts/);
    expect(readFileSync(join(root, "docs/vocabulary.md"), "utf8")).toBe("A concurrent owner's edit.");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

/**
 * @test-id: tst_unit_planctl_vocabulary_approval_002
 * @scenario: scn_planctl_vocabulary_preserve_001
 * @covers: planctl/src/core/vocabulary.ts::approvedVocabularyFile
 * @deterministic: yes
 * @invariant: a term change preserves explanations and unrelated tables, and stale proposals cannot overwrite them.
 */
it("tst_unit_planctl_vocabulary_approval_002 preserves dictionary context", () => {
  const root = mkdtempSync(join(tmpdir(), "vocabulary-context-"));
  try {
    execFileSync("mkdir", ["-p", join(root, "docs")]);
    const path = join(root, "docs/vocabulary.md");
    const before = "# Domain words\n\nKeep this explanation.\n\n| Term | Meaning | Not | Definitions |\n|---|---|---|---|\n| Store | Owns persistence | | |\n\n## Usage\n\n| Command | Result |\n|---|---|\n| save | saved |\n";
    writeFileSync(path, before);
    const dictionary = readVocabulary(root);
    expect(dictionary.entries.some(e => e.term === "save")).toBe(false);
    const entry = dictionary.entries.find(e => e.term === "Store")!;
    const spec = withVocabularyProposal("Save one value.", { baseRevision: dictionary.vocabularyRevision,
      entries: [{ before: entry, after: { ...entry, meaning: "Owns durable values" }, reason: "Clarify the existing responsibility" }] });
    const update = approvedVocabularyFile(root, spec)!;
    expect(update.after).toContain("Keep this explanation.");
    expect(update.after).toContain("| save | saved |");
    expect(update.after).toContain("Owns durable values");
    writeFileSync(path, before + "Concurrent clarification.\n");
    expect(() => approvedVocabularyFile(root, spec)).toThrow(/vocabulary changed/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
