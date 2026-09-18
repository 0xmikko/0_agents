# Agent instructions, rule by rule: memory becomes law, the rest is cut

Status: SPEC_LOCKED  
Spec lock: sha256:bb924d3815e01b33ebe830a95a94189d2b2c45bed38997ed5154108fd74f5a26 owner:SPEC is APPROVED let's go for stages  
Implementation lock: unlocked  
Active Delivery: none  
Unattended decisions: allowed  

<!-- plan:spec:start -->
## The Goal

Three stages of the workflow, one number each.

Planning. The number is the owner's planning time that is useful: brainstorming, understanding details, deciding. Wasted time is demanding rewrites, fixing broken mermaid, stages written as file lists, invented words, goals written as problems, text too long to read. Today: 218 corrections in four weeks, 151 of them about form and about 70 about substance; one SPEC took ten review rounds and 53 commits. Goal: corrections about form drop to zero, substance rounds stay under three, and a SPEC fits in 250 lines so the owner reads it in one sitting.

Execution. The number is dumb questions to the owner when the work stepped a little off the plan, and their cousins: stops at a tool refusal, boxes the owner closes by hand, full gates bought "to see". Today: 25 "да" for writes lists in one plan, 12 "продолжай" in nine plans, 60 % of 377 Deviations lines are bookkeeping, 49 open boxes at the last end-work with 24 of them prose, three to ten full gates per Delivery. Goal: zero dumb questions, zero stops at a refusal, zero prose boxes, one local gate and one CI run per Delivery.

Retro. The number is process changes a retro produces. Today: nine experiments since 25 August, none adopted, the scorecard vanished, the same red-CI round trip repeated. Goal: every end-work carries the previous experiment with a status and one new one.

Code quality has no stage of its own. It is what execution produces when the four code rules are always on and the three reviewers read the same law the author did. It shows as defects found at integration (seven in one Delivery today) and second copies of a mechanism merged (six plans today), both going to zero.

## What is done, resource by resource

Measured on 0_agents `7cbc4a5` and magnis-app `dc396a3ee` (2026-09-17). Sixteen resources feed an agent today: about 6 100 lines of instructions, 16 000 lines of live documentation, 76 000 lines of plans and research. Each heading below is one resource: what is there, what is done with it, and in which plan.

### The global screen: `claude/CLAUDE.md` and `codex/AGENTS.md` (0_agents)

Today: 85 lines that repeat the skills, and a Codex file of 21 lines with none of the rules. Done: both become one screen of under 30 lines holding only what the model cannot infer and keeps getting wrong. Anthropic's guidance and Boris Cherny's (delete everything, bring back one instruction at a time when the model actually struggles; a rule that must hold goes to a hook, knowledge needed sometimes goes to a skill; emphasize one line, not ten). The process is not on it, because the machine prints the agent's position (next heading). The screen:

```markdown
# Working here

Where you are and what you can do now is printed at session start by planctl. If it is
missing, run `bun .agents/code-production/runtime/planctl.ts focus` before anything else.

IMPORTANT: little code that is understood and explained beats much code. One name per
thing, the name the repository already uses: find it before you write one. A word that
exists nowhere in the repository is declared with its reason or does not appear. No
synonyms, no task codes, no `file.ts:123` in prose.

DRY and SOLID, here: one mechanism per job, extend it, never copy it; one class per file,
one reason to change; depend on interfaces the caller owns; a function does one thing and
is named for it. A second copy of anything is a defect and the reviewers reject it.

Not more engineering than the test needs. No abstraction, generic, interface, option or
new file for a case that does not exist yet: two users or none. The simplest change that
makes the red test green, then stop.

Mistakes this model keeps making here, so do not:
- Claims from structure. Check the artifact: run it, open it, `git show origin/staging:<path>`.
- Fallbacks, defaults, "just in case". A missing value is an error.
- Tests green from birth. Red first; prove a green-from-birth test by mutating the source.
- Stopping at a tool refusal. Record one line and continue; a stop ends with "waiting for: X".

Verify only with the project's `agent:*` scripts; never compose framework commands.
Language guide by file: `.ts`/`.tsx` → typescript.md, `.rs` → rust.md.
Never edit workflows, infrastructure, `.claude/`, secrets, CLAUDE.md or AGENTS.md unless
the task names the file. Never kill or reuse a process you did not start.
The owner is on a Claude subscription: no API key, ever.
```

### The session brief: `planctl focus --brief` and the managed hook

Today: an agent starts a session, re-reads the plan, loses its place after a compaction, and the owner explains which Stage is open. Done: Claude Code adds a hook's stdout to the model's context at session start, after a resume, after a compaction and on every prompt ([hooks reference](https://code.claude.com/docs/en/hooks)). `planctl focus` exists; it gets `--brief`, and the managed `.claude/settings.json` runs it at `SessionStart` (startup, resume, compact) and prints one line at `UserPromptSubmit`. About ten lines, generated from the plan's own state, never stale:

```text
Plan docs/plans/unified-launch.md — APPROVED, implementation locked.
You are in Stage D1-S6 "package.json is the whole launch surface", Task UL_011 started 21:44Z.
Done: S1–S5. Waiting on you: S7, S8 (they depend on S6).
Now you can:
  RED for UL_011:   bun run agent:test:backend -- ../scripts/tests/launch-surface.test.ts
  after the commit: planctl complete-task docs/plans/unified-launch.md --from stage-result.json
  a shortfall:      planctl add-deviation … --stage D1-S6 --reason "…"   (record it, do not stop)
  commands green:   planctl close-stage … --stage D1-S6
Without the owner: add a test, add a file the compiler names, touch one more file in this commit.
Owner's word only: the goal, the target tree, the meaning of a criterion.
```

A `SPEC_DRAFT` plan gets "you are planning; the SPEC is yours to edit; next `set-spec`, then `lock-spec` on the owner's word; the judge runs before the owner sees it". A branch without a plan gets one line: "no plan here; planning is /blueprint, a small fix is a commit and a PR". Codex runs the same command from its own session hook.

### The language guides: `shared/lang/typescript.md`, `rust.md` (0_agents)

Today: 179 lines, loaded by "the language of the task", so a TypeScript task reads the Rust guide. Done: kept for the other repositories that need them, trimmed to style, loaded only for files of that language, `.ts`/`.tsx` and `.rs`.

### The three reviewers: `claude/agents/*-cop.md` (0_agents) and the Magnis copies

Today: 323 lines globally and three Magnis-specialised copies, all carrying Rust and cargo sections for TypeScript code. Done: three reviewers stay, one metric each, coherence (reuse and layers), coverage (tests and edge cases), simplicity (no speculative abstraction, no file bloat), verdict REJECT by default, each under 80 lines with Rust removed. Codex is called only when asked or for diffs over 200 lines, at most two rounds; a real correctness finding at the cap is fixed, style is dropped. The Magnis copies stay project-level and are trimmed in the Magnis plan.

### The skills (0_agents): 16 shared, 9 personal

Today: about 3 400 lines; thirteen skills are from the cargo era and contradict the process (full suite per Stage, rebase and force-push, "proceed without an approved plan", a fourth plan format, Cyrus dispatch). Done: nine stay, `blueprint`, `blueprint-start`, `end-work`, `bug`, `review-implementation`, `cleanup-worktrees`, `mdurl`, `dictate`, `nvim`, each of the four process skills under 60 lines; sixteen go: `start-work`, `test-protocol`, `completion-note`, `verify-app`, `verify-frontend`, `fast-precommit`, `fix-ci-cd`, `quick-fix`, `plan`, `review-plan`, `execute`, `finish-plan`, `git`, `dispatch-to-linear`, `execute-from-linear`, `launch-e2e`. The owner's business skills are untouched. What the four process skills say:

`blueprint`: the plan is born in its own worktree from fresh `origin/staging`, with the list of open PRs into staging touching its files; the SPEC has a fixed skeleton (below); names come from the repository, or from the project's vocabulary page where one exists; a new one is declared in a table with its reason and the pre-approval screen prints the count; every new or changed type is TypeScript, hand-written interfaces one field per line, zod decoding into them, never a sentence or "as elsewhere"; the Goal is the owner's currencies with today's number and the target, never "measure X"; sizes are counted, SPEC ≤ 250 lines, Delivery ≤ 8 Stages, Stage ≤ 40 lines reading as its commit message, Task ≤ 200 characters, more work is the next Delivery; no minutes, no credits; review only on the owner's word, at most three rounds, fixing only what the plan cannot run without; the linter and the judge have passed before the owner is asked.

`blueprint-start`: start and before the gate, merge `origin/staging`, run `agent:install`, dry-run the compiler, then the project's own post-merge checklist from its `CLAUDE.md` (for Magnis: build the SDK, grep raw SQL for renamed columns, `uniq -d` migration numbers, re-pin docs in the same commit that moves an anchor); the browser lane once at the start for its baseline; per Stage `start-task`, red, green, the Stage's one to three files, the three reviewers on the diff, one commit, `complete-task`, next Stage; the three tiers (below); the complete gate once through the pre-push hook, a push when someone needs the new state, the agent flips ready, the owner merges.

`end-work`: confirm the owner merged; print the three currency numbers for the Delivery (corrections about form and substance before approval; dumb questions, stops and gates during execution; the status of the previous experiment); write one new experiment into the register with a date; refuse to close while the previous experiment has no status; the ledger row in one fixed form, merged, N boxes open under Deviations, the experiment line; remove the worktree and only its registered temp roots.

`bug`: reproduce with a red test, fix, run that file and the Stage's files, never the full suite by hand; the escape hatch for a three-line typo stays and announces itself.

### The process laws (0_agents): four files become two

Today: 792 lines in four files that disagree on the Task format, require Predict minutes and credits, mention a scorecard that does not exist, and carry 85 lines of commit archaeology. Done: `development-process.md` (under 100 lines) holds the lifecycle with its two owner approvals, the sizes, the Stage cadence, the three tiers, git in one paragraph (worktree per branch from `origin/staging`, merge commits only, never rewrite, one commit per Stage, no wip, never push to staging or main, `git -C <abs>`), verification once per Delivery, the unattended rule, the handoff, and the retro register at its end. `plan-format.md` (under 80 lines) holds the skeleton, one Task template, what approval freezes, the linter's rules, the forbidden list. `plan-protocol.md` and `git-workflow.md` are deleted; every rule of theirs that survives is in those two.

The three tiers, as the law states them. Free, the agent does it and planctl records the difference in the result row: add a test, add a file the compiler names, touch a file beyond the writes in the same commit, close a Stage whose commands are green. Recorded, one Deviations line and on: a new file outside the target tree, a deleted test, a criterion that became unreachable. The owner's word, and only here: the goal and its measure, removing a promised file from the tree, the meaning of an acceptance criterion, scope beyond the Delivery.

### planctl and plan-gate (0_agents `planctl/`)

Today: planctl refuses a fifth write, a story that does not repeat its paths, a commit touching one file beyond the writes, a Task without minutes; plan-gate checks receipts and nothing about how the text reads. Done, in four parts. PR #12 (open): writes are files, directories or globs with no cap, extra files are recorded in the result row, minutes and credits accept zero. The linter, in plan-gate: the skeleton (the Goal as currencies with today's number and target, the target tree, the Types block when `.ts` sources change, the New names table, the Not verified list); every box a command with its exit code or the Commit box; mermaid parsed; banned words, task codes and `file.ts:123` in prose refused; sentences over thirty words refused; Predict fields refused. The judge, `plan-gate --judge`: a fixed rubric in `shared/code-production/plan-judge.md`, one question per rule a linter cannot answer (is the Goal a goal or a problem, does each Stage read as a commit, are the names existing ones, is the prose plain), answered by a small model through `claude -p --model haiku` on the owner's subscription with a quote from the plan for every answer; 1.4 seconds on a test call today; the verdict stored by SPEC hash so the same bytes are never judged twice; `lock-spec` refuses without a PASS and an unavailable judge refuses the lock. The brief, `focus --brief`, as above.

### The instruction audit: `shared/code-production/instruction-audit.ts` (0_agents)

Today: nothing counts the instruction set. Done: one script run by `agent:verify:docs` in 0_agents refuses a sentence of twelve or more words present in two instruction files, a path, script or skill that does not exist, a banned word (lane, receipt as a noun for a test result, stand, farm, envelope, ceremony, doctrine, census, plane, currency), a language guide named outside a by-extension rule, and more than 900 lines in the loaded set. Red today.

### The project screen: Magnis `CLAUDE.md` and `AGENTS.md` (Magnis plan)

Today: 74 and 84 lines, thirty stale facts: `bun run dev:web` does not exist, `MAGNIS_DB_MODE` is retired, `backend/src/sources` is gone, the Deployment section says PGlite. Done: `CLAUDE.md` under 45 lines opens with what Magnis is, in the owner's words:

```markdown
Magnis is a personal operations system on the owner's own machine. It connects to the
services a person already uses (Telegram, Gmail, Google Calendar), syncs their data
locally and shows the whole picture: who they talk to, what they work on, how it relates.

It is built as a typed graph, and that is the bet: a typed graph works better than an
untyped one. Graphiti, cognee and mem0 store what a model concluded as free nodes and
free edges; Magnis classifies. A meeting gets a shape agreed once, every meeting has the
same shape, and over the shapes there are tables, search, grouping and dashboards. The
shape is the vocabulary a question can be asked in. Two kinds of rows enter the shapes,
told apart by one column, `origin`: canonical, what a source delivered as delivered; and
agent, what a model concluded from canonical rows, with confidence, evidence and a
validity interval. `docs/graph.md` holds the idea and the vocabulary of every shape,
spelled as the code spells it.

The NestJS backend on Bun owns the graph and is the only writer. The React/Tauri desktop
app, the CLI and the MCP surface are clients. The backend is handed one PostgreSQL URL
and never chooses a database: a native cluster inside the desktop app, embedded on the
dev stand, managed on the server; PGlite only in the test runner. Sources run as
connectors in their own processes over MCP; modules (contacts, meetings, episodes, …) own
their shapes and their UI; an installation is one document naming the accounts, from
which the server derives the modules.
```

then the commands as they exist (`db:up`, `dev`, `backend:dev`, scoped `bun test`, `check:backend`, `docs:check`, `test:e2e`, the vendored planctl path, `git reset -q` after a refused commit), the dev stand (`db:up` prints `DATABASE_URL`, embedded PostgreSQL 16 or `--docker`, `dev` runs backend and Vite on it, PGlite only in the test runner, one user, open auth, no CORS or origin guards), the layout as it is on staging, the docs-anchor rule (pin an ancestor that exists, anchor files that exist there), the E2E note (CI runs it only on PRs into main, run it locally against a staging baseline), the frontend rule (never hand-roll UI, assemble from `@magnis/host/ui`), the type rule (hand-written interfaces, zod decodes into them, one camelCase spelling across a boundary), and the pointer to `docs/graph.md`. `AGENTS.md` is ten lines: read `CLAUDE.md`, the Codex entry points.

### The vocabulary page: Magnis `docs/graph.md` (Magnis plan)

Today: the page exists on the `feat/graph-reading-pipeline` branch, unpushed, with the hypothesis in the owner's words and a table "word, what it names, where the code spells it"; nothing links to it and no check reads it. Done: no second page. `docs/graph.md` lands with that plan or ahead of it, `CLAUDE.md` links it, the judge and the New names table check plan names against its table, and documentation reachability (below) is counted from it and from `CLAUDE.md`.

### Project rules, skills, agents and hooks: Magnis `.claude/` and `.agents/` (Magnis plan)

Today: six path-scoped rule files of which four describe Rust or paths that no longer exist; fifteen repo copies of skills and nine Codex copies with different bodies under the same names; three cops; twelve hooks plus three inline, one for cargo; a `permissions.yml` nobody reads. Done: rules become `testing.md`, `logging.md` and two three-line files (backend types; never hand-roll UI); every repo skill copy is deleted, the global ones serve; the cops stay, trimmed; the cargo hook and the inline prettier hook go, the `focus` hook and the CI-only checks (`check:rename`, the client-react typecheck) join the pre-push; `permissions.yml` is deleted.

### The process pages: Magnis `docs/` (Magnis plan)

Today: nine pages, 1 311 lines, copies of the laws that drifted (a legacy Task format nobody generates, four planctl commands missing, a scorecard that does not exist). Done: `development-process.md` and `plan-format.md` become copies of the two laws; `plan-protocol.md`, `git-workflow.md`, `codex-permissions.md`, `worktree-e2e-setup.md` and `testing/worktree-manual-testing.md` are deleted or folded into `CLAUDE.md`; `testing/policy.md` and the `docs/README.md` map stay.

### The product pages: Magnis `docs/` (Magnis plan)

Today: 77 current pages, 14 653 lines, sixty with anchor debt, the largest 1 964 lines; thirteen more already marked historical or superseded lie beside the live ones (`rust-rules.md`, `sqlite-gotchas.md`, `postgres-only-plan.md`, `cutover-status-2026-05-27.md` and nine others). Done: the thirteen move to `docs/archive/`; every current page gets one question, "is this still true on staging?", answered by reading the code it anchors; a page stays current only if it is reachable within two links from `docs/graph.md` or `CLAUDE.md`, otherwise it is archived; the docs gate counts reachability.

### Plans and research: Magnis `docs/plans`, `docs/research` (Magnis plan)

Today: 107 plan files, 71 014 lines, and 59 research files, 5 077 lines; the docs gate anchors many of them and agents read merged plans to learn the design. Done: the ledger `docs/plans/README.md` stays the authority; a merged plan is frozen history and moves to `docs/plans/archive/` at end-work; the law says in one line that a merged plan is never a source of the current design; research stays where it is and is never loaded.

### Memory: `~/.claude/projects/…/memory` and the neighbour directory

Today: 93 files plus 16 twins, 56 of them lessons the agent recalls by chance. Done, by hand on the owner's word after the Magnis plan: twenty-two lessons are written once into the files above (register M names each), ten files remain, two consolidated references on host and bun traps, three project pointers, the two runtime blockers until PR #12 merges, and the index.

## Invariants

- `one-home`: no sentence of twelve or more words appears in two instruction files.
- `no-dead-reference`: every path, script and skill an instruction names exists.
- `size`: the always-loaded set plus the two laws and four process skills is at most 900 lines.
- `no-jargon`: the instruction files contain none of the banned words (lane, receipt as a noun for a test result, stand, farm, envelope, ceremony, doctrine, census, plane, currency).
- `language-by-file`: a language guide is named only in a rule that routes by file extension.
- `free-tier`: a Task with five writes, a story naming none of them and a commit touching one more file is accepted and recorded (PR #12).
- `focus-at-start`: a session opened in a worktree with a plan gets the brief from the SessionStart hook, on startup, resume and after a compaction; `planctl focus --brief` prints the plan, the open Stage, the started Task, the next commands and the tiers in at most twelve lines, in under two seconds.
- `three-tiers-stated`: the process law names the three tiers and the owner's word appears only in the third.
- `boxes-are-commands`: plan-gate refuses a plan whose acceptance box is neither `` `cmd` exits N `` nor `Commit`.
- `strict-skeleton`: plan-gate refuses a plan missing a block of the skeleton.
- `types-shown`: plan-gate refuses a SPEC that adds or changes `.ts` sources and shows no TypeScript.
- `judge-before-owner`: `lock-spec` refuses a SPEC whose hash carries no PASS from `plan-gate --judge`; every answer carries a quote; the rubric file is the only prompt.
- `retro-has-a-status`: end-work refuses closure while the previous Delivery's experiment line has no status.
- `retro-reports-currencies`: an end-work retro without the three numbers is refused by the same check.

The first five are one script, `shared/code-production/instruction-audit.ts`, run by `agent:verify:docs` in 0_agents and red today. The plan-gate and end-work checks are red today too.

## Not in this plan

- Everything marked "Magnis plan" above is the next plan in magnis-app; it starts when this PR and PR #12 are merged.
- The memory cleanup is done by hand on the owner's word after that plan; it lives outside any repository.
- The S/M/L size loop with git-measured facts and an optimism ratio at end-work is its own later plan.
- Cyrus skills are deleted, not migrated; Cyrus does not run Magnis.
- `content-os` and other consumers of 0_agents get the same skills through `update.sh`; their project files are not touched.
<!-- plan:spec:end -->

<!-- plan:implementation:start -->
## Implementation contract
<!-- plan:implementation:end -->

<!-- plan:execution:start -->
## Execution log

- lock-spec sha256:bb924d3815e01b33ebe830a95a94189d2b2c45bed38997ed5154108fd74f5a26 owner:SPEC is APPROVED let's go for stages
<!-- plan:execution:end -->
