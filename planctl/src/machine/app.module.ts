import { readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ScheduleModule, SchedulerRegistry } from "@nestjs/schedule";

import { MACHINE_TOKEN_KEY, planctlSecretsModule } from "../config/config";
import { protocolImplementationHash, protocolLockViolations } from "../core/plan-gate";
import { projectPlanProgress } from "../core/plan-progress";
import { completedStageSamples } from "../core/plan-update";
import { decodeTaskRun } from "../core/task-run";
import { CollectorService, COLLECTOR_OPTIONS } from "./collector.service";
import { discoverGitWorktrees, findGitRepositories } from "./discovery/git-worktree.source";
import { scanClaudeSessionFile } from "./sessions/claude-session.source";
import { scanCodexSessionFile } from "./sessions/codex-session.source";
import { discoverLinuxAgentProcesses } from "./sessions/linux-process.source";
import { classifySessionActivities, emptySessionFileCursor } from "./sessions/session-source";
import { MachineStore } from "./state/machine-store";
import { ServerClient } from "./transport/server-client";

import type { DynamicModule } from "@nestjs/common";
import type { Dirent } from "node:fs";
import type { MachineConfig } from "../config/config";
import type { TaskRun } from "../core/task-run";
import type { ReportedPlanProgress } from "../core/snapshot-protocol";
import type { FetchRequest } from "./transport/server-client";
import type {
  CollectorClock,
  CollectorObservationSource,
  CollectorScheduler,
  MachineObservation,
} from "./collector.service";
import type { GitWorktreeIdentity, SessionActivity, StructuredOwnerWait } from "./sessions/session-source";

const MACHINE_STORE = Symbol("MACHINE_STORE");
const OBSERVATION_SOURCE = Symbol("OBSERVATION_SOURCE");
const SERVER_TRANSPORT = Symbol("SERVER_TRANSPORT");

class SystemClock implements CollectorClock {
  now(): Date {
    return new Date();
  }
}

class NestCollectorScheduler implements CollectorScheduler {
  #nextId = 1;
  readonly #names = new Map<number, string>();

  constructor(private readonly registry: SchedulerRegistry) {}

  every(milliseconds: number, task: () => void): number {
    const id = this.#nextId;
    this.#nextId += 1;
    const name = `planctld-collector-${id}`;
    this.registry.addInterval(name, setInterval(task, milliseconds));
    this.#names.set(id, name);
    return id;
  }

  cancel(handle: unknown): void {
    if (typeof handle !== "number") throw new Error("collector schedule handle is invalid");
    const name = this.#names.get(handle);
    if (name === undefined) return;
    this.registry.deleteInterval(name);
    this.#names.delete(handle);
  }
}

function filesBelow(root: string, suffix: string, modifiedAfter: number): readonly string[] {
  const files: string[] = [];
  function visit(path: string): void {
    let entries: Dirent<string>[];
    try {
      entries = readdirSync(path, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }
    for (const entry of entries) {
      const candidate = join(path, entry.name);
      if (entry.isDirectory()) {
        visit(candidate);
      } else if (entry.isFile() && entry.name.endsWith(suffix) && statSync(candidate).mtimeMs >= modifiedAfter) {
        files.push(candidate);
      }
    }
  }
  visit(root);
  return files.sort();
}

function gitCommonDirectory(worktree: string): string | null {
  const result = Bun.spawnSync(
    ["git", "-C", worktree, "rev-parse", "--path-format=absolute", "--git-common-dir"],
    { stdout: "pipe", stderr: "pipe" },
  );
  return result.exitCode === 0 ? result.stdout.toString().trim() : null;
}

function structuredOwnerWait(input: unknown): StructuredOwnerWait {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("owner wait must be an object");
  const value = input as Readonly<Record<string, unknown>>;
  if (value.version !== 1 || typeof value.plan !== "string" || typeof value.taskId !== "string"
    || typeof value.reason !== "string" || typeof value.startedAt !== "string") {
    throw new Error("owner wait has an unsupported shape");
  }
  if (value.reason === "" || value.reason.includes("\n") || value.reason.length > 240
    || !Number.isFinite(Date.parse(value.startedAt))) throw new Error("owner wait is invalid");
  return { plan: value.plan, taskId: value.taskId, reason: value.reason, startedAt: value.startedAt };
}

function correlationReceipts(worktrees: readonly GitWorktreeIdentity[], machineId: string): {
  readonly taskRuns: readonly TaskRun[];
  readonly ownerWaits: readonly StructuredOwnerWait[];
  readonly issues: readonly string[];
} {
  const taskRuns: TaskRun[] = [];
  const ownerWaits: StructuredOwnerWait[] = [];
  const issues: string[] = [];
  const commonDirectories = new Set(worktrees.map((worktree) => gitCommonDirectory(worktree.path)).filter((path) => path !== null));
  for (const common of commonDirectories) {
    const commonRuns: TaskRun[] = [];
    for (const path of filesBelow(join(common, "planctl", "task-runs"), ".json", 0)) {
      try {
        const run = decodeTaskRun(JSON.parse(readFileSync(path, "utf8")) as unknown);
        if (run.version === 1 || run.machineId === machineId) {
          taskRuns.push(run);
          commonRuns.push(run);
        }
      } catch {
        issues.push("malformed_task_receipt");
      }
    }
    for (const path of filesBelow(join(common, "planctl", "owner-waits"), ".json", 0)) {
      try {
        const wait = structuredOwnerWait(JSON.parse(readFileSync(path, "utf8")) as unknown);
        const run = commonRuns.find((candidate) => candidate.version === 2
          && candidate.plan === wait.plan && candidate.taskId === wait.taskId);
        ownerWaits.push(run?.version === 2 ? { ...wait, agentId: run.agentId } : wait);
      } catch {
        issues.push("malformed_owner_wait");
      }
    }
  }
  return { taskRuns, ownerWaits, issues };
}

function planGoal(body: string): string {
  const heading = "## The Goal\n";
  const target = "\n## The target";
  const start = body.indexOf(heading);
  const end = body.indexOf(target, start + heading.length);
  if (start === -1 || end === -1) throw new Error("plan Goal section is missing");
  const firstParagraph = body.slice(start + heading.length, end).trim().split(/\n\s*\n/, 1)[0];
  if (firstParagraph === undefined || firstParagraph === "") throw new Error("plan Goal is empty");
  return firstParagraph.replace(/\s*\n\s*/g, " ");
}

interface PlanLocation {
  readonly repositoryId: string;
  readonly worktree: string;
  readonly plan: string;
}

function reportedPlans(taskRuns: readonly TaskRun[], worktrees: readonly GitWorktreeIdentity[]): {
  readonly plans: readonly ReportedPlanProgress[];
  readonly issues: readonly string[];
} {
  const plans = new Map<string, ReportedPlanProgress>();
  const locations = new Map<string, PlanLocation>();
  const issues: string[] = [];
  for (const run of taskRuns) {
    if (run.version !== 2) continue;
    const location = { repositoryId: run.repositoryId, worktree: run.worktree, plan: run.plan };
    locations.set(`${location.repositoryId}:${location.worktree}:${location.plan}`, location);
  }
  for (const worktree of worktrees) {
    for (const path of filesBelow(join(worktree.path, "docs/plans"), ".md", 0)) {
      const plan = relative(worktree.path, path).replaceAll("\\", "/");
      if (!/^docs\/plans\/[a-z0-9][a-z0-9-]*\.md$/.test(plan)) continue;
      const location = { repositoryId: worktree.repositoryId, worktree: worktree.path, plan };
      locations.set(`${location.repositoryId}:${location.worktree}:${location.plan}`, location);
    }
  }
  for (const location of locations.values()) {
    const planId = `${location.repositoryId}:${location.plan}`;
    try {
      const body = readFileSync(resolve(location.worktree, location.plan), "utf8");
      if (!/^Status: APPROVED$/m.test(body)) continue;
      const violations = protocolLockViolations(body);
      if (violations.length > 0) throw new Error(violations.join("; "));
      const candidate: ReportedPlanProgress = {
        planId,
        planRevision: protocolImplementationHash(body),
        goal: planGoal(body),
        progress: projectPlanProgress(body),
        completedTaskSamples: completedStageSamples(body),
      };
      const existing = plans.get(planId);
      if (existing !== undefined && existing.planRevision !== candidate.planRevision) {
        issues.push("plan_revision_conflict");
        continue;
      }
      plans.set(planId, candidate);
    } catch {
      issues.push("plan_projection_failed");
    }
  }
  return { plans: [...plans.values()].sort((left, right) => left.planId.localeCompare(right.planId)), issues };
}

export class LocalMachineObservationSource implements CollectorObservationSource {
  constructor(
    private readonly config: MachineConfig,
    private readonly store: MachineStore,
  ) {}

  scan(now: Date): MachineObservation {
    const activities: SessionActivity[] = [];
    const issues: string[] = [];
    const cutoff = now.getTime() - this.config.collector.sessionLookbackDays * 86_400_000;
    for (const path of filesBelow(this.config.collector.codexSessions, ".jsonl", cutoff)) {
      const result = scanCodexSessionFile(path, this.store.sourceCursor(path) ?? emptySessionFileCursor());
      this.store.putSourceCursor(path, result.cursor);
      if (result.activity !== null) activities.push(result.activity);
      issues.push(...result.issues.map((issue) => `codex:${issue.code}`));
    }
    for (const path of filesBelow(this.config.collector.claudeSessions, ".jsonl", cutoff)) {
      const result = scanClaudeSessionFile(path, this.store.sourceCursor(path) ?? emptySessionFileCursor());
      this.store.putSourceCursor(path, result.cursor);
      if (result.activity !== null) activities.push(result.activity);
      issues.push(...result.issues.map((issue) => `claude:${issue.code}`));
    }
    const repositories = findGitRepositories(this.config.collector.watchRoots);
    const git = discoverGitWorktrees(repositories, this.config.repositoryIds);
    issues.push(...git.issues.map(() => "git_discovery_failed"));
    const receipts = correlationReceipts(git.worktrees, this.config.machineId);
    issues.push(...receipts.issues);
    const planProjection = reportedPlans(receipts.taskRuns, git.worktrees);
    issues.push(...planProjection.issues);
    return {
      agents: classifySessionActivities({
        activities,
        processes: discoverLinuxAgentProcesses(),
        worktrees: git.worktrees,
        taskRuns: receipts.taskRuns,
        ownerWaits: receipts.ownerWaits,
        now,
        staleAfterSeconds: this.config.collector.staleAfterSeconds,
      }),
      plans: planProjection.plans,
      sourceIssues: [...new Set(issues)].sort(),
    };
  }
}

@Module({})
export class MachineAppModule {
  static register(config: MachineConfig, transportFetch?: FetchRequest): DynamicModule {
    if (!isAbsolute(config.collector.stateDb)) throw new Error("machine state database path must be absolute");
    return {
      module: MachineAppModule,
      imports: [ScheduleModule.forRoot(), planctlSecretsModule(config.server.envFile, MACHINE_TOKEN_KEY)],
      providers: [
        SystemClock,
        {
          provide: MACHINE_STORE,
          useFactory: (): MachineStore => new MachineStore(resolve(config.collector.stateDb)),
        },
        {
          provide: OBSERVATION_SOURCE,
          inject: [MACHINE_STORE],
          useFactory: (store: MachineStore): LocalMachineObservationSource => new LocalMachineObservationSource(config, store),
        },
        {
          provide: SERVER_TRANSPORT,
          inject: [ConfigService],
          useFactory: (secrets: ConfigService): ServerClient => new ServerClient({
            machineId: config.machineId,
            baseUrl: config.server.url,
            token: secrets.getOrThrow<string>(MACHINE_TOKEN_KEY),
            connectTimeoutMs: config.server.connectTimeoutMs,
            requestTimeoutMs: config.server.requestTimeoutMs,
            ...(transportFetch === undefined ? {} : { fetch: transportFetch }),
          }),
        },
        {
          provide: COLLECTOR_OPTIONS,
          inject: [MACHINE_STORE, OBSERVATION_SOURCE, SERVER_TRANSPORT, SystemClock, SchedulerRegistry],
          useFactory: (
            store: MachineStore,
            source: LocalMachineObservationSource,
            transport: ServerClient,
            clock: SystemClock,
            registry: SchedulerRegistry,
          ) => ({
            machineId: config.machineId,
            scanMs: config.collector.scanSeconds * 1_000,
            heartbeatMs: config.collector.heartbeatSeconds * 1_000,
            store,
            source,
            transport,
            clock,
            scheduler: new NestCollectorScheduler(registry),
          }),
        },
        CollectorService,
      ],
      exports: [CollectorService],
    };
  }
}
