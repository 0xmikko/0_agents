import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { cacheDirectory, contentHash } from "./vocabulary";
import type { SubmitSpecResult } from "./spec-submission";

export const SEMANTIC_MODEL = "jev-1.13.0";
export const SEMANTIC_RUBRIC = "focused-2";
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MAX_BYTES = 48_000;
const inFlight = new Map<string, Promise<SubmitSpecResult["semanticChecks"]>>();
const probabilities = z.record(z.string(), z.object({ type: z.literal("noul"), noul: z.number().finite().min(0).max(1) }));
const responseSchema = z.object({ model: z.literal(SEMANTIC_MODEL), answers: probabilities });
const cachedSchema = z.array(z.object({
  question: z.string(), probability: z.number().finite().min(0).max(1),
  evidence: z.array(z.object({ path: z.string(), quote: z.string() })), uncertainty: z.string().nullable(),
}));

/**
 * @tested-by: tst_unit_planctl_content_003
 * @invariant: bounded, non-retrying advice never establishes permission or a passed requirement.
 * Price verified at https://docs.typesafe.ai/models on 2026-10-20:
 * $0.042/M input tokens, free output. A conservative byte/token upper estimate,
 * including framing allowance, is below $0.01; unknown models are not accepted.
 */
export async function evaluateQuestions(input: {
  readonly root: string;
  readonly state: unknown;
  readonly questions: Readonly<Record<string, {
    readonly type: "noul"; readonly instructions: string;
    readonly criteria: { readonly true: string; readonly false: string };
  }>>;
  readonly revisions: readonly string[];
  readonly evidence: readonly { readonly path: string; readonly quote: string }[];
}, options: {
  readonly apiKey?: string | null;
  readonly fetcher?: typeof fetch;
} = {}): Promise<SubmitSpecResult["semanticChecks"]> {
  const questions = Object.entries(input.questions);
  const unavailable = (reason: string): SubmitSpecResult["semanticChecks"] => questions.map(([, q]) => ({
    question: q.instructions, probability: null, evidence: input.evidence, uncertainty: reason,
  }));
  if (questions.length === 0) return [];
  if (questions.length > 12) return unavailable("Advice unavailable: at most 12 focused questions per call.");
  const body = JSON.stringify({ model: SEMANTIC_MODEL, state: input.state, questions: input.questions });
  const bytes = Buffer.byteLength(body);
  const estimatedUpperUsd = (bytes + 4096) * 0.042 / 1_000_000;
  if (bytes > MAX_BYTES || estimatedUpperUsd > 0.01) return unavailable("Advice unavailable: input or cost bound exceeded; check a smaller flow.");
  const cacheKey = contentHash(JSON.stringify({ body, revisions: input.revisions, evidence: input.evidence, rubric: SEMANTIC_RUBRIC }));
  const directory = cacheDirectory(input.root, "semantic");
  const path = join(directory, `${cacheKey}.json`);
  if (existsSync(path)) {
    try { return cachedSchema.parse(JSON.parse(readFileSync(path, "utf8"))); }
    catch { /* An invalid cache entry is not evidence. Recompute within the same bounds. */ }
  }
  const apiKey = options.apiKey === undefined ? process.env.TYPESAFE_API_KEY : options.apiKey;
  if (!apiKey?.trim()) return unavailable("Advice unavailable: TYPESAFE_API_KEY is not configured.");
  const pending = inFlight.get(path);
  if (pending) return pending;
  const run = async (): Promise<SubmitSpecResult["semanticChecks"]> => {
    try {
      const response = await (options.fetcher ?? fetch)(ENDPOINT, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body,
      });
      if (!response.ok) return unavailable(`Advice unavailable: provider HTTP ${response.status}; no automatic retry.`);
      const reader = response.body?.getReader();
      if (!reader) return unavailable("Advice unavailable: empty provider response.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 64_000) { await reader.cancel(); return unavailable("Advice unavailable: invalid oversized response."); }
        chunks.push(part.value);
      }
      const parsed = responseSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      if (!parsed.success || Object.keys(parsed.data.answers).length !== questions.length
        || questions.some(([id]) => parsed.data.answers[id] === undefined)) {
        return unavailable("Advice unavailable: invalid model or answer schema.");
      }
      const result = questions.map(([id, q]) => {
        const probability = parsed.data.answers[id]!.noul;
        return { question: q.instructions, probability, evidence: input.evidence,
          uncertainty: probability > 0.2 && probability < 0.8 ? "Inconclusive on the evaluated thresholds; inspect the cited evidence." : null };
      });
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const temporary = `${path}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify(result), { mode: 0o600 });
      renameSync(temporary, path);
      return result;
    } catch {
      // Never expose provider error objects: these may contain authorization headers.
      return unavailable("Advice unavailable: timeout, transport failure or invalid response.");
    }
  };
  const promise = run();
  inFlight.set(path, promise);
  try { return await promise; }
  finally { inFlight.delete(path); }
}
