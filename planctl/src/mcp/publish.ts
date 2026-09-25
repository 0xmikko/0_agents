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
    const run = spawnSync(command, [resolve(root, plan), planSlug(plan)], { encoding: "utf8", timeout: 30_000 });
    if (run.error !== undefined) throw new Error(`${command}: ${run.error.message}`);
    if (run.status !== 0) throw new Error(`${command} exited ${run.status}: ${run.stderr.trim() || run.stdout.trim()}`);
    const url = run.stdout.trim().split("\n").reverse().find((line) => /^https?:\/\//.test(line.trim()));
    if (url === undefined) throw new Error(`${command} printed no URL`);
    return url.trim();
  };
}

/** The three fixed lines the agent shows the owner after any write; the Checks line only after a submission. */
export function ownerReply(url: string, revision: string, state: string, checks: { readonly errors: number; readonly notes: number } | null): string {
  return [
    `Plan: ${url}`,
    `Revision ${revision}, ${state}`,
    ...(checks === null ? [] : [`Checks: ${checks.errors} errors, ${checks.notes} model notes`]),
  ].join("\n");
}
