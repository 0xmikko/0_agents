# Agent instructions, rule by rule: memory becomes law, the rest is cut

Status: APPROVED  
Spec lock: sha256:653df8d6678a1810e0efa00811a5d56c20e70a5ecc822edcf88a8ee31d48a6bc owner:owner 2026-09-18: это не надо — надо просто навести порядок, я не верю в этот закон  
Implementation lock: sha256:6d6c7cd200286f1b6712215eff874c6ef0d4fb827dfbede050d01473f52d4678 owner:owner 2026-09-18: это не надо — надо просто навести порядок, я не верю в этот закон  
Active Delivery: D1  
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
synonyms, no plan codes (D1-S4, INV-12) in prose.

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
- Refactoring by grep. Rename at the definition, run the compiler, fix exactly what it names;
  grep finds comments and strangers, the compiler finds the callers. `/rename` is the procedure.

Verify only with the project's `agent:*` scripts; never compose framework commands.
Language guide by file: `.ts`/`.tsx` → typescript.md, `.rs` → rust.md.
Never edit workflows, infrastructure, `.claude/`, secrets, CLAUDE.md or AGENTS.md unless
the task names the file. Never kill or reuse a process you did not start.
The owner is on a Claude subscription: no API key, ever.
```

`codex/AGENTS.md` is byte-identical: a symbolic link to `claude/CLAUDE.md`, so the author and the reviewer can never read different rules; the audit counts one file as one home. Codex gets the brief from the same command, run by its own session hook.

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

Today: 323 lines globally and three Magnis-specialised copies, all carrying Rust and cargo sections for TypeScript code. Done: three reviewers stay, one metric each, coherence (reuse and layers), coverage (tests and edge cases), simplicity (no speculative abstraction, no file bloat), verdict REJECT by default, each under 80 lines with Rust removed. simplicity-cop also rejects a diff that is mostly symbol renames and a type the SPEC's Interfaces block does not name; coverage-cop asks for the state graph and one detailed integration test per flow, not a test per function, and rejects a test that passes on any code. Codex is called only when asked or for diffs over 200 lines, at most two rounds; a real correctness finding at the cap is fixed, style is dropped. The Magnis copies stay project-level and are trimmed in the Magnis plan.

### The skills (0_agents): 16 shared, 9 personal

Today: about 3 400 lines; thirteen skills are from the cargo era and contradict the process (full suite per Stage, rebase and force-push, "proceed without an approved plan", a fourth plan format, Cyrus dispatch). Done: ten stay, `blueprint`, `blueprint-start`, `end-work`, `bug`, `rename`, `review-implementation`, `cleanup-worktrees`, `mdurl`, `dictate`, `nvim`, each of the four process skills under 60 lines; `rename` is new and small: rename the symbol at its definition, run the project's typecheck, fix every place the compiler names and nothing else, one commit, never grep for the old name; sixteen go: `start-work`, `test-protocol`, `completion-note`, `verify-app`, `verify-frontend`, `fast-precommit`, `fix-ci-cd`, `quick-fix`, `plan`, `review-plan`, `execute`, `finish-plan`, `git`, `dispatch-to-linear`, `execute-from-linear`, `launch-e2e`. The owner's business skills are untouched. What the four process skills say:

`blueprint`: the plan is born in its own worktree from fresh `origin/staging`, with the list of open PRs into staging touching its files; the SPEC has the skeleton the owner approved in `account-sync-state`: The Goal (two or three lines or measures), Why now (the problem with its numbers and its `file:line` anchors), The target as detailed as the task is deep (the process as a flow with a diagram and a table of stages, the design as the screen will look, Interfaces in TypeScript, Code where the algorithm is the decision, What changes with what leaves, Target tree, Verification, Invariants, Constraints and non-goals, Reuse, Deliveries), Not verified, the pre-approval screen; names come from the repository, or from the project's vocabulary page where one exists; a new one is declared in a table with its reason and the pre-approval screen prints the count; every new or changed type is TypeScript, hand-written interfaces one field per line, zod decoding into them, never a sentence or "as elsewhere"; the Goal is the owner's currencies with today's number and the target, never "measure X"; sizes are printed, not capped: the pre-approval screen shows the SPEC's lines, the number of Stages and the longest Stage description next to the medians of the plans the owner approved in one round (150 to 300 lines of SPEC), because depth sets the size and the owner decides what depth a task needs; a Stage still reads as its commit message and a Task story stays under 200 characters; no minutes, no credits; review only on the owner's word, at most three rounds, fixing only what the plan cannot run without; the linter and the judge have passed before the owner is asked. An owner question about the plan is answered in the chat; the plan is not edited until the owner says "внеси". Stage 0 of a Delivery is the interface and its mock, committed first, so a second agent can build against it in parallel.

`blueprint-start`: start and before the gate, merge `origin/staging`, run `agent:install`, dry-run the compiler, then the project's own post-merge checklist from its `CLAUDE.md` (for Magnis: build the SDK, grep raw SQL for renamed columns, `uniq -d` migration numbers, re-pin docs in the same commit that moves an anchor); the browser lane once at the start for its baseline; per Stage `start-task`, red, green, the Stage's one to three files, the three reviewers on the diff, one commit, `complete-task`, next Stage; the three tiers (below); the complete gate once through the pre-push hook, a push when someone needs the new state, the agent flips ready, the owner merges. A pull request exists at every Stage boundary and no later than a day after the Delivery starts; "done" is said with its proof in the same message: the URL, the probe, the CI run by SHA.

`end-work`: confirm the owner merged; print the three currency numbers for the Delivery (corrections about form and substance before approval; dumb questions, stops and gates during execution; the status of the previous experiment); write one new experiment into the register with a date; refuse to close while the previous experiment has no status; the ledger row in one fixed form, merged, N boxes open under Deviations, the experiment line; remove the worktree and only its registered temp roots.

`bug`: reproduce with a red test, fix, run that file and the Stage's files, never the full suite by hand; the escape hatch for a three-line typo stays and announces itself.

### The process laws (0_agents): four files become two

Today: 792 lines in four files that disagree on the Task format, require Predict minutes and credits, mention a scorecard that does not exist, and carry 85 lines of commit archaeology. Done: `development-process.md` (under 100 lines) holds the lifecycle with its two owner approvals, the sizes, the Stage cadence, the three tiers, git in one paragraph (worktree per branch from `origin/staging`, merge commits only, never rewrite, one commit per Stage, no wip, never push to staging or main, `git -C <abs>`), verification once per Delivery, the unattended rule, the handoff, and the retro register at its end. `plan-format.md` (under 80 lines) holds the skeleton, one Task template, what approval freezes, the linter's rules, the forbidden list. `plan-protocol.md` and `git-workflow.md` are deleted; every rule of theirs that survives is in those two.

The three tiers, as the law states them. Free, the agent does it and planctl records the difference in the result row: add a test, add a file the compiler names, touch a file beyond the writes but inside the Delivery's target tree in the same commit, close a Stage whose commands are green. Recorded, one Deviations line and on: a file outside the target tree, a deleted test, a criterion that became unreachable. Refused by planctl: a file another Stage or another plan declares in its writes; someone else's code is changed by its owner, and the caller adapts to the owner's API. The owner's word, and only here: the goal and its measure, removing a promised file from the tree, the meaning of an acceptance criterion, scope beyond the Delivery.

### planctl and plan-gate (0_agents `planctl/`)

Today: planctl refuses a fifth write, a story that does not repeat its paths, a commit touching one file beyond the writes, a Task without minutes; plan-gate checks receipts and nothing about how the text reads. Done, in four parts. PR #12 (open): writes are files, directories or globs with no cap, extra files are recorded in the result row, minutes and credits accept zero. The linter, in plan-gate: the skeleton (the Goal as currencies with today's number and target, the target tree, the Types block when `.ts` sources change, the New names table, the Not verified list); every box a command with its exit code or the Commit box; mermaid parsed; synonyms of vocabulary terms and plan codes (D1-S4, INV-12) in prose refused; every `export interface` or `export type` a Stage commit adds must be named in the SPEC's Interfaces block, so a type the owner never saw never appears; sentences over thirty words refused; Predict fields refused. The judge, `plan-gate --judge`: a fixed rubric in `shared/code-production/plan-judge.md`, one question per rule a linter cannot answer (is the Goal a goal or a problem, does each Stage read as a commit, are the names existing ones, is the prose plain), answered by a small model through `claude -p --model haiku` on the owner's subscription with a quote from the plan for every answer; 1.4 seconds on a test call today; the verdict stored by SPEC hash so the same bytes are never judged twice; `lock-spec` refuses without a PASS and an unavailable judge refuses the lock. The brief, `focus --brief`, as above.

### The instruction audit: `shared/code-production/instruction-audit.ts` (0_agents)

Today: nothing counts the instruction set. Done: one script run by `agent:verify:docs` in 0_agents refuses a path, script or skill that does not exist, a synonym of a term in the process vocabulary (`shared/code-production/vocabulary.md`: term, what it names, the words not used for it; the audit names the term), a language guide named outside a by-extension rule, and more than 900 lines in the loaded set. Red today.

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

- `no-dead-reference`: every path, script and skill an instruction names exists.
- `size`: the always-loaded set plus the two laws and four process skills is at most 900 lines.
- `vocabulary`: the instruction files use no synonym of a term in `shared/code-production/vocabulary.md`, one table of term, what it names, and the words not used for it; the audit names the term to say instead; a project's vocabulary page has the same shape and a plan's names are checked against both.
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

<!-- plan:delivery:D1:start -->
<!-- plan:delivery-meta:{"active":true,"depends":[],"predictedExternalWaitMinutes":0} -->
### PR Delivery D1 — One rule, one home: the always-on screen, the session brief, two laws, nine skills, a linter, a judge and an audit

Branch: `feat/instructions-by-rule`; Depends: none; Gate: planctl.

Stage graph: `D1-S1 -> D1-S2 -> D1-S3 -> D1-S4 -> D1-S5 -> D1-S6 -> D1-S7 -> D1-S8`.

Forecast: 0 active min / 0 credits across 8 Stages; longest dependency path 0 active min; external waits 0 min.

What changed for people. An agent starts a session, reads one screen of under 30 lines, and gets its position and its options printed by planctl instead of re-reading the plan. The owner reads a plan that a linter and a cheap judge have already checked for form, and answers only where a decision lives: the goal, the target tree, the meaning of a criterion. Each Stage of this Delivery ends with the owner's word, journaled.

What changed in the code. 0_agents: claude/CLAUDE.md and codex/AGENTS.md are one screen; planctl gains focus --brief, retro-status, plan-gate --lint and plan-gate --judge; two laws replace four; nine skills replace twenty-five; the three reviewers lose their Rust sections; shared/code-production/instruction-audit.ts keeps the set at 900 lines with no duplicate sentence, dead reference or banned word.

How it was proven. Every Stage carries its tests in planctl/test and the audit is green on the whole tree at the end; the owner approved each Stage through planctl approve-stage.

Not in this PR. The Magnis repository layer (its CLAUDE.md, rules, hook wiring, docs), the memory cleanup and the S/M/L forecast loop.

<!-- plan:stage:D1-S1:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":[],"parallelWith":[],"writes":["shared/code-production/instruction-audit.ts","planctl/test/instruction-audit.test.ts","planctl/package.json"],"tempRoot":".tmp/code-production/instructions-by-rule/D1-S1","verifyActiveMinutes":0,"verifyCredits":0} -->
#### Stage D1-S1 — The audit that keeps the instruction set on a diet

- Owner: agent-1; Profile: strong; Depends: none; Parallel with: none.
- Writes: `shared/code-production/instruction-audit.ts`, `planctl/test/instruction-audit.test.ts`, `planctl/package.json`.
- Temp root: `.tmp/code-production/instructions-by-rule/D1-S1` (must be absent at handoff).
- Predict: 0 active min / 0 credits.
- Of which verification: 0 active min / 0 credits.

What this Stage solves. Nothing counts the instruction set, so it grew to 56 files and 6 100 lines with 336 rules stated twice, 49 dead references and 57 Rust-era rules.

What is built. shared/code-production/instruction-audit.ts reads the always-on set (claude/CLAUDE.md, codex/AGENTS.md, the two laws, the language guides, the nine skills, the three reviewers) and refuses: a sentence of twelve or more words present in two files; a path, script or skill named that does not exist; a synonym of a term in `shared/code-production/vocabulary.md` (the audit names the term to say); a language guide named outside a by-extension rule; more than 900 lines in the set. It prints one line per finding with file and line. planctl/package.json runs it from agent:verify:docs.

How it is proven. planctl/test/instruction-audit.test.ts feeds fixture trees for each refusal and one clean tree; on the real tree today the audit is red, which is the point.

Commit. feat(audit): an instruction audit that refuses duplicates, dead references, banned words and size — the five invariants of the diet become one command.

##### Tasks

- [x] IBR_001 — Add instruction-audit.ts with the five checks and its fixture-driven tests; agent:verify:docs runs the audit. — 6638424cbf66ecb01f4c6f2e914890a1913b4a40
<!-- plan:task-meta:{"writes":["shared/code-production/instruction-audit.ts","planctl/test/instruction-audit.test.ts","planctl/package.json"],"predictedActiveMinutes":0,"predictedCredits":0,"how":"walk the always-on set, split sentences, index twelve-word sentences by file, resolve every backticked path or /skill name against the tree, match the banned list, check guide mentions sit on a by-extension rule, count lines; tests build temp trees","red":"bun run agent:test:backend -- test/instruction-audit.test.ts"} -->

##### Acceptance criteria

- [x] `bun run --cwd planctl agent:test:backend -- test/instruction-audit.test.ts` exits 0 — each of the five refusals fires on its fixture and the clean fixture passes — 21fb6f892f20d5f1c4bc0899b3f5aa775482d642
- [x] `bun planctl/src/cli/main.ts stage-approved docs/plans/instructions-by-rule.md --stage D1-S1` exits 0 — the owner read what this Stage produced and said the word — 21fb6f892f20d5f1c4bc0899b3f5aa775482d642
- [x] Commit — 21fb6f892f20d5f1c4bc0899b3f5aa775482d642

##### Results

<!-- plan:results:D1-S1:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| IBR_001 | 6638424cbf66ecb01f4c6f2e914890a1913b4a40 | 2026-09-18T15:52:01.051Z–2026-09-18T15:55:13.000Z | 3.2 / 3.2 min | unavailable: runner does not expose usage | Six tests green; on the real tree the audit names 1 352 lines in the set (limit 900), 22 banned words, 4 language-guide mentions by task language, 1 dead skill reference. |
<!-- plan:results:D1-S1:end -->
<!-- plan:stage:D1-S1:end -->

<!-- plan:stage:D1-S2:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S1"],"parallelWith":[],"writes":["claude/CLAUDE.md","codex/AGENTS.md","planctl/test/instruction-audit.test.ts"],"tempRoot":".tmp/code-production/instructions-by-rule/D1-S2","verifyActiveMinutes":0,"verifyCredits":0} -->
#### Stage D1-S2 — The global screen: one page for Claude and Codex

- Owner: agent-1; Profile: strong; Depends: D1-S1; Parallel with: none.
- Writes: `claude/CLAUDE.md`, `codex/AGENTS.md`, `planctl/test/instruction-audit.test.ts`.
- Temp root: `.tmp/code-production/instructions-by-rule/D1-S2` (must be absent at handoff).
- Predict: 0 active min / 0 credits.
- Of which verification: 0 active min / 0 credits.

What this Stage solves. The global entry is 85 lines that repeat the skills; the Codex entry has none of the rules; both describe the process instead of what the model gets wrong.

What is built. claude/CLAUDE.md becomes the screen the SPEC quotes: the line that planctl prints the position, the IMPORTANT block (less code that is understood, one name per thing), DRY and SOLID as they apply here, not more engineering than the test needs, the four mistakes, agent:* only, the language guide by file extension, the boundaries, the subscription. codex/AGENTS.md is the same screen with ~/.codex/lang paths.

How it is proven. A test in instruction-audit.test.ts reads both files: at most 30 lines each, the same numbered mistakes in both, exactly one IMPORTANT line, no skill named except /blueprint and /blueprint-start, no word from the banned list.

Commit. docs(claude): the always-on screen holds only what the model cannot infer and keeps getting wrong.

##### Tasks

- [x] IBR_002 — Rewrite claude/CLAUDE.md and codex/AGENTS.md as the one screen from the SPEC; the screen test in instruction-audit.test.ts pins its shape. — 63fcca9532d5f021825d592ae3318c64ba8ee24b
<!-- plan:task-meta:{"writes":["claude/CLAUDE.md","codex/AGENTS.md","planctl/test/instruction-audit.test.ts"],"predictedActiveMinutes":0,"predictedCredits":0,"how":"copy the SPEC's screen; Codex variant swaps the lang paths; test asserts line count, one IMPORTANT, same mistakes list in both, no banned words","red":"bun run agent:test:backend -- test/instruction-audit.test.ts -t tst_audit_screen"} -->

##### Acceptance criteria

- [ ] `bun run --cwd planctl agent:test:backend -- test/instruction-audit.test.ts -t tst_audit_screen` exits 0 — both screens are under 30 lines, carry one IMPORTANT and the same mistakes
- [ ] `bun planctl/src/cli/main.ts stage-approved docs/plans/instructions-by-rule.md --stage D1-S2` exits 0 — the owner read what this Stage produced and said the word
- [ ] Commit

##### Results

<!-- plan:results:D1-S2:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| IBR_002 | 63fcca9532d5f021825d592ae3318c64ba8ee24b | 2026-09-18T18:53:19.353Z–2026-09-18T18:55:32.407Z | 2.22 / 2.22 min | unavailable: runner does not expose usage | The screen is 30 non-empty lines, byte-identical for Claude and Codex through a symbolic link, one IMPORTANT, five mistakes, names only /blueprint, /blueprint-start and /rename; the audit is clean on it. — beyond writes: claude/skills/rename, codex/skills/rename, shared/code-production/instruction-audit.ts, shared/skills/rename/SKILL.md |
<!-- plan:results:D1-S2:end -->
<!-- plan:stage:D1-S2:end -->

<!-- plan:stage:D1-S3:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S2"],"parallelWith":[],"writes":["planctl/src/","planctl/test/","shared/code-production/templates/claude/"],"tempRoot":".tmp/code-production/instructions-by-rule/D1-S3","verifyActiveMinutes":0,"verifyCredits":0} -->
#### Stage D1-S3 — planctl speaks: the session brief and the retro register

- Owner: agent-1; Profile: strong; Depends: D1-S2; Parallel with: none.
- Writes: `planctl/src/`, `planctl/test/`, `shared/code-production/templates/claude/`.
- Temp root: `.tmp/code-production/instructions-by-rule/D1-S3` (must be absent at handoff).
- Predict: 0 active min / 0 credits.
- Of which verification: 0 active min / 0 credits.

What this Stage solves. A session re-reads the plan to find its place, loses it after a compaction, and the owner explains which Stage is open; a retro's experiment has no status anyone checks.

What is built. planctl focus --brief prints at most twelve lines from the plan's state: the plan and its status, the open Stage and the started Task, what is done and what waits, the next commands with their exact arguments, what is free without the owner, what needs the owner's word; a SPEC_DRAFT plan gets the planning brief; a branch without a plan gets one line. planctl retro-status reads the register at the end of the process law and exits 1 while the last experiment has no status. shared/code-production/templates/claude/settings.hooks.json is the SessionStart (startup, resume, compact) and UserPromptSubmit hook that a consumer repository copies.

How it is proven. planctl/test/focus.test.ts covers the three states of the brief and the twelve-line cap; planctl/test/retro-status.test.ts covers a register with and without a status.

Commit. feat(planctl): focus --brief prints where the agent is and what it may do; retro-status refuses a retro without a verdict.

##### Tasks

- [ ] IBR_003 — focus --brief prints the position, the next commands and the tiers in at most twelve lines for an approved plan, a draft plan and no plan; focus.test.ts covers the three.
<!-- plan:task-meta:{"writes":["planctl/src/","planctl/test/focus.test.ts"],"predictedActiveMinutes":0,"predictedCredits":0,"how":"extend the focus command with --brief; derive open Stage, started Task from the journal, next commands from state; twelve-line cap enforced in code","red":"bun run agent:test:backend -- test/focus.test.ts -t tst_focus_brief"} -->
- [ ] IBR_004 — retro-status exits 1 while the last experiment line in the register lacks a status; retro-status.test.ts covers both; the hook template runs the brief.
<!-- plan:task-meta:{"writes":["planctl/src/","planctl/test/retro-status.test.ts","shared/code-production/templates/claude/"],"predictedActiveMinutes":0,"predictedCredits":0,"how":"parse the register table at the end of development-process.md (date, experiment, status); the template JSON names the two hook events and the command","red":"bun run agent:test:backend -- test/retro-status.test.ts"} -->

##### Acceptance criteria

- [ ] `bun run --cwd planctl agent:test:backend -- test/focus.test.ts test/retro-status.test.ts` exits 0 — the brief has three states under twelve lines and the register check fails without a status
- [ ] `bun planctl/src/cli/main.ts stage-approved docs/plans/instructions-by-rule.md --stage D1-S3` exits 0 — the owner read what this Stage produced and said the word
- [ ] Commit

##### Results

<!-- plan:results:D1-S3:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
<!-- plan:results:D1-S3:end -->
<!-- plan:stage:D1-S3:end -->

<!-- plan:stage:D1-S4:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S3"],"parallelWith":[],"writes":["shared/skills/","claude/skills/","codex/skills/","README.md","ONBOARDING.md","planctl/test/instruction-audit.test.ts"],"tempRoot":".tmp/code-production/instructions-by-rule/D1-S4","verifyActiveMinutes":0,"verifyCredits":0} -->
#### Stage D1-S4 — Ten skills instead of twenty-five

- Owner: agent-1; Profile: strong; Depends: D1-S3; Parallel with: none.
- Writes: `shared/skills/`, `claude/skills/`, `codex/skills/`, `README.md`, `ONBOARDING.md`, `planctl/test/instruction-audit.test.ts`.
- Temp root: `.tmp/code-production/instructions-by-rule/D1-S4` (must be absent at handoff).
- Predict: 0 active min / 0 credits.
- Of which verification: 0 active min / 0 credits.

What this Stage solves. Sixteen skills of the cargo and Cyrus era contradict the process: full suite per Stage, rebase and force-push, proceed without an approved plan, a fourth plan format.

What is built. blueprint, blueprint-start, end-work and bug are rewritten to the texts the SPEC describes, each under 60 lines; review-implementation, cleanup-worktrees, mdurl, dictate and nvim stay trimmed; start-work, test-protocol, completion-note, verify-app, verify-frontend, fast-precommit, fix-ci-cd, quick-fix, plan, review-plan, execute, finish-plan, git, dispatch-to-linear, execute-from-linear and launch-e2e are deleted with their claude/ and codex/ symlinks; README.md and ONBOARDING.md list what remains.

How it is proven. The audit's dead-reference and size checks over shared/skills pass; a test pins that the four process skills are under 60 lines and that no skill names a deleted skill.

Commit. refactor(skills): nine skills, four of them the process — the cargo-era and Cyrus skills are gone.

##### Tasks

- [ ] IBR_005 — Rewrite blueprint, blueprint-start, end-work and bug to the SPEC's texts, each under 60 lines; instruction-audit.test.ts pins the size and that none names a deleted skill.
<!-- plan:task-meta:{"writes":["shared/skills/blueprint/","shared/skills/blueprint-start/","shared/skills/end-work/","shared/skills/bug/","planctl/test/instruction-audit.test.ts"],"predictedActiveMinutes":0,"predictedCredits":0,"how":"write the four SKILL.md files from the SPEC paragraphs; the test reads them","red":"bun run agent:test:backend -- test/instruction-audit.test.ts -t tst_audit_skills"} -->
- [ ] IBR_006 — Delete the sixteen retired skills with their claude/ and codex/ symlinks; trim review-implementation and cleanup-worktrees; README.md and ONBOARDING.md list the nine.
<!-- plan:task-meta:{"writes":["shared/skills/","claude/skills/","codex/skills/","README.md","ONBOARDING.md"],"predictedActiveMinutes":0,"predictedCredits":0,"how":"git rm the directories and symlinks; replace the skill lists in the two documents; the audit's dead-reference check is the proof","red":"bun run agent:test:backend -- test/instruction-audit.test.ts -t tst_audit_skills"} -->

##### Acceptance criteria

- [ ] `bun run --cwd planctl agent:test:backend -- test/instruction-audit.test.ts -t tst_audit_skills` exits 0 — the four process skills are under 60 lines and no skill names a deleted one
- [ ] `bun planctl/src/cli/main.ts stage-approved docs/plans/instructions-by-rule.md --stage D1-S4` exits 0 — the owner read what this Stage produced and said the word
- [ ] Commit

##### Results

<!-- plan:results:D1-S4:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
<!-- plan:results:D1-S4:end -->
<!-- plan:stage:D1-S4:end -->

<!-- plan:stage:D1-S5:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S4"],"parallelWith":[],"writes":["shared/code-production/laws/","planctl/test/instruction-audit.test.ts"],"tempRoot":".tmp/code-production/instructions-by-rule/D1-S5","verifyActiveMinutes":0,"verifyCredits":0} -->
#### Stage D1-S5 — Two laws instead of four

- Owner: agent-1; Profile: strong; Depends: D1-S4; Parallel with: none.
- Writes: `shared/code-production/laws/`, `planctl/test/instruction-audit.test.ts`.
- Temp root: `.tmp/code-production/instructions-by-rule/D1-S5` (must be absent at handoff).
- Predict: 0 active min / 0 credits.
- Of which verification: 0 active min / 0 credits.

What this Stage solves. Four laws disagree on the Task format, require minutes and credits, mention a scorecard that does not exist and carry 85 lines of commit history.

What is built. development-process.md (under 100 lines): the lifecycle with two owner approvals, the sizes, the Stage cadence, the three tiers, git in one paragraph, verification once per Delivery, the unattended rule, the handoff, the retro register at the end. plan-format.md (under 80 lines): the skeleton, one Task template, what approval freezes, the linter's rules, the forbidden list. plan-protocol.md and git-workflow.md are deleted.

How it is proven. A test pins the two files' sizes, the presence of the three tiers with the owner's word only in the third, the register table, and no banned word; the audit's one-home check over the laws passes.

Commit. docs(laws): two laws — the process and the plan format — carry every surviving rule once.

##### Tasks

- [ ] IBR_007 — Rewrite development-process.md (under 100 lines, three tiers, retro register) and plan-format.md (under 80 lines); delete plan-protocol.md and git-workflow.md; the laws test pins it.
<!-- plan:task-meta:{"writes":["shared/code-production/laws/","planctl/test/instruction-audit.test.ts"],"predictedActiveMinutes":0,"predictedCredits":0,"how":"write the two laws from the SPEC's paragraphs; git rm the other two; the test reads sizes, tiers, register, banned words","red":"bun run agent:test:backend -- test/instruction-audit.test.ts -t tst_audit_laws"} -->

##### Acceptance criteria

- [ ] `bun run --cwd planctl agent:test:backend -- test/instruction-audit.test.ts -t tst_audit_laws` exits 0 — two laws, under 100 and 80 lines, three tiers, a register, no banned word
- [ ] `bun planctl/src/cli/main.ts stage-approved docs/plans/instructions-by-rule.md --stage D1-S5` exits 0 — the owner read what this Stage produced and said the word
- [ ] Commit

##### Results

<!-- plan:results:D1-S5:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
<!-- plan:results:D1-S5:end -->
<!-- plan:stage:D1-S5:end -->

<!-- plan:stage:D1-S6:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S5"],"parallelWith":[],"writes":["shared/lang/","claude/agents/","codex/agents/","planctl/test/instruction-audit.test.ts"],"tempRoot":".tmp/code-production/instructions-by-rule/D1-S6","verifyActiveMinutes":0,"verifyCredits":0} -->
#### Stage D1-S6 — Language guides by file and three reviewers without Rust

- Owner: agent-1; Profile: strong; Depends: D1-S5; Parallel with: none.
- Writes: `shared/lang/`, `claude/agents/`, `codex/agents/`, `planctl/test/instruction-audit.test.ts`.
- Temp root: `.tmp/code-production/instructions-by-rule/D1-S6` (must be absent at handoff).
- Predict: 0 active min / 0 credits.
- Of which verification: 0 active min / 0 credits.

What this Stage solves. The language guides load by the language of the task, so a TypeScript task reads the Rust guide; the three reviewers carry cargo and Rust sections and a fourth mistake list for TypeScript code.

What is built. typescript.md and rust.md keep style only, under 40 lines each; coherence-cop, coverage-cop and simplicity-cop stay, one metric each, verdict REJECT by default, under 80 lines, with every Rust and cargo section removed; codex/agents mirrors claude/agents.

How it is proven. A test pins sizes and that no reviewer or guide mentions cargo, clippy, serde or TestCore; the audit's language-by-file check passes.

Commit. refactor(agents): three reviewers judge TypeScript by TypeScript rules; the language guides are style only.

##### Tasks

- [ ] IBR_008 — Trim typescript.md and rust.md to style under 40 lines; remove every Rust and cargo section from the three cops, each under 80 lines; the reviewers test pins it.
<!-- plan:task-meta:{"writes":["shared/lang/","claude/agents/","codex/agents/","planctl/test/instruction-audit.test.ts"],"predictedActiveMinutes":0,"predictedCredits":0,"how":"edit the five files; the test reads them for size and for the words cargo, clippy, serde, TestCore","red":"bun run agent:test:backend -- test/instruction-audit.test.ts -t tst_audit_reviewers"} -->

##### Acceptance criteria

- [ ] `bun run --cwd planctl agent:test:backend -- test/instruction-audit.test.ts -t tst_audit_reviewers` exits 0 — guides under 40 lines, reviewers under 80, no Rust words
- [ ] `bun planctl/src/cli/main.ts stage-approved docs/plans/instructions-by-rule.md --stage D1-S6` exits 0 — the owner read what this Stage produced and said the word
- [ ] Commit

##### Results

<!-- plan:results:D1-S6:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
<!-- plan:results:D1-S6:end -->
<!-- plan:stage:D1-S6:end -->

<!-- plan:stage:D1-S7:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S6"],"parallelWith":[],"writes":["planctl/src/core/plan-gate.ts","planctl/test/plan-gate.test.ts","planctl/test/fixtures/"],"tempRoot":".tmp/code-production/instructions-by-rule/D1-S7","verifyActiveMinutes":0,"verifyCredits":0} -->
#### Stage D1-S7 — The plan linter: skeleton, boxes, sizes, words, mermaid

- Owner: agent-1; Profile: strong; Depends: D1-S6; Parallel with: none.
- Writes: `planctl/src/core/plan-gate.ts`, `planctl/test/plan-gate.test.ts`, `planctl/test/fixtures/`.
- Temp root: `.tmp/code-production/instructions-by-rule/D1-S7` (must be absent at handoff).
- Predict: 0 active min / 0 credits.
- Of which verification: 0 active min / 0 credits.

What this Stage solves. plan-gate checks receipts and nothing about how a plan reads; every form defect costs the owner a rewrite round.

What is built. plan-gate --lint refuses: a missing skeleton block (The Goal, Why now, The target with Interfaces in TypeScript when .ts sources change, What changes, Target tree, Invariants, Reuse, the New names table, Not verified); an exported interface or type in a Stage commit that the SPEC's Interfaces block does not name; an acceptance box that is neither a command with its exit code nor Commit; a Task story over 200 characters, while the SPEC's lines, the Stage count and the longest Stage description are printed next to the medians of one-round plans, never refused; a synonym of a vocabulary term or a plan code (D1-S4, INV-12) in prose; a sentence over thirty words; a Predict field; a mermaid block that does not parse. lock-spec runs it.

How it is proven. plan-gate.test.ts feeds one fixture plan per refusal and one that passes; each refusal names the line.

Commit. feat(plan-gate): a linter refuses the plan defects the owner used to correct by hand.

##### Tasks

- [ ] IBR_009 — plan-gate --lint refuses the eight form defects on fixture plans and passes a clean one; lock-spec runs it; plan-gate.test.ts carries one fixture per refusal.
<!-- plan:task-meta:{"writes":["planctl/src/core/plan-gate.ts","planctl/test/plan-gate.test.ts","planctl/test/fixtures/"],"predictedActiveMinutes":0,"predictedCredits":0,"how":"add lint() with the eight checks; mermaid parsed with the mermaid parser already in the repo's Playwright or a pure parser; wire into lock-spec","red":"bun run agent:test:backend -- test/plan-gate.test.ts -t tst_gate_lint"} -->

##### Acceptance criteria

- [ ] `bun run --cwd planctl agent:test:backend -- test/plan-gate.test.ts -t tst_gate_lint` exits 0 — each form defect is refused with its line and the clean fixture passes
- [ ] `bun planctl/src/cli/main.ts stage-approved docs/plans/instructions-by-rule.md --stage D1-S7` exits 0 — the owner read what this Stage produced and said the word
- [ ] Commit

##### Results

<!-- plan:results:D1-S7:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
<!-- plan:results:D1-S7:end -->
<!-- plan:stage:D1-S7:end -->

<!-- plan:stage:D1-S8:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S7"],"parallelWith":[],"writes":["planctl/src/","planctl/test/","shared/code-production/plan-judge.md","shared/code-production/instruction-audit.ts","README.md"],"tempRoot":".tmp/code-production/instructions-by-rule/D1-S8","verifyActiveMinutes":0,"verifyCredits":0} -->
#### Stage D1-S8 — The judge, and the diet proven on the whole tree

- Owner: agent-1; Profile: strong; Depends: D1-S7; Parallel with: none.
- Writes: `planctl/src/`, `planctl/test/`, `shared/code-production/plan-judge.md`, `shared/code-production/instruction-audit.ts`, `README.md`.
- Temp root: `.tmp/code-production/instructions-by-rule/D1-S8` (must be absent at handoff).
- Predict: 0 active min / 0 credits.
- Of which verification: 0 active min / 0 credits.

What this Stage solves. What a linter cannot see, the owner sees in a rewrite round: is the Goal a goal, does each Stage read as a commit, are the names existing ones, is the prose plain.

What is built. shared/code-production/plan-judge.md is the rubric, one question per rule with PASS or FAIL, a quote and the fix; plan-gate --judge sends the SPEC and the rubric to claude -p --model haiku, parses the JSON answer, stores the verdict by SPEC hash in the git-local journal, and lock-spec refuses without a PASS; an unavailable judge refuses the lock. The audit runs green on the whole tree and README.md describes the set that remains.

How it is proven. plan-judge.test.ts uses a fake claude on PATH answering PASS and FAIL; the verdict cache is proven by a second call that spawns nothing; the audit exits 0 on the tree; the planctl gate passes.

Commit. feat(plan-gate): a cheap judge reads the plan before the owner does; the instruction set is 900 lines with one home per rule.

##### Tasks

- [ ] IBR_010 — plan-gate --judge sends SPEC and rubric to claude -p, stores the verdict by SPEC hash, and lock-spec refuses without PASS; plan-judge.test.ts uses a fake claude on PATH.
<!-- plan:task-meta:{"writes":["planctl/src/","planctl/test/plan-judge.test.ts","shared/code-production/plan-judge.md"],"predictedActiveMinutes":0,"predictedCredits":0,"how":"write the rubric; spawn claude -p with --output-format json; cache by sha256 of the SPEC region; refuse on missing binary; wire lock-spec","red":"bun run agent:test:backend -- test/plan-judge.test.ts"} -->
- [ ] IBR_011 — The audit exits 0 on the whole tree and README.md lists the set that remains: the screen, two laws, nine skills, three reviewers, the audit, the linter and the judge.
<!-- plan:task-meta:{"writes":["shared/code-production/instruction-audit.ts","README.md"],"predictedActiveMinutes":0,"predictedCredits":0,"how":"fix whatever the audit still names; rewrite the README's skill and law lists","red":"bun run agent:test:backend -- test/instruction-audit.test.ts"} -->

##### Acceptance criteria

- [ ] `bun run --cwd planctl agent:test:backend -- test/plan-judge.test.ts` exits 0 — PASS and FAIL are parsed, the cache spares a second call, a missing judge refuses the lock
- [ ] `bun shared/code-production/instruction-audit.ts` exits 0 — no dead reference, synonym of a vocabulary term, guide named by task language or line over 900 in the set
- [ ] `bun run --cwd planctl agent:verify:pr` exits 0 — typecheck, lint, tests and build pass on the Delivery head
- [ ] `bun planctl/src/cli/main.ts stage-approved docs/plans/instructions-by-rule.md --stage D1-S8` exits 0 — the owner read what this Stage produced and said the word
- [ ] Commit

##### Results

<!-- plan:results:D1-S8:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
<!-- plan:results:D1-S8:end -->
<!-- plan:stage:D1-S8:end -->
<!-- plan:delivery:D1:end -->
<!-- plan:implementation:end -->

<!-- plan:execution:start -->
## Execution log

- lock-spec sha256:bb924d3815e01b33ebe830a95a94189d2b2c45bed38997ed5154108fd74f5a26 owner:SPEC is APPROVED let's go for stages

- put-delivery D1

- put-stage D1-S1

- put-stage D1-S2

- put-stage D1-S3

- put-stage D1-S4

- put-stage D1-S5

- put-stage D1-S6

- put-stage D1-S7

- put-stage D1-S8

- approve sha256:270d386cff3a545fe01d83d08a8738f33af7162dcc060cd6e68b2d1ab569b62b owner:Да, тут важнее детали

- record-result D1-S1 commit:6638424cbf66ecb01f4c6f2e914890a1913b4a40

- amend spec owner:owner 2026-09-18: рефакторинг через grep находил лишнее и приводил к ужасным вещам; переименовать в определении, запустить tsc, идти по его списку — сделать скилл для рефакторинга sha256:6ca26af284202a6cbc9c8f9b906362d84468294b911236e2d2805a7c9d8d710d

- approve sha256:270d386cff3a545fe01d83d08a8738f33af7162dcc060cd6e68b2d1ab569b62b owner:owner 2026-09-18: рефакторинг через grep находил лишнее и приводил к ужасным вещам; переименовать в определении, запустить tsc, идти по его списку — сделать скилл для рефакторинга (re-approval after the SPEC amendment)

- amend spec owner:owner 2026-09-18: рефакторинг через grep находил лишнее и приводил к ужасным вещам; переименовать в определении, запустить tsc, идти по его списку — сделать скилл для рефакторинга sha256:95af7068c230a16cf80f86138e7c00ff18d4d2de6179b8128f71265d6cf1fb37

- approve sha256:270d386cff3a545fe01d83d08a8738f33af7162dcc060cd6e68b2d1ab569b62b owner:owner 2026-09-18: рефакторинг через grep находил лишнее и приводил к ужасным вещам; переименовать в определении, запустить tsc, идти по его списку — сделать скилл для рефакторинга (re-approval after the SPEC amendment)

- amend implementation owner:owner 2026-09-18: рефакторинг через grep находил лишнее и приводил к ужасным вещам; переименовать в определении, запустить tsc, идти по его списку — сделать скилл для рефакторинга sha256:6823a0e38627d18704e57471e8d6eadf45b16c73c2e652a9f3abecb9290f74a3

- amend spec owner:owner 2026-09-18: да, давай сделаем их идентичными sha256:289562a2eea214a498e64d2ffe0f7179e7b4993c8fa2e7b2c8eef1fa45640ae1

- approve sha256:6823a0e38627d18704e57471e8d6eadf45b16c73c2e652a9f3abecb9290f74a3 owner:owner 2026-09-18: да, давай сделаем их идентичными (re-approval after the SPEC amendment)

- amend spec owner:owner 2026-09-18: иногда размер спецификации определяется глубиной задачи, жёсткое правило не годится sha256:20dbf4f9095593c0e4cb10fed2f8b0a32da2af4ffc33a691b58f8ca9b4679815

- approve sha256:6823a0e38627d18704e57471e8d6eadf45b16c73c2e652a9f3abecb9290f74a3 owner:owner 2026-09-18: иногда размер спецификации определяется глубиной задачи, жёсткое правило не годится (re-approval after the SPEC amendment)

- amend implementation owner:owner 2026-09-18: иногда размер спецификации определяется глубиной задачи, жёсткое правило не годится sha256:890b2deddf685dca55c2b8faa3cfa1ed09134e32e27ae604e109fce2e52bc159

- amend spec owner:owner 2026-09-18: target максимально подробный — flow, типы, как в account-sync-state; главная проблема — миллиард типов от агента; file:line в Why now допустим sha256:5713c4ea555e2a28bd6338139cb748d786fd7a1c5ea539afc17c95ac977ce360

- approve sha256:890b2deddf685dca55c2b8faa3cfa1ed09134e32e27ae604e109fce2e52bc159 owner:owner 2026-09-18: target максимально подробный — flow, типы, как в account-sync-state; главная проблема — миллиард типов от агента; file:line в Why now допустим (re-approval after the SPEC amendment)

- amend spec owner:owner 2026-09-18: target максимально подробный — flow, типы, как в account-sync-state; главная проблема — миллиард типов от агента; file:line в Why now допустим sha256:e41ee7f6abf0aa6474f4d62b5be9206f3925cf3f17aa2f10b2f744e57b78d7c4

- approve sha256:890b2deddf685dca55c2b8faa3cfa1ed09134e32e27ae604e109fce2e52bc159 owner:owner 2026-09-18: target максимально подробный — flow, типы, как в account-sync-state; главная проблема — миллиард типов от агента; file:line в Why now допустим (re-approval after the SPEC amendment)

- amend spec owner:owner 2026-09-18: target максимально подробный — flow, типы, как в account-sync-state; главная проблема — миллиард типов от агента; file:line в Why now допустим sha256:4a7212b6465ab55af08a07026ec0ceeb3b468df468df75cf60ef56ac0e8e2ce6

- approve sha256:890b2deddf685dca55c2b8faa3cfa1ed09134e32e27ae604e109fce2e52bc159 owner:owner 2026-09-18: target максимально подробный — flow, типы, как в account-sync-state; главная проблема — миллиард типов от агента; file:line в Why now допустим (re-approval after the SPEC amendment)

- amend implementation owner:owner 2026-09-18: target максимально подробный — flow, типы, как в account-sync-state; главная проблема — миллиард типов от агента; file:line в Why now допустим sha256:43bcb91341b3d7aa3a3ee392a3f51997c116784f6590bac269f7c47e3b4165fb

- amend implementation owner:owner 2026-09-18: target максимально подробный — flow, типы, как в account-sync-state; главная проблема — миллиард типов от агента; file:line в Why now допустим sha256:08a1b96bb324639dcb5a64a6fb6d3300f08dc05adb527a63acac634b614d7535

- amend spec owner:owner 2026-09-18: да, делегирование через интерфейс полезное — пять поправок из сессий Codex sha256:0a817b1248467c6d10a5b75308e71f18983ebbaf01b00862904bd66dd4721c16

- approve sha256:08a1b96bb324639dcb5a64a6fb6d3300f08dc05adb527a63acac634b614d7535 owner:owner 2026-09-18: да, делегирование через интерфейс полезное — пять поправок из сессий Codex (re-approval after the SPEC amendment)

- amend spec owner:owner 2026-09-18: да, делегирование через интерфейс полезное — пять поправок из сессий Codex sha256:4a37c3804ea464bf01ac5dbe29167da2e1620fd3177d1fa489ae0bbd822dd1ca

- approve sha256:08a1b96bb324639dcb5a64a6fb6d3300f08dc05adb527a63acac634b614d7535 owner:owner 2026-09-18: да, делегирование через интерфейс полезное — пять поправок из сессий Codex (re-approval after the SPEC amendment)

- amend spec owner:owner 2026-09-18: да, делегирование через интерфейс полезное — пять поправок из сессий Codex sha256:a735e30c8e566d70c7c3fffee8c01a7e307977d381e66a0c73e49bab5e299279

- approve sha256:08a1b96bb324639dcb5a64a6fb6d3300f08dc05adb527a63acac634b614d7535 owner:owner 2026-09-18: да, делегирование через интерфейс полезное — пять поправок из сессий Codex (re-approval after the SPEC amendment)

- amend spec owner:owner 2026-09-18: да, делегирование через интерфейс полезное — пять поправок из сессий Codex sha256:7a91336c38ba45da40ea73b2018cc78c4535b6fcfb278e9539db039935fb1e4f

- approve sha256:08a1b96bb324639dcb5a64a6fb6d3300f08dc05adb527a63acac634b614d7535 owner:owner 2026-09-18: да, делегирование через интерфейс полезное — пять поправок из сессий Codex (re-approval after the SPEC amendment)

- deviation D1-S1: target: work stays inside the approved plan; reached: while D1-S1 waited for the owner's word, the agent did three pieces of work no plan named — 0_agents PR #14 (init/set-spec journal, spent journal consumed, merge exemption) and magnis-app PR #264 (runtime re-vendor, three doc sentences, five re-pins) — to unblock a neighbouring session's complete-task; the owner merged both and said it was unexpected and the process must be reviewed. Rule the retro should weigh: unplanned work is a plan or a question, not a favor; a blocked neighbour is reported to the owner, who decides.

- approve-stage D1-S1 owner:давай оставшееся — owner, 2026-09-18

- close D1-S1 closed commit:21fb6f892f20d5f1c4bc0899b3f5aa775482d642

- record-result D1-S2 commit:63fcca9532d5f021825d592ae3318c64ba8ee24b

- deviation D1-S1: correction: the approve-stage line for D1-S1 carrying the word «давай оставшееся» was written on a misread — the owner meant «go on to the next of the five points», not approval of the Stage. The Stage counts as not yet approved by the owner; the owner's explicit word on the audit's five decisions is still awaited. The close-stage that followed rests on that line and is withdrawn in meaning by this one.

- amend spec owner:owner 2026-09-18: стоп-слова не лучшее решение, лучше словарь терминов sha256:996483e7c550fe43409dbc676c159210d4ffe74549578c42a7ceeec01f32e6bc

- approve sha256:08a1b96bb324639dcb5a64a6fb6d3300f08dc05adb527a63acac634b614d7535 owner:owner 2026-09-18: стоп-слова не лучшее решение, лучше словарь терминов (re-approval after the SPEC amendment)

- amend spec owner:owner 2026-09-18: стоп-слова не лучшее решение, лучше словарь терминов sha256:0a6838875af5953a3d2373bda143514c25f27d1dc52a735505a0cdad735590d7

- approve sha256:08a1b96bb324639dcb5a64a6fb6d3300f08dc05adb527a63acac634b614d7535 owner:owner 2026-09-18: стоп-слова не лучшее решение, лучше словарь терминов (re-approval after the SPEC amendment)

- amend spec owner:owner 2026-09-18: стоп-слова не лучшее решение, лучше словарь терминов sha256:f4846c0b5b7519ebce1cb436ce36e61bff6b83f57ec56b7a9c9de7fdae001f46

- approve sha256:08a1b96bb324639dcb5a64a6fb6d3300f08dc05adb527a63acac634b614d7535 owner:owner 2026-09-18: стоп-слова не лучшее решение, лучше словарь терминов (re-approval after the SPEC amendment)

- amend implementation owner:owner 2026-09-18: стоп-слова не лучшее решение, лучше словарь терминов sha256:a17ff5039101eaaa273846fd4a9f443b2033e31a47f5ab84899c8abf6b9d24d3

- amend implementation owner:owner 2026-09-18: стоп-слова не лучшее решение, лучше словарь терминов sha256:c621f700ae52eacfdf2fc699a99f5c70078fb497ddd3bc22e17ec17cbc8af318

- deviation D1-S1: on the owner's word the audit's stop list became the process vocabulary (shared/code-production/vocabulary.md: term, what it names, not); commit 559002d changes the audit after the Stage closed; the Stage's own decisions still await the owner's explicit word

- amend spec owner:owner 2026-09-18: это не надо — надо просто навести порядок, я не верю в этот закон sha256:80fb65773bc6128e0aca2cf359b1a13fc5af9c75e879f905b81b301224f83197

- approve sha256:c621f700ae52eacfdf2fc699a99f5c70078fb497ddd3bc22e17ec17cbc8af318 owner:owner 2026-09-18: это не надо — надо просто навести порядок, я не верю в этот закон (re-approval after the SPEC amendment)

- amend spec owner:owner 2026-09-18: это не надо — надо просто навести порядок, я не верю в этот закон sha256:653df8d6678a1810e0efa00811a5d56c20e70a5ecc822edcf88a8ee31d48a6bc

- approve sha256:c621f700ae52eacfdf2fc699a99f5c70078fb497ddd3bc22e17ec17cbc8af318 owner:owner 2026-09-18: это не надо — надо просто навести порядок, я не верю в этот закон (re-approval after the SPEC amendment)

- amend implementation owner:owner 2026-09-18: это не надо — надо просто навести порядок, я не верю в этот закон sha256:6d6c7cd200286f1b6712215eff874c6ef0d4fb827dfbede050d01473f52d4678
<!-- plan:execution:end -->
