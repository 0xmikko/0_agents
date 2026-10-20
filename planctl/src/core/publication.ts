import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { parse as parseYaml } from "yaml";
import { deliveryMetas, deliveryRoot, planState, protocolImplementationHash, protocolSpecHash, repositoryEnvironment, stageInputs, stageStart, stageEnd, deliveryStart, deliveryEnd, taskRunPath } from "./plan-update";
import { protocolLockViolations } from "./plan-gate";
import { decodeTaskRun } from "./task-run";
import { checkContractChanges } from "./contract-check";
import { contentHash, evidencePath } from "./vocabulary";

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: repositoryEnvironment() }).trim();
}

function recordPath(root: string, name: string): string {
  return git(root, "rev-parse", "--path-format=absolute", "--git-path", `code-production/${name}`);
}

function save(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2));
  renameSync(temporary, path);
}

/** The existing approved Delivery line carries the complete gate command. */
export function deliveryGate(body: string, id: string): string {
  const block = body.split(deliveryStart(id))[1]?.split(deliveryEnd(id))[0] ?? "";
  const command = /^Branch: .*; Gate: (.+)\.$/m.exec(block)?.[1];
  if (!command) throw new Error("The approved Delivery does not declare its complete gate.");
  return command;
}

/** Worktree-local opt-in: never changes another session's Git configuration. */
export function requireControlledPublication(root: string): void {
  const path = recordPath(root, "publication-required");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "Use planctl publish_delivery for this worktree.\n");
}

/** Only the active plan's bookkeeping may change without invalidating product verification. */
function checkedInputs(root: string, plan: string): string {
  const tracked = git(root, "ls-tree", "-r", "HEAD").split("\n").filter(line => !line.endsWith(`\t${plan}`));
  return contentHash(JSON.stringify({ tracked, runtime: process.version, platform: process.platform, architecture: process.arch }));
}

/** Called only after the approved complete gate actually ran successfully. */
export function recordCompleteGate(root: string, plan: string, command: string, body = readFileSync(resolve(root, plan), "utf8")): void {
  const head = git(root, "rev-parse", "HEAD");
  save(recordPath(root, "verify-pr.json"), { head, plan, command, inputs: checkedInputs(root, plan),
    spec: protocolSpecHash(body), implementation: protocolImplementationHash(body) });
  const receipt = recordPath(root, "verify-pr.sha");
  mkdirSync(dirname(receipt), { recursive: true });
  writeFileSync(receipt, `${head}\n`);
}

const verification = z.object({ head: z.string(), plan: z.string(), command: z.string(), inputs: z.string(), spec: z.string(), implementation: z.string() });
const prSchema = z.object({ url: z.string().url(), state: z.enum(["OPEN", "CLOSED", "MERGED"]), isDraft: z.boolean(), headRefOid: z.string(), baseRefName: z.string() });

/** Conservatively prove that neither the feature push nor draft PR triggers a workflow. */
function planOnlyCiIsExcluded(root: string, branch: string, base: string): boolean {
  const baseRef = spawnSync("git", ["-C", root, "rev-parse", "--verify", `refs/remotes/origin/${base}`], { encoding: "utf8" }).status === 0 ? `origin/${base}` : base;
  const changed = git(root, "diff", "--name-only", `${baseRef}...HEAD`).split("\n").filter(Boolean);
  if (!changed.length || changed.some(path => !/^docs\/plans\/.+\.md$/.test(path) && path !== "docs/vocabulary.md")) return false;
  const workflows = git(root, "ls-files", ".github/workflows").split("\n").filter(path => /\.ya?ml$/.test(path));
  for (const path of workflows) {
    const value: unknown = parseYaml(readFileSync(resolve(root, path), "utf8"));
    const workflow = z.object({ on: z.unknown() }).safeParse(value);
    if (!workflow.success) return false;
    const triggers = workflow.data.on;
    if (typeof triggers === "string") { if (["push", "pull_request", "pull_request_target"].includes(triggers)) return false; else continue; }
    if (Array.isArray(triggers)) { if (triggers.some(t => ["push", "pull_request", "pull_request_target"].includes(String(t)))) return false; else continue; }
    if (!triggers || typeof triggers !== "object") return false;
    for (const event of ["push", "pull_request", "pull_request_target"]) {
      if (!(event in triggers)) continue;
      const config = Reflect.get(triggers, event);
      if (!config || typeof config !== "object") return false;
      const target = event === "push" ? branch : base;
      const branches = Reflect.get(config, "branches");
      if (Array.isArray(branches) && branches.every(b => typeof b === "string" && !b.startsWith("!"))
        && !branches.some(b => new Bun.Glob(b).match(target))) continue;
      const ignoredBranches = Reflect.get(config, "branches-ignore");
      if (Array.isArray(ignoredBranches) && ignoredBranches.some(b => typeof b === "string" && new Bun.Glob(b).match(target))) continue;
      const ignored = Reflect.get(config, "paths-ignore");
      if (Array.isArray(ignored) && ignored.every(p => typeof p === "string" && !p.startsWith("!"))
        && changed.every(p => ignored.some(pattern => new Bun.Glob(pattern).match(p)))) continue;
      // Unknown conditions and job-level expressions are not proof that paid CI will be skipped.
      return false;
    }
  }
  return true;
}

/**
 * @tested-by: tst_unit_planctl_publication_001
 * @invariant: publication is a complete local gate followed by review and one
 * feature push; interruption reconciles the remote before attempting another push.
 */
export async function publishDelivery(input: {
  readonly plan: string;
  readonly delivery: string;
  readonly expectedHead: string;
  readonly phase: "plan" | "implementation";
  readonly reviewPath?: string;
}, options: {
  readonly github?: (root: string, args: readonly string[]) => string;
} = {}): Promise<{ readonly url: string; readonly head: string; readonly pushed: boolean }> {
  const absolute = resolve(input.plan);
  const root = git(dirname(absolute), "rev-parse", "--show-toplevel");
  const plan = absolute.slice(root.length + 1);
  const body = readFileSync(absolute, "utf8");
  if (planState(body) !== "APPROVED" || protocolLockViolations(body).length) throw new Error("Publication needs the unchanged approved plan.");
  const delivery = deliveryMetas(body).find(d => d.id === input.delivery);
  if (!delivery) throw new Error("Unknown publication delivery.");
  const checkout = deliveryRoot(root, delivery);
  const branch = git(checkout, "branch", "--show-current");
  const configuredBase = spawnSync("git", ["-C", checkout, "config", "--get", "code-production.base"], { encoding: "utf8", env: repositoryEnvironment() }).stdout.trim();
  if (!configuredBase) throw new Error("The repository has no configured PR base.");
  if (branch !== delivery.branch || ["main", "staging", configuredBase].includes(branch) || !branch.startsWith("feat/")) throw new Error("Publish only the approved feature branch; protected branches belong to the owner.");
  const head = git(checkout, "rev-parse", "HEAD");
  if (head !== input.expectedHead) throw new Error("The checked publication head changed.");
  if (git(checkout, "status", "--porcelain", "--untracked-files=no")) throw new Error("Commit the prepared changes before publication.");
  if (input.phase === "plan" && !planOnlyCiIsExcluded(checkout, branch, configuredBase)) {
    throw new Error("The repository's workflows do not exclude plan-only publication from CI. Keep the readable SPEC URL until implementation is ready.");
  }
  let review = "";
  if (input.phase === "implementation") {
  const stages = stageInputs(body).filter(s => s.deliveryId === delivery.id);
  if (!stages.length || stages.some(s => s.tasks.some(t => !t.completed)
    || /^- \[ \] /m.test(body.split(stageStart(s.id))[1]?.split(stageEnd(s.id))[0] ?? ""))) throw new Error("Complete the approved work before implementation publication.");
  const record = recordPath(checkout, "verify-pr.json");
  const legacy = recordPath(checkout, "verify-pr.sha");
  if (existsSync(record)) {
    const proof = verification.parse(JSON.parse(readFileSync(record, "utf8")));
    if (proof.plan !== plan || proof.inputs !== checkedInputs(checkout, plan)
      || proof.spec !== protocolSpecHash(body) || proof.implementation !== protocolImplementationHash(body)
      || deliveryGate(body, delivery.id) !== proof.command) throw new Error("Local verification inputs changed; run the affected checks and the project's cached publication gate.");
  } else if (!existsSync(legacy) || readFileSync(legacy, "utf8").trim() !== head) {
    throw new Error("Run the complete local gate before review and publication.");
  }
  const reviewPath = input.reviewPath === undefined ? recordPath(checkout, "review.md") : evidencePath(checkout, input.reviewPath);
  if (!existsSync(reviewPath)) throw new Error("The requested final review is missing. Save the actual review report in the task checkout and pass its relative reviewPath.");
  review = readFileSync(reviewPath, "utf8");
  if (!review.includes(`Reviewed-Head: ${head}`) || !/^REVIEW VERDICT:\s*APPROVED\s*$/m.test(review)) throw new Error("The final review report does not approve this implementation.");
  // The full tracked input set is unchanged; only plan bookkeeping may have advanced.
  writeFileSync(legacy, `${head}\n`);
  }
  const github = options.github ?? ((cwd, args) => execFileSync("gh", [...args], { cwd, encoding: "utf8", env: repositoryEnvironment() }).trim());
  const list = z.array(prSchema).parse(JSON.parse(github(checkout, ["pr", "list", "--head", branch, "--state", "all", "--json", "url,state,isDraft,headRefOid,baseRefName"])));
  if (list.some(p => p.state === "MERGED" || p.state === "CLOSED")) throw new Error("This feature branch already has a closed PR; do not republish it.");
  if (list.length > 1) throw new Error("More than one PR uses this branch.");
  let pr = list[0];
  if (input.phase === "implementation") {
    // Existing Task starts bind the implementation to its actual starting code.
    // The PR can also contain an already-reviewed parent branch; do not reinterpret
    // that parent's types as newly invented by this plan.
    const baseBranch = pr?.baseRefName ?? configuredBase;
    const baseRef = spawnSync("git", ["-C", checkout, "rev-parse", "--verify", `refs/remotes/origin/${baseBranch}`], { encoding: "utf8" }).status === 0 ? `origin/${baseBranch}` : baseBranch;
    const starts = stageInputs(body).filter(s => s.deliveryId === delivery.id).flatMap(s => s.tasks.flatMap(t => {
      const path = taskRunPath(root, plan, t.id);
      if (!existsSync(path)) return [];
      return [decodeTaskRun(JSON.parse(readFileSync(path, "utf8"))).baseHead];
    }));
    let base = starts[0] ?? git(checkout, "merge-base", baseRef, head);
    for (const start of starts) {
      if (spawnSync("git", ["-C", checkout, "merge-base", "--is-ancestor", start, head], { env: repositoryEnvironment() }).status !== 0) {
        throw new Error("A Task's starting code is not an ancestor of the implementation.");
      }
      if (spawnSync("git", ["-C", checkout, "merge-base", "--is-ancestor", start, base], { env: repositoryEnvironment() }).status === 0) base = start;
    }
    const contracts = await checkContractChanges(checkout, head, body, base);
    if (contracts.length) throw new Error(`The implementation differs from its approved contracts:\n${contracts.map(c => c.text).join("\n")}`);
  }
  const remote = git(checkout, "ls-remote", "--heads", "origin", `refs/heads/${branch}`).split(/\s/)[0] ?? "";
  const publicationPath = recordPath(checkout, "publication.json");
  if (remote === head && pr?.headRefOid === head && (input.phase === "plan" || !pr.isDraft)) {
    // Recover a lost response after the PR effect, not only a lost push response.
    save(publicationPath, { plan, delivery: delivery.id, revision: protocolImplementationHash(body), branch, head,
      remote: "origin", phase: input.phase, state: "published", url: pr.url });
    return { url: pr.url, head, pushed: false };
  }
  if (existsSync(publicationPath)) {
    const previous = z.object({ state: z.string(), phase: z.string(), head: z.string(), revision: z.string() })
      .parse(JSON.parse(readFileSync(publicationPath, "utf8")));
    if (previous.state === "published" && previous.phase === input.phase && previous.head !== head
      && previous.revision === protocolImplementationHash(body)) {
      throw new Error("This publication boundary was already used. Keep intermediate changes local; a further publication needs a recorded contract amendment.");
    }
  }
  const intent = { plan, delivery: delivery.id, revision: protocolImplementationHash(body), branch, head, remote: "origin",
    phase: input.phase, state: "publishing", expiresAt: Date.now() + 120_000, review: contentHash(review) };
  save(publicationPath, intent);
  requireControlledPublication(checkout);
  let pushed = false;
  if (remote !== head) {
    if (remote) {
      const ancestor = spawnSync("git", ["-C", checkout, "merge-base", "--is-ancestor", remote, head], { env: repositoryEnvironment() });
      if (ancestor.status !== 0) throw new Error("The remote feature branch contains work absent locally; reconcile it without force-pushing.");
    }
    // Normal hooks remain enabled. Never merge, force push, or update another ref.
    git(checkout, "push", "origin", `${head}:refs/heads/${branch}`);
    pushed = true;
  }
  if (!pr) {
    const title = body.split("\n")[0]?.replace(/^# /, "") ?? branch;
    const bodyFile = recordPath(checkout, "pr-body.md");
    writeFileSync(bodyFile, input.phase === "plan" ? `Approved plan: ${title}.\n\nImplementation is pending.\n` :
      `Implements ${title}.\n\nLocal verification and the final review passed before publication.\n\nThe owner merges this PR.\n`);
    const url = github(checkout, ["pr", "create", "--base", configuredBase, "--head", branch, "--title", title, "--body-file", bodyFile,
      ...(input.phase === "plan" ? ["--draft"] : [])]).trim();
    if (!/^https?:\/\//.test(url)) throw new Error("GitHub did not return a PR URL; retry to reconcile the already-pushed head.");
    pr = { url, state: "OPEN", isDraft: input.phase === "plan", headRefOid: head, baseRefName: configuredBase };
  } else if (pr.isDraft && input.phase === "implementation") github(checkout, ["pr", "ready", pr.url]);
  save(publicationPath, { ...intent, state: "published", url: pr.url });
  return { url: pr.url, head, pushed };
}
