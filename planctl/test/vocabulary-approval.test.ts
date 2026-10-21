import { expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { dispatchTool } from "../src/mcp/server";
import { createDraftPlan, planJournalPath, protocolSpecHash, recoverPlanMutation, verifyStagedPlan } from "../src/core/plan-update";
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
    mkdirSync(join(root, "docs/plans"), { recursive: true });
    const second = "docs/plans/second.md";
    writeFileSync(join(root, second), createDraftPlan("Second proposal"));
    git("add", second); git("commit", "-qm", "independent draft");
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
    // An interrupted first plan must finish before a second plan can approve
    // a dictionary proposal based on the old bytes.
    writeFileSync(absolute, before);
    rmSync(join(root, "docs/vocabulary.md"));
    writeFileSync(path, JSON.stringify({ ...complete, pending: { before, after } }));
    const oldDictionary = readVocabulary(root).vocabularyRevision;
    const secondSaved = await dispatchTool(deps, "submit_spec", {
      plan: join(root, second), baseRevision: protocolSpecHash(readFileSync(join(root, second), "utf8")),
      ownerRequest: "Store a value", spec, vocabularyChanges: { baseRevision: oldDictionary,
        entries: [{ before: null, after: { term: "Second", meaning: "Another value", forbidden: [], definitions: [] }, reason: "Separate proposal" }] },
    });
    expect(secondSaved.isError, JSON.stringify(secondSaved.content)).not.toBe(true);
    expect(readFileSync(absolute, "utf8")).toBe(after);
    expect(readFileSync(join(root, "docs/vocabulary.md"), "utf8")).toBe(complete.vocabularyFile.after);
    const secondBefore = readFileSync(join(root, second), "utf8");
    const secondApproved = await dispatchTool(deps, "approve_spec", {
      plan: join(root, second), expectedRevision: secondSaved.structuredContent?.revision, ownerWord: "Approve this SPEC",
    });
    expect(secondApproved.isError).toBe(true);
    expect(readFileSync(join(root, second), "utf8")).toBe(secondBefore);
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

/** @test-id: tst_unit_planctl_vocabulary_approval_003
 * @scenario: scn_planctl_proposed_definition_001
 * @covers: planctl/src/mcp/server.ts::approve_plan, planctl/src/core/content-check.ts::checkContent
 * @deterministic: yes
 * @invariant: a declared new contract can be planned before its canonical file exists.
 */
it("tst_unit_planctl_vocabulary_approval_003 approves a planned canonical definition", async () => {
  const root = mkdtempSync(join(tmpdir(), "vocabulary-future-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git("init", "-q", "-b", "main"); git("config", "user.email", "test@example.com"); git("config", "user.name", "Test");
    mkdirSync(join(root, "src"));
    const unchanged = "export interface Existing { value: string }\n";
    writeFileSync(join(root, "src/existing.ts"), unchanged);
    git("add", "src"); git("commit", "-qm", "base"); git("config", "code-production.base", "main"); git("checkout", "-qb", "feat/future");
    const deps = { cwd: root, sourceCommit: git("rev-parse", "HEAD"), eventLog: join(root, "events"),
      publisher: () => "http://fixture/plan", publication: () => null };
    const init = await dispatchTool(deps, "init", { root, title: "Save one value" });
    const plan = join(root, String(init.structuredContent?.plan));
    const submitted = await dispatchTool(deps, "submit_spec", { plan,
      baseRevision: protocolSpecHash(readFileSync(plan, "utf8")), ownerRequest: "Save a value",
      spec: "## The Goal\nSave a value.\n## The target\nThe caller sends a value to Store. Store returns after saving or throws on failure.\n```typescript\ninterface Store { save(value: string): void }\n```",
      vocabularyChanges: { baseRevision: readVocabulary(root).vocabularyRevision, entries: [{ before: null,
        after: { term: "Store", meaning: "Owns persistence", forbidden: [], definitions: [{ repository: ".", path: "src/store.ts", name: "Store" }] },
        reason: "The requested new persistence contract." }] } });
    expect(submitted.isError, JSON.stringify(submitted.content)).not.toBe(true);
    const locked = await dispatchTool(deps, "approve_spec", { plan, expectedRevision: submitted.structuredContent?.revision, ownerWord: "Approve this SPEC" });
    expect(locked.isError, JSON.stringify(locked.content)).not.toBe(true);
    const delivery = await dispatchTool(deps, "put_delivery", { plan, delivery: {
      id: "D1", title: "Save", branch: "feat/future", depends: [], gate: ["bun test"], active: true,
      stageGraph: "D1-S1", predictedExternalWaitMinutes: 0, description: "Persist the selected value and prove failure behavior.",
    } });
    expect(delivery.isError, JSON.stringify(delivery.content)).not.toBe(true);
    const stage = await dispatchTool(deps, "put_stage", { plan, stage: {
      id: "D1-S1", deliveryId: "D1", title: "Store", owner: "agent", profile: "fast", depends: [], parallelWith: [],
      writes: ["src/"], tempRoot: ".tmp/code-production/future/D1-S1", predictedActiveMinutes: 2, predictedCredits: 0, verifyActiveMinutes: 1, verifyCredits: 0,
      description: "Implement persistence and its failure behavior.", tasks: [{ id: "SAVE", story: "Persist the selected value and report failed writes.",
        writes: ["src/"], predictedActiveMinutes: 1, predictedCredits: 0, how: "Create Store and exercise successful and failed writes.", red: "bun run agent:test:backend -- test/store.test.ts" }],
      criteria: ["`bun test` exits 0", "Commit"],
    } });
    expect(stage.isError, JSON.stringify(stage.content)).not.toBe(true);
    const current = readFileSync(plan, "utf8");
    expect((await dispatchTool(deps, "approve_plan", { plan, expectedRevision: "stale", ownerWord: "Approve implementation" })).isError).toBe(true);
    expect(readFileSync(plan, "utf8")).toBe(current);
    const approved = await dispatchTool(deps, "approve_plan", { plan, expectedRevision: stage.structuredContent?.revision, ownerWord: "Approve implementation" });
    expect(approved.isError, JSON.stringify(approved.content)).not.toBe(true);
    expect(readVocabulary(root).findings).toHaveLength(1);
    git("add", plan, "docs/vocabulary.md"); git("commit", "-qm", "approved plan");
    const started = await dispatchTool(deps, "start_task", { plan, task: "SAVE" });
    expect(started.isError, JSON.stringify(started.content)).not.toBe(true);
    writeFileSync(join(root, "src/store.ts"), "export interface Store { save(value: string): void }\n");
    writeFileSync(join(root, "src/generated.ts"), unchanged);
    expect(readVocabulary(root).findings).toEqual([]);
    git("add", "src"); git("commit", "-qm", "implementation and unchanged declaration copy");
    const completed = await dispatchTool(deps, "complete_task", { plan, taskIds: ["SAVE"], commit: git("rev-parse", "HEAD"),
      result: "Implemented the new contract and generated an unchanged existing declaration." });
    expect(completed.isError, JSON.stringify(completed.content)).not.toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

/** @test-id: tst_unit_planctl_writer_001
 * @scenario: scn_planctl_competing_writer_001
 * @covers: planctl/src/core/plan-update.ts::recoverPlanMutation,mutatePlanFile
 * @deterministic: yes
 * @invariant: competing processes cannot enter a write, and process death releases the lock automatically.
 */
it("tst_unit_planctl_writer_001 serializes processes and recovers after the writer dies", async () => {
  const root = mkdtempSync(join(tmpdir(), "planctl-writer-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  let child: ReturnType<typeof Bun.spawn> | undefined;
  try {
    git("init", "-q"); git("config", "user.email", "test@example.com"); git("config", "user.name", "Test");
    mkdirSync(join(root, "docs/plans"), { recursive: true });
    const plan = "docs/plans/fixture.md"; writeFileSync(join(root, plan), createDraftPlan("One value"));
    git("add", "."); git("commit", "-qm", "fixture");
    const marker = join(root, "entered");
    const source = `import {mutatePlanFile} from ${JSON.stringify(join(import.meta.dir, "../src/core/plan-update.ts"))};
      import {writeFileSync} from "node:fs";
      mutatePlanFile(${JSON.stringify(root)}, ${JSON.stringify(plan)}, "fixture", body => {
        writeFileSync(${JSON.stringify(marker)}, "entered");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000);
        return {body};
      });`;
    child = Bun.spawn(["bun", "-e", source], { stdout: "pipe", stderr: "pipe" });
    for (let n = 0; n < 200 && !existsSync(marker); n++) await Bun.sleep(10);
    expect(existsSync(marker)).toBe(true);
    expect(() => recoverPlanMutation(root, plan)).toThrow(/write is active/);
    child.kill("SIGKILL"); await child.exited;
    expect(() => recoverPlanMutation(root, plan)).not.toThrow();
  } finally { if (child?.exitCode === null) { child.kill(); await child.exited; } rmSync(root, { recursive: true, force: true }); }
}, 10_000);

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
