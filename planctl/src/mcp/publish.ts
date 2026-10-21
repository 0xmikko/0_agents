import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cacheDirectory } from "../core/vocabulary";
import { spawnSync } from "node:child_process";
import { basename, resolve } from "node:path";

/** Publish one plan's saved bytes and return where the owner reads them. */
type Publisher = (root: string, plan: string) => string;

/** The slug the owner's viewer shows: the plan file name, which the branch already made unique. */
export function planSlug(plan: string): string {
  return basename(plan).replace(/\.md$/, "");
}

/** `<command> <plan> <slug>` prints the URL, as mdurl does; anything else is a failure, never a stale URL. */
export function commandPublisher(command: string): Publisher {
  return (root, plan) => {
    const body = readFileSync(resolve(root, plan), "utf8");
    const spec = body.split("<!-- plan:spec:start -->")[1]?.split("<!-- plan:spec:end -->")[0]?.trim();
    const directory = cacheDirectory(root, "reading");
    mkdirSync(directory, { recursive: true });
    const reading = resolve(directory, `${planSlug(plan)}.md`);
    writeFileSync(reading, spec === undefined ? body : `${body.split("\n")[0]}\n\n${spec.replace(/<!-- vocabulary-proposal:start -->[\s\S]*?<!-- vocabulary-proposal:end -->/g, "").trim()}\n`);
    const run = spawnSync(command, [reading, planSlug(plan)], { encoding: "utf8", timeout: 30_000 });
    if (run.error !== undefined) throw new Error(`${command}: ${run.error.message}`);
    if (run.status !== 0) throw new Error(`${command} exited ${run.status}: ${run.stderr.trim() || run.stdout.trim()}`);
    const url = run.stdout.trim().split("\n").reverse().find((line) => /^https?:\/\//.test(line.trim()));
    if (url === undefined) throw new Error(`${command} printed no URL`);
    return url.trim();
  };
}

/** The three fixed lines the agent shows the owner after any write; the Checks line only after a submission. */
export function ownerReply(url: string, _revision: string, state: string, checks: { readonly errors: number } | null): string {
  return [
    `Plan: ${url}`,
    state === "SPEC_DRAFT" ? "Draft solution." : state === "SPEC_LOCKED" ? "Solution approved; implementation breakdown follows." : "Approved for implementation.",
    ...(checks === null ? [] : [`Checks: ${checks.errors} errors`]),
  ].join("\n");
}
