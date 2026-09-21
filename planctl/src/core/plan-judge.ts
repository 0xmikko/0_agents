import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { protocolSpec, protocolSpecHash, stageInputs } from "./plan-update";

const RULES = ["Goal", "Stages", "Names", "Prose"] as const;
interface Answer {
  readonly verdict: "PASS" | "FAIL";
  readonly quote: string;
  readonly fix: string;
}

function object(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("expected a JSON object");
}

function answers(value: unknown, document: string): Record<string, Answer> {
  object(value);
  const decoded = value;
  if (Object.keys(decoded).length !== RULES.length) throw new Error("expected exactly one answer per rule");
  return Object.fromEntries(RULES.map(rule => {
    const answer = decoded[rule];
    object(answer);
    const { verdict, quote, fix } = answer;
    if (verdict !== "PASS" && verdict !== "FAIL") throw new Error(`${rule}: missing PASS or FAIL`);
    if (typeof quote !== "string" || !quote.trim() || !document.includes(quote)) throw new Error(`${rule}: quote is not in the document`);
    if (typeof fix !== "string" || (verdict === "FAIL" ? !fix.trim() : fix !== "")) throw new Error(`${rule}: invalid fix`);
    return [rule, { verdict, quote, fix }];
  }));
}

/** The rubric is shipped beside the portable gate; the package reads its canonical source. */
export function judgePlan(body: string, root: string): boolean {
  const rubricPath = basename(import.meta.dir) === "runtime"
    ? join(import.meta.dir, "plan-judge.md")
    : resolve(import.meta.dir, "../../../shared/code-production/plan-judge.md");
  const rubric = readFileSync(rubricPath, "utf8");
  const vocabularyPath = join(root, "docs/graph.md");
  const input = {
    spec: protocolSpec(body),
    stages: stageInputs(body).map(stage => ({ title: stage.title, description: stage.description, tasks: stage.tasks.map(task => task.story) })),
    vocabulary: existsSync(vocabularyPath) ? readFileSync(vocabularyPath, "utf8") : null,
  };
  const document = [input.spec, ...input.stages.map(stage => `${stage.title}\n${stage.description}\n${stage.tasks.join("\n")}`)].join("\n");
  const prompt = JSON.stringify(input);
  const inputHash = createHash("sha256").update(rubric).update("\0").update(prompt).digest("hex");
  const state = execFileSync("git", ["-C", root, "rev-parse", "--git-path", "plan-judge"], { encoding: "utf8" }).trim();
  const cache = resolve(root, state, `${protocolSpecHash(body)}-${inputHash}.json`);
  let verdict: Record<string, Answer>;
  if (existsSync(cache)) {
    verdict = answers(JSON.parse(readFileSync(cache, "utf8")), document);
    console.log("plan-judge: cached verdict");
  } else {
    const schema = {
      type: "object", additionalProperties: false, required: RULES,
      properties: Object.fromEntries(RULES.map(rule => [rule, {
        type: "object", additionalProperties: false, required: ["verdict", "quote", "fix"],
        properties: { verdict: { enum: ["PASS", "FAIL"] }, quote: { type: "string", minLength: 1 }, fix: { type: "string" } },
      }])),
    };
    // --bare disables subscription auth. Safe mode preserves it while disabling
    // hooks, instructions and plugins. This child has no tools or session state.
    const env = { ...process.env };
    for (const name of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "CLAUDECODE"]) delete env[name];
    const child = spawnSync("claude", ["-p", "--model", "haiku", "--safe-mode", "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--output-format", "json", "--json-schema", JSON.stringify(schema), "--system-prompt", rubric], {
      cwd: root, env, input: prompt, encoding: "utf8", timeout: 45_000, maxBuffer: 1024 * 1024,
    });
    if (child.error) throw new Error(`claude unavailable: ${child.error.message}`);
    if (child.status !== 0) throw new Error(`claude exited ${child.status}: ${child.stderr.trim()} ${child.stdout.trim()}`);
    const result: unknown = JSON.parse(child.stdout);
    object(result);
    if (result.is_error !== false) {
      throw new Error(`claude failed: ${typeof result.result === "string" ? result.result : child.stderr.trim()}`);
    }
    verdict = answers(result.structured_output, document);
    mkdirSync(dirname(cache), { recursive: true });
    const temporary = `${cache}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(verdict)}\n`);
    renameSync(temporary, cache);
  }
  for (const [rule, answer] of Object.entries(verdict)) console.log(`${answer.verdict} ${rule}: ${JSON.stringify(answer.quote)}${answer.fix ? ` — ${answer.fix}` : ""}`);
  return Object.values(verdict).every(answer => answer.verdict === "PASS");
}
