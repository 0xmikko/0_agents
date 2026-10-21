/**
 * Manual evaluation, never a test or publication gate.
 * bun bench/evaluate.ts                 validates the frozen corpus, no network
 * bun bench/evaluate.ts --live          bounded Jev run using TYPESAFE_API_KEY
 * Labels, source identities and mutation descriptions never enter requests.
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import defaultCorpus from "./corpus/cases.json";
import { z } from "zod";

const questionSchema = z.object({ type: z.literal("noul"), instructions: z.string(), criteria: z.object({ true: z.string(), false: z.string() }) });
const corpusSchema = z.object({ version: z.string(), model: z.string(), thresholds: z.object({ yes: z.number(), no: z.number() }), limitations: z.string(),
  cases: z.array(z.object({ id: z.string(), group: z.string(), split: z.enum(["calibration", "evaluation"]), expected: z.boolean(), provenance: z.unknown(),
    request: z.object({ state: z.object({ goal: z.string() }).passthrough(), questions: z.record(z.string(), questionSchema) }) })) });
const fileIndex = process.argv.indexOf("--corpus");
const corpus = corpusSchema.parse(fileIndex < 0 ? defaultCorpus : JSON.parse(readFileSync(process.argv[fileIndex + 1]!, "utf8")));
import { SEMANTIC_MODEL } from "../src/core/semantic-check";
import { checkContent } from "../src/core/content-check";
import { contentHash } from "../src/core/vocabulary";

const groups = new Map<string, string>();
for (const item of corpus.cases) {
  const previous = groups.get(item.group);
  assert.ok(previous === undefined || previous === item.split, `source leakage: ${item.group}`);
  groups.set(item.group, item.split);
}
assert.equal(corpus.model, SEMANTIC_MODEL);
assert.ok(corpus.cases.length <= 40);
const live = process.argv.includes("--live");
if (!live) {
  console.log(JSON.stringify({ status: "prepared", cases: corpus.cases.length, sourceGroups: groups.size, apiCalls: 0 }));
} else {
  assert.ok(process.env.TYPESAFE_API_KEY?.trim(), "TYPESAFE_API_KEY is required for an explicit live evaluation");
  const root = resolve(import.meta.dir, "../.tmp/evaluation");
  mkdirSync(root, { recursive: true });
  const results: {
    id: string; group: string; split: string; expected: boolean; probability: number | null;
    predicted: boolean | null; uncertainty: string | null; elapsedMs: number;
  }[] = [];
  let apiCalls = 0;
  let sentBytes = 0;
  const fetcher: typeof fetch = Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    apiCalls++;
    assert.ok(apiCalls <= 40, "evaluation request budget exhausted");
    sentBytes += typeof init?.body === "string" ? Buffer.byteLength(init.body) : 0;
    return fetch(input, init);
  }, { preconnect: fetch.preconnect });
  // Freeze request hashes before reading any answers.
  writeFileSync(resolve(root, "frozen.json"), JSON.stringify({
    corpusHash: contentHash(JSON.stringify(corpus)),
    checker: "checkContent-focused-1",
    requests: corpus.cases.map(c => ({ id: c.id, requestHash: contentHash(JSON.stringify(c.request)), split: c.split, group: c.group })),
  }, null, 2));
  for (const item of corpus.cases) {
    const started = performance.now();
    const questions = Object.fromEntries(Object.entries(item.request.questions).map(([id, q]) => {
      assert.equal(q.type, "noul");
      return [id, { ...q, type: "noul" as const }];
    }));
    const state = item.request.state;
    const content = "flow" in state && typeof state.flow === "string" ? state.flow : JSON.stringify(state, null, 2);
    const checked = await checkContent({ root, goal: state.goal, kind: "flow", content, questions }, { fetcher, browserPath: null });
    const check = checked.semanticChecks[0];
    const probability = check?.probability ?? null;
    const predicted = probability === null ? null : probability >= corpus.thresholds.yes ? true : probability <= corpus.thresholds.no ? false : null;
    results.push({ id: item.id, group: item.group, split: item.split, expected: item.expected,
      probability, predicted, uncertainty: check?.uncertainty ?? null, elapsedMs: Math.round(performance.now() - started) });
  }
  const summary = ["calibration", "evaluation"].map(split => {
    const rows = results.filter(r => r.split === split);
    const answered = rows.filter((r): r is typeof r & { probability: number } => r.probability !== null);
    const decisive = rows.filter(r => r.predicted !== null);
    return { split, cases: rows.length, decisive: decisive.length,
      correctDecisive: decisive.filter(r => r.predicted === r.expected).length,
      falsePositive: decisive.filter(r => r.predicted && !r.expected).length,
      falseNegative: decisive.filter(r => !r.predicted && r.expected).length,
      uncertain: answered.length - decisive.length, unavailable: rows.length - answered.length,
      brier: answered.length ? answered.reduce((sum, r) => sum + (r.probability - Number(r.expected)) ** 2, 0) / answered.length : null };
  });
  const report = { model: corpus.model, rubric: corpus.version, path: "checkContent with focused corpus questions", apiCalls, sentBytes,
    estimatedInputCostUpperUsd: (sentBytes + apiCalls * 4096) * 0.042 / 1_000_000,
    billingVerified: false, limitations: corpus.limitations, summary, results };
  const output = resolve(root, `result-${Date.now()}.json`);
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, ...report }, null, 2));
}
