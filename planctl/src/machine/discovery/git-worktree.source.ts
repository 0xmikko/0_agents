import { readdirSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import type { GitWorktreeIdentity } from "../sessions/session-source";
import type { Dirent } from "node:fs";

export interface GitDiscoveryIssue {
  readonly repositoryPath: string;
  readonly message: string;
}

export interface GitDiscoveryResult {
  readonly worktrees: readonly GitWorktreeIdentity[];
  readonly issues: readonly GitDiscoveryIssue[];
}

export interface GitCommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type GitCommand = (repositoryPath: string, args: readonly string[]) => GitCommandResult;

export function findGitRepositories(watchRoots: readonly string[]): readonly string[] {
  const repositories = new Set<string>();
  function visit(path: string): void {
    let entries: Dirent<string>[];
    try {
      entries = readdirSync(path, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }
    if (entries.some((entry) => entry.name === ".git")) {
      repositories.add(realpathSync(path));
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      visit(resolve(path, entry.name));
    }
  }
  for (const root of watchRoots) {
    if (!isAbsolute(root)) throw new Error(`watch root must be absolute: ${root}`);
    visit(root);
  }
  return [...repositories].sort();
}

function runGit(repositoryPath: string, args: readonly string[]): GitCommandResult {
  const result = Bun.spawnSync(["git", "-C", repositoryPath, ...args], { stdout: "pipe", stderr: "pipe" });
  return { status: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

function normalizedRemote(remote: string): string | null {
  const trimmed = remote.trim().replace(/\.git$/, "");
  const scp = trimmed.match(/^git@([^:]+):(.+)$/);
  if (scp?.[1] !== undefined && scp[2] !== undefined) return `${scp[1]}/${scp[2]}`;
  try {
    const url = new URL(trimmed);
    return `${url.hostname}${url.pathname}`.replace(/^\/+|\/+$/g, "");
  } catch {
    return null;
  }
}

function parseWorktrees(output: string, repositoryId: string): readonly GitWorktreeIdentity[] {
  const found: GitWorktreeIdentity[] = [];
  let path: string | null = null;
  let branch: string | null = null;
  function append(): void {
    if (path !== null && branch !== null) found.push({ path, repositoryId, branch });
    path = null;
    branch = null;
  }
  for (const line of `${output}\n`.split("\n")) {
    if (line === "") {
      append();
    } else if (line.startsWith("worktree ")) {
      path = line.slice("worktree ".length);
    } else if (line.startsWith("branch refs/heads/")) {
      branch = line.slice("branch refs/heads/".length);
    } else if (line === "detached") {
      branch = "(detached)";
    }
  }
  return found;
}

/**
 * @tested-by: tst_svc_planctld_sessions_001
 * @invariant: worktree correlation uses explicit repository IDs or normalized remotes and never invents identity from a local folder name.
 */
export function discoverGitWorktrees(
  repositoryPaths: readonly string[],
  repositoryIds: Readonly<Record<string, string>>,
  command: GitCommand = runGit,
): GitDiscoveryResult {
  const worktrees: GitWorktreeIdentity[] = [];
  const issues: GitDiscoveryIssue[] = [];
  for (const configuredPath of repositoryPaths) {
    if (!isAbsolute(configuredPath)) throw new Error(`repository path must be absolute: ${configuredPath}`);
    const repositoryPath = realpathSync(resolve(configuredPath));
    const explicit = repositoryIds[repositoryPath];
    const remoteResult = explicit === undefined ? command(repositoryPath, ["config", "--get", "remote.origin.url"]) : null;
    const repositoryId = explicit ?? (remoteResult?.status === 0 ? normalizedRemote(remoteResult.stdout) : null);
    if (repositoryId === null || repositoryId === "") {
      issues.push({ repositoryPath, message: "repository has no explicit ID or normalized origin remote" });
      continue;
    }
    const list = command(repositoryPath, ["worktree", "list", "--porcelain"]);
    if (list.status !== 0) {
      issues.push({ repositoryPath, message: list.stderr.trim() || "git worktree discovery failed" });
      continue;
    }
    worktrees.push(...parseWorktrees(list.stdout, repositoryId));
  }
  return { worktrees, issues };
}
