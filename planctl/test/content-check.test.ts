import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkContent } from "../src/core/content-check";
import { readVocabulary } from "../src/core/vocabulary";
import { evaluateQuestions } from "../src/core/semantic-check";
import { z } from "zod";

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
      const [a, simultaneous] = await Promise.all([
        evaluateQuestions(input, { apiKey: "test-fixture", fetcher }),
        evaluateQuestions(input, { apiKey: "test-fixture", fetcher }),
      ]);
      expect(simultaneous).toEqual(a);
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
      expect((await evaluateQuestions({ ...input, state: "x".repeat(48_001) }, { apiKey: "test-fixture", fetcher }))[0]?.probability).toBeNull();
      const tooMany = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [String(i), input.questions.holds]));
      expect((await evaluateQuestions({ ...input, questions: tooMany }, { apiKey: "test-fixture", fetcher })).every(c => c.probability === null)).toBe(true);
      expect(calls).toBe(3);
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

  /**
   * @test-id: tst_unit_planctl_content_005
   * @scenario: scn_planctl_writing_001
   * @covers: planctl/src/core/content-check.ts::checkContent
   * @deterministic: yes; scripted semantic provider, no network or browser
   * @invariant: unreadable prose gets an actionable rewrite hint without an approval gate or a hidden rewrite.
   */
  it("tst_unit_planctl_content_005 returns rewrite advice for unreadable prose without blocking", async () => {
    const root = mkdtempSync(join(tmpdir(), "writing-feedback-"));
    const content = "The schema-admission mechanism instantiates handler-backed identity-channel eligibility.\n"
      + "```typescript\ninterface DedupInput { entityId: string; }\n```";
    const requestSchema = z.object({ questions: z.record(z.string(), z.unknown()) });
    let denied = "clarity";
    let deniedProbability = 0.03;
    const fetcher: typeof fetch = Object.assign(async (_url: unknown, init?: RequestInit) => {
      if (typeof init?.body !== "string") throw new Error("Expected a JSON request body");
      const request = requestSchema.parse(JSON.parse(init.body));
      return Response.json({ model: "jev-1.13.0", answers: Object.fromEntries(
        Object.keys(request.questions).map(id => [id, { type: "noul", noul: id === denied ? deniedProbability : 0.96 }]),
      ) });
    }, { preconnect: fetch.preconnect });
    try {
      for (const [question, action] of [["clarity", /rewrite/i], ["target", /finished target/i], ["relevance", /remove/i]] as const) {
        denied = question;
        const result = await checkContent({ root, goal: `Find duplicates when a record is saved. Feedback case: ${question}.`, kind: "flow", content },
          { apiKey: "fixture", browserPath: null, fetcher });
        const advice = result.findings.find(f => f.rule === "clarity");
        expect(advice).toBeDefined();
        expect(advice?.blocking).toBe(false);
        expect(advice?.text).toMatch(action);
        expect(result.findings.some(f => f.blocking)).toBe(false);
        expect(result.semanticChecks.every(c => c.evidence[0]?.quote === content)).toBe(true);
      }
      denied = "relevance";
      deniedProbability = 0.5;
      const uncertain = await checkContent({ root, goal: "Find duplicates. Check uncertain editorial advice.", kind: "flow", content },
        { apiKey: "fixture", browserPath: null, fetcher });
      expect(uncertain.findings.some(f => f.rule === "clarity" && !f.blocking && /inconclusive/i.test(f.text))).toBe(true);

      const unavailable = await checkContent({ root, goal: "Find duplicates.", kind: "flow", content },
        { apiKey: null, browserPath: null });
      expect(unavailable.semanticChecks.every(c => c.probability === null)).toBe(true);
      expect(unavailable.findings.some(f => f.rule === "clarity")).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  /**
   * @test-id: tst_unit_planctl_content_006
   * @scenario: scn_planctl_writing_002
   * @covers: planctl/src/core/content-check.ts::checkContent
   * @deterministic: yes; no provider or browser
   * @invariant: Target contains final TypeScript data, while storage implementation details stay outside Target.
   */
  it("tst_unit_planctl_content_006 distinguishes database declarations from target data types", async () => {
    const root = mkdtempSync(join(tmpdir(), "target-types-"));
    try {
      const database = "The event contains its owner and sequence.\n```typescript\n"
        + "export const events = pgTable(\"events\", { owner: text().notNull(), revision: integer().notNull() });\n```";
      const bad = await checkContent({ root, goal: "Describe the finished event data.", kind: "flow", content: database },
        { apiKey: null, browserPath: null });
      expect(bad.findings.some(f => f.rule === "target" && f.blocking)).toBe(true);
      const target = "The event contains its owner and sequence.\n```typescript\n"
        + "// The tool parameters use the canonical keys the agent tool names today.\n"
        + "interface Event {\n  owner: string;\n  revision: number;\n}\n```";
      const good = await checkContent({ root, goal: "Describe the finished event data.", kind: "flow", content: target },
        { apiKey: null, browserPath: null });
      expect(good.findings).toEqual([]);
      const complete = await checkContent({ root, goal: "Describe the finished event data.", kind: "flow", content: "## The target\n" + target + "\n## Today, measured against that\n" + database },
        { apiKey: null, browserPath: null });
      expect(complete.findings.some(f => f.rule === "target")).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  /**
   * @test-id: tst_unit_planctl_content_007
   * @scenario: scn_planctl_target_001
   * @covers: planctl/src/core/plan-gate.ts::targetViolations, planctl/src/core/content-check.ts::checkContent
   * @deterministic: yes; no provider or browser
   * @invariant: another type in the same real-flow pattern and custom questions cannot hide current database code in Target.
   */
  it("tst_unit_planctl_content_007 refuses current code and prose patches even beside a delivered event type", async () => {
    const root = mkdtempSync(join(tmpdir(), "real-target-"));
    const flow = "### Every change is an event\n\nToday the table and writer look like this:\n"
      + "```typescript\nexport const events = pgTable(\"events\", { id: text().notNull() });\n```\n"
      + "Four columns are added: owner, seq, occurredAt and handledAt.\n"
      + "```typescript\nexport type GraphMutationEvent = { id: string; owner: string; type: \"entity_created\" };\n```";
    try {
      const databaseOnly = flow.replace("Today the table and writer look like this:", "Events are stored here:")
        .replace("Four columns are added: owner, seq, occurredAt and handledAt.", "");
      for (const content of [flow, databaseOnly,
        databaseOnly.replaceAll("```typescript", "```javascript"),
        databaseOnly.replaceAll("```typescript", "```"),
        databaseOnly.replace("pgTable(", "pg.pgTable("),
        databaseOnly.replace("export const events", "import { pgTable as table } from 'drizzle-orm/pg-core';\nexport const events").replace("pgTable(", "table("),
        databaseOnly.replace("export const events", "const table = pgTable;\nexport const events").replace("pgTable(", "table("),
        "```typescript\ninterface Unrelated { id: string; }\nexport type Event = typeof events.$inferSelect;\n```",
        "```typescript\nexport type Event = typeof events['$inferSelect'];\n```",
        "```typescript\nimport type { InferSelectModel as Row } from 'drizzle-orm';\nexport type Event = Row<typeof events>;\n```",
        "```typescript\ninterface CreateTriggerParams { name: string; }\ntype UpdateTriggerParams = Partial<Omit<CreateTriggerParams, 'name'>> & { id: string };\n```",
        "## The target\nThe trigger stores the subscription.\n## Interfaces\n```typescript\ntype UpdateTriggerParams = Partial<CreateTriggerParams> & { id: string };\n```",
        "Add owner, seq, occurredAt and handledAt to the existing stored event type. Its other fields stay as they are.",
        "```sql\nCREATE TABLE events (id text);\n```",
        "## The target\n" + flow + "\n### Another flow\n```typescript\ninterface Unrelated { value: string; }\n```"]) {
        const result = await checkContent({ root, goal: "Show only the finished event data.", kind: "flow", content, questions: {} },
          { apiKey: null, browserPath: null });
        const error = result.findings.find(f => f.rule === "target" && f.blocking);
        expect(error).toBeDefined();
        expect(error?.line).toBeGreaterThan(0);
        expect(error?.quote).not.toBe("");
      }
      const currentListener = "## The target\n```typescript\n// today\nclass TriggerGate { evaluate(): boolean { return true; } }\n```";
      expect((await checkContent({ root, goal: "Show the final gate.", kind: "flow", content: currentListener, questions: {} },
        { apiKey: null, browserPath: null })).findings.some(f => f.rule === "target" && f.blocking)).toBe(true);
      const partial = "## The target\n```typescript\ninterface CreateTriggerParams { name: string; }\n// update: the same fields plus id\n```";
      expect((await checkContent({ root, goal: "Show the final update contract.", kind: "flow", content: partial, questions: {} },
        { apiKey: null, browserPath: null })).findings.some(f => f.rule === "target" && f.blocking)).toBe(true);
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
