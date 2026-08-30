#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  lstatSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const MANAGED_MARKER = "Managed by 0_agents code-production";

const REQUIRED_SCRIPTS = [
  "agent:install",
  "agent:test:backend",
  "agent:test:frontend",
  "agent:test:e2e",
  "agent:verify:commit",
  "agent:verify:pr",
  "agent:verify:docs",
] as const;

interface PackageContract {
  readonly scripts: Readonly<Record<string, string>>;
  readonly ci: CiContract;
}

type CiContract =
  | { readonly kind: "managed" }
  | { readonly kind: "external"; readonly workflow: string };

interface ManagedFile {
  readonly source: string;
  readonly target: string;
  readonly executable: boolean;
  readonly guarded: boolean;
}

export interface StackReport {
  readonly root: string;
  readonly files: readonly string[];
  readonly scripts: readonly string[];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asRecord(value: unknown, name: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be a JSON object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function readPackage(root: string): PackageContract {
  const packagePath = join(root, "package.json");
  if (!existsSync(packagePath)) throw new Error(`${packagePath} does not exist`);
  const parsed: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
  const packageJson = asRecord(parsed, "package.json");
  const scriptsValue = asRecord(packageJson.scripts, "package.json scripts");
  const scripts: Record<string, string> = {};
  for (const [name, value] of Object.entries(scriptsValue)) {
    if (typeof value !== "string") throw new Error(`package.json script ${name} must be a string`);
    scripts[name] = value;
  }
  for (const name of REQUIRED_SCRIPTS) {
    const command = scripts[name];
    if (command === undefined || command.trim() === "") {
      throw new Error(`package.json is missing required script ${name}; read package-contract.md`);
    }
    if (command.includes("--no-verify")) throw new Error(`${name} may not bypass Git hooks`);
  }
  const commitGate = scripts["agent:verify:commit"];
  if (commitGate === undefined) throw new Error("package.json is missing required script agent:verify:commit");
  if (commitGate.includes("agent:verify:pr")) {
    throw new Error("agent:verify:commit may not buy the complete PR gate");
  }
  const stackValue = packageJson.agentStack;
  if (stackValue === undefined) return { scripts, ci: { kind: "managed" } };
  const stack = asRecord(stackValue, "package.json agentStack");
  const ci = stack.ci;
  if (ci === undefined || ci === "managed") {
    if (stack.ciWorkflow !== undefined) {
      throw new Error("package.json agentStack.ciWorkflow requires agentStack.ci = external");
    }
    return { scripts, ci: { kind: "managed" } };
  }
  if (ci !== "external") throw new Error("package.json agentStack.ci must be managed or external");
  const workflow = stack.ciWorkflow;
  if (typeof workflow !== "string"
    || !/^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/.test(workflow)
    || workflow === ".github/workflows/code-production.yml") {
    throw new Error("package.json agentStack.ciWorkflow must name an existing project-owned GitHub workflow");
  }
  const externalWorkflow = join(root, workflow);
  if (!existsSync(externalWorkflow)) {
    throw new Error(`external CI workflow does not exist: ${workflow}`);
  }
  if (!lstatSync(externalWorkflow).isFile()) {
    throw new Error(`external CI workflow must be a regular file: ${workflow}`);
  }
  const managedWorkflow = join(root, ".github/workflows/code-production.yml");
  if (existsSync(managedWorkflow)) {
    throw new Error("external CI selected while the managed code-production workflow still exists; remove it explicitly to avoid duplicate gates");
  }
  return { scripts, ci: { kind: "external", workflow } };
}

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function assertRepository(root: string): void {
  const top = git(root, ["rev-parse", "--show-toplevel"]);
  if (resolve(top) !== root) throw new Error(`${root} is not the Git repository root`);
}

function managedFiles(sourceRoot: string, ci: CiContract): readonly ManagedFile[] {
  const files: readonly ManagedFile[] = [
    {
      source: join(sourceRoot, "runtime/planctl.ts"),
      target: ".agents/code-production/runtime/planctl.ts",
      executable: true,
      guarded: false,
    },
    {
      source: join(sourceRoot, "runtime/plan-update.ts"),
      target: ".agents/code-production/runtime/plan-update.ts",
      executable: true,
      guarded: false,
    },
    {
      source: join(sourceRoot, "runtime/plan-gate.ts"),
      target: ".agents/code-production/runtime/plan-gate.ts",
      executable: true,
      guarded: false,
    },
    {
      source: join(sourceRoot, "templates/hooks/pre-commit"),
      target: ".githooks/pre-commit",
      executable: true,
      guarded: true,
    },
    {
      source: join(sourceRoot, "templates/hooks/pre-push"),
      target: ".githooks/pre-push",
      executable: true,
      guarded: true,
    },
    {
      source: join(sourceRoot, "templates/hooks/post-commit"),
      target: ".githooks/post-commit",
      executable: true,
      guarded: true,
    },
    {
      source: join(sourceRoot, "templates/github/code-production.yml"),
      target: ".github/workflows/code-production.yml",
      executable: false,
      guarded: true,
    },
  ];
  return ci.kind === "external"
    ? files.filter((file) => file.target !== ".github/workflows/code-production.yml")
    : files;
}

function assertSafeTarget(root: string, file: ManagedFile): void {
  const target = join(root, file.target);
  if (!existsSync(target)) return;
  const current = readFileSync(target, "utf8");
  const expected = readFileSync(file.source, "utf8");
  if (current === expected) return;
  if (file.guarded && !current.includes(MANAGED_MARKER)) {
    throw new Error(`refusing to overwrite unmanaged ${file.target}`);
  }
}

function installFile(root: string, file: ManagedFile): void {
  assertSafeTarget(root, file);
  const target = join(root, file.target);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(file.source, target);
  if (file.executable) chmodSync(target, 0o755);
}

function sourceCommit(sourceRoot: string): string {
  return git(resolve(sourceRoot, "../.."), ["rev-parse", "HEAD"]);
}

function writeManifest(
  root: string,
  sourceRoot: string,
  files: readonly ManagedFile[],
  ci: CiContract,
): void {
  const target = join(root, ".agents/code-production/manifest.json");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify({
    version: 1,
    source: "dltxperts/0_agents",
    commit: sourceCommit(sourceRoot),
    ci: ci.kind === "managed" ? { kind: "managed" } : { kind: "external", workflow: ci.workflow },
    files: files.map((file) => file.target),
  }, null, 2)}\n`);
}

function ensureWorktreeIgnore(root: string): void {
  const target = join(root, ".gitignore");
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";
  const hasWorktrees = /^\/?\.worktrees\/?$/m.test(current);
  const hasProcessTemp = /^\/?\.tmp\/code-production\/?$/m.test(current);
  if (hasWorktrees && hasProcessTemp) return;
  const separator = current === "" || current.endsWith("\n") ? "" : "\n";
  const entries = [
    ...(hasWorktrees ? [] : ["/.worktrees/"]),
    ...(hasProcessTemp ? [] : ["/.tmp/code-production/"]),
  ];
  writeFileSync(target, `${current}${separator}\n# Managed local agent state\n${entries.join("\n")}\n`);
}

export function installStack(rootArg: string, sourceRoot = import.meta.dir): StackReport {
  const root = resolve(rootArg);
  assertRepository(root);
  const contract = readPackage(root);
  const files = managedFiles(sourceRoot, contract.ci);
  for (const file of files) installFile(root, file);
  writeManifest(root, sourceRoot, files, contract.ci);
  mkdirSync(join(root, "docs/plans"), { recursive: true });
  ensureWorktreeIgnore(root);
  git(root, ["config", "extensions.worktreeConfig", "true"]);
  git(root, ["config", "--worktree", "core.hooksPath", ".githooks"]);
  return { root, files: files.map((file) => file.target), scripts: Object.keys(contract.scripts) };
}

export function checkStack(rootArg: string, sourceRoot = import.meta.dir): StackReport {
  const root = resolve(rootArg);
  assertRepository(root);
  const contract = readPackage(root);
  const files = managedFiles(sourceRoot, contract.ci);
  const mismatches: string[] = [];
  for (const file of files) {
    const target = join(root, file.target);
    if (!existsSync(target) || readFileSync(target, "utf8") !== readFileSync(file.source, "utf8")) {
      mismatches.push(file.target);
    }
  }
  if (mismatches.length > 0) throw new Error(`managed stack is missing or stale: ${mismatches.join(", ")}`);
  if (git(root, ["config", "--worktree", "--get", "core.hooksPath"]) !== ".githooks") {
    throw new Error("core.hooksPath must be .githooks");
  }
  return { root, files: files.map((file) => file.target), scripts: Object.keys(contract.scripts) };
}

const HELP = `Usage: agent-stack <command> [repository]

Commands:
  install [repo]   Validate package.json, vendor the deterministic runtime,
                   install managed Git hooks/GitHub workflow and select hooks
  check [repo]     Refuse missing scripts, stale managed files or wrong hooks
  --help           Show this help

The repository defaults to the current directory. Read:
  shared/code-production/package-contract.md

Repositories with an existing complete CI workflow declare
  package.json agentStack.ci = external
before install; the named workflow remains the only published-SHA gate.
`;

function main(args: readonly string[]): void {
  const command = args[0];
  if (command === undefined || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }
  const root = args[1] ?? process.cwd();
  const report = command === "install"
    ? installStack(root)
    : command === "check"
      ? checkStack(root)
      : (() => { throw new Error(`unknown command ${command}`); })();
  console.log(`agent-stack: ${command} OK — ${report.root}`);
  console.log(`managed files: ${report.files.length}; package scripts: ${REQUIRED_SCRIPTS.length}/${REQUIRED_SCRIPTS.length}`);
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(`agent-stack: ${message(error)}`);
    process.exitCode = 1;
  }
}
