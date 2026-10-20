import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkContent } from "../src/core/content-check";
import { readVocabulary } from "../src/core/vocabulary";
import { evaluateQuestions } from "../src/core/semantic-check";

describe("focused authoring feedback", () => {
  /**
   * @test-id: tst_unit_planctl_content_001
   * @scenario: scn_planctl_spec_quality_001
   * @covers: planctl/src/core/content-check.ts::checkContent
   * @deterministic: yes
   * @invariant: missing solution contracts are visible, and absent Jev never becomes a pass.
   */
  it("tst_unit_planctl_content_001 reports absent contracts without requiring a plan", async () => {
    const root = mkdtempSync(join(tmpdir(), "content-check-"));
    try {
      const content = readFileSync(join(import.meta.dir, "fixtures/spec-goals-without-solution.md"), "utf8");
      const result = await checkContent({
        root, goal: "Describe the MCP commands with typed inputs and outputs.", kind: "flow", content,
      }, { apiKey: null, browserPath: null });
      expect(result.findings.some(f => f.rule === "typescript" && /contract/i.test(f.text))).toBe(true);
      expect(result.semanticChecks.length).toBeGreaterThan(0);
      expect(result.semanticChecks.every(c => c.probability === null && c.uncertainty)).toBe(true);
      expect(result.findings.some(f => /Why now|thirty words|implementation map/.test(f.text))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  /**
   * @test-id: tst_unit_planctl_content_002
   * @scenario: scn_planctl_vocabulary_001
   * @covers: planctl/src/core/vocabulary.ts::readVocabulary
   * @deterministic: yes
   * @invariant: definitions without aliases survive; changed canonical evidence invalidates the revision.
   */
  it("tst_unit_planctl_content_002 resolves canonical definitions and retains terms without aliases", () => {
    const root = mkdtempSync(join(tmpdir(), "vocabulary-"));
    try {
      mkdirSync(join(root, "docs")); mkdirSync(join(root, "src"));
      writeFileSync(join(root, "src/store.ts"), "export interface Store { save(value: string): void }\n");
      writeFileSync(join(root, "docs/vocabulary.md"),
        "| Term | Meaning | Not | Definitions |\n|---|---|---|---|\n| Store | Owns storage | | src/store.ts#Store |\n");
      const before = readVocabulary(root);
      expect(before.entries.find(e => e.term === "Store")).toMatchObject({ forbidden: [], meaning: "Owns storage" });
      expect(before.evidence.some(e => e.quote.includes("save(value: string)"))).toBe(true);
      writeFileSync(join(root, "src/store.ts"), "export interface Store { save(value: number): void }\n");
      expect(readVocabulary(root).vocabularyRevision).not.toBe(before.vocabularyRevision);
      rmSync(join(root, "src/store.ts"));
      expect(readVocabulary(root).findings.some(f => /src\/store.ts/.test(f.text))).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  /**
   * @test-id: tst_unit_planctl_content_003
   * @scenario: scn_planctl_semantic_001
   * @covers: planctl/src/core/semantic-check.ts::evaluateQuestions
   * @deterministic: yes
   * @invariant: exact cached requests avoid API calls; changed evidence and malformed answers cannot inherit a pass.
   */
  it("tst_unit_planctl_content_003 caches exact inputs and rejects wrong model or invalid probability", async () => {
    const root = mkdtempSync(join(tmpdir(), "semantic-"));
    let calls = 0;
    const fetcher: typeof fetch = Object.assign(async () => {
      calls++;
      return Response.json({ model: calls === 3 ? "different-model" : "jev-1.13.0", answers: { holds: { type: "noul", noul: calls === 1 ? 0.94 : 2 } } });
    }, { preconnect: fetch.preconnect });
    const input = {
      root, state: { goal: "Preserve isolation", flow: "Filter by user." },
      questions: { holds: { type: "noul" as const, instructions: "Does the query filter by user?", criteria: { true: "It filters.", false: "It does not." } } },
      revisions: ["dictionary-1"], evidence: [{ path: "flow", quote: "Filter by user." }],
    };
    try {
      const a = await evaluateQuestions(input, { apiKey: "test-fixture", fetcher });
      expect(a[0]?.probability).toBe(0.94);
      expect(await evaluateQuestions(input, { apiKey: "test-fixture", fetcher })).toEqual(a);
      expect(calls).toBe(1);
      const changed = await evaluateQuestions({ ...input, revisions: ["dictionary-2"] }, { apiKey: "test-fixture", fetcher });
      expect(calls).toBe(2);
      expect(changed[0]?.probability).toBeNull();
      expect(changed[0]?.uncertainty).toContain("invalid");
      const wrongModel = await evaluateQuestions({ ...input, revisions: ["dictionary-3"] }, { apiKey: "test-fixture", fetcher });
      expect(wrongModel[0]?.probability).toBeNull();
      expect(wrongModel[0]?.uncertainty).toContain("invalid");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  /**
   * @test-id: tst_unit_planctl_content_004
   * @scenario: scn_planctl_types_001
   * @covers: planctl/src/core/content-check.ts::checkContent
   * @deterministic: yes
   * @invariant: every flow's declarations are checked; existing external wire spelling is preserved.
   */
  it("tst_unit_planctl_content_004 checks the second flow and preserves quoted external names", async () => {
    const root = mkdtempSync(join(tmpdir(), "flow-types-"));
    try {
      const content = "### First\n```typescript\nexport interface Request { readonly userId: string }\n```\n"
        + "### Second\n```typescript\nexport interface Result { readonly value: any; readonly \"external_id\": string }\n```";
      const result = await checkContent({ root, goal: "Return typed results.", kind: "flow", content }, { apiKey: null, browserPath: null });
      expect(result.findings.some(f => /any/.test(f.quote) && f.line > 4 && f.blocking)).toBe(true);
      expect(result.findings.some(f => f.quote === '"external_id"')).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

/**
 * @test-id: tst_unit_planctl_diagram_001
 * @scenario: scn_planctl_rendered_readability_001
 * @covers: planctl/src/core/content-check.ts::renderDiagrams
 * @deterministic: yes
 * @invariant: an actual browser renders valid input, rejects syntax errors and detects unreadably scaled labels.
 */
it.skipIf(!Bun.which("chromium") && !Bun.which("google-chrome"))("tst_unit_planctl_diagram_001 renders, caches and measures actual diagrams", async () => {
  const root = mkdtempSync(join(tmpdir(), "diagram-check-"));
  try {
    const content = "No contracts change.\n```mermaid\nflowchart TD\n A[Input] --> B[Result]\n```";
    const check = () => checkContent({ root, goal: "Show the result", kind: "flow", content }, { apiKey: null });
    const first = await check();
    expect(first.diagramChecks[0]?.status).toBe("rendered");
    const artifact = first.diagramChecks[0]!.artifact!;
    expect(readFileSync(artifact, "utf8")).toContain("<svg");
    const stamp = statSync(artifact).mtimeMs;
    expect((await check()).diagramChecks[0]?.artifact).toBe(artifact);
    expect(statSync(artifact).mtimeMs).toBe(stamp);
    const invalid = await checkContent({ root, goal: "Show the result", kind: "flow", content: content.replace("flowchart TD", "not a diagram") }, { apiKey: null });
    expect(invalid.diagramChecks[0]?.status).toBe("failed");
    const wide = "No contracts change.\n```mermaid\nflowchart LR\n " + Array.from({ length: 14 }, (_, i) => `A${i}[A long process step ${i}]`).join(" --> ") + "\n```";
    const small = await checkContent({ root, goal: "Readable process", kind: "flow", content: wide }, { apiKey: null });
    expect(small.findings.some(f => f.rule === "mermaid" && /12px/.test(f.text))).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 30_000);
