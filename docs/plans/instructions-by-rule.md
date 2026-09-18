# Agent instructions, rule by rule: memory becomes law, the rest is cut

Status: SPEC_DRAFT  
Spec lock: unlocked  
Implementation lock: unlocked  
Active Delivery: none  
Unattended decisions: allowed  

<!-- plan:spec:start -->
## The Goal

Three stages of the workflow, one currency each. Everything below is the decomposition from a currency to a file.

| Stage | Currency | Today | Goal |
|---|---|---|---|
| **1 Planning** | The owner's planning time that is useful. Useful: brainstorming, understanding details, deciding. Waste: demanding rewrites, fixing broken mermaid, stages written as file lists, new words, goals written as problems, text too long to read. | 218 corrections in four weeks; 151 of them form (jargon 44, invented words 37, scope bloat 34, stage as a file list 22, goal as a problem 22, too long 19) and about 70 substance; one SPEC took 10 review rounds and 53 commits | corrections about form: 0; substance rounds ≤ 3; a SPEC the owner reads in one sitting (≤ 250 lines) |
| **2 Execution** | Dumb questions to the owner when the work stepped a little off the plan, and their cousins: stops at a tool refusal, boxes the owner closes by hand, full gates bought to see. | 25 "да" for writes lists in one plan; 12 "продолжай" in 9 plans; 60 % of 377 Deviations lines are bookkeeping; 49 open boxes at the last end-work, 24 of them prose; 3–10 full gates per Delivery | dumb questions: 0; stops at a refusal: 0; prose boxes: 0; one local gate and one CI per Delivery |
| **3 Retro** | Process changes a retro produces. | 9 experiments since 25.08, 0 adopted; the scorecard disappeared with PR #227; the same red-CI round trip (`check:rename`) repeated | every end-work carries the previous experiment with a status (accepted or declined) and one new one; a metric the retro reports is one the owner named here |

Code quality has no stage of its own: it is what stage 2 produces when the four code rules are always on and the three reviewers read the same law the author did. It is seen as defects found at integration (7 in one Delivery today) and second copies of a mechanism merged (6 plans today), both to zero.

## Decisions, from currency to file

Each decision names the mechanism (why it moves the currency), what changes, and how the movement will be seen.

**Stage 1 — Planning**

| Decision | Mechanism | What changes | Seen as |
|---|---|---|---|
| One vocabulary per project | 37 "ты снова выдумал": a plan invents a name, the code and docs carry it forever, and the next agent invents a synonym. The SDK contracts already name every entity the product has; a page says what the project is, its key ideas, and how things are written (dates, ids, wire spelling). A plan uses those names or declares a new one in a table. | the always-on rule about the repository's own words; the vocabulary-page rule: the project keeps one vocabulary page linked from its `CLAUDE.md` (Magnis: `docs/project.md`, names anchored to `@magnis/sdk`, notation agreed once); blueprint prints the count of new names on the pre-approval screen | new names per plan ≤ 5, each with its table; "ты снова выдумал": 0 |
| The goal in the owner's currencies | The skill's own "good goal" example is a measurement goal the owner rejected on 09-09; agents copy examples. | the goal rule; the examples replaced | "это не цель, это проблема": 0 |
| Small plans in one format | Plans the owner approved in one round were ≤ 1 000 lines; 3 000-line plans took 10 rounds and 42 Stages. Three Task formats across laws and copies, a fourth in the `plan` skill; the agent mixes them. | the size rule (SPEC ≤ 250, Delivery ≤ 8 Stages, Stage ≤ 40 lines, Task ≤ 200 chars); plan-gate counts; `plan` skill and `plan-protocol.md` deleted, one template | substance rounds ≤ 3; plan commits before approval ≤ 10; formats: 1 |
| Fresh base and open PRs before the lock | S1 of #258 was thrown away because staging already carried the mechanism; 7 "fresh staging" corrections. | the fresh-base rule | mechanisms replaced at integration: 0 |
| What breaks the owner's reading is checked by a linter | Broken mermaid, `file.ts:123` and task codes in prose, banned words, minutes and credits, a missing block: each costs a rewrite round that decides nothing. A linter sees all of it without reading for meaning. | plan-format defines a strict skeleton (headings in order; the currencies table; the target tree; the Types block; the New names table; the Not verified list); plan-gate refuses a plan missing a block, parses mermaid, refuses banned words and code references in prose, sentences over 30 words, Predict fields; the no-minutes rule | corrections about form: 0 |
| Review only on the owner's word, three rounds, fixes only what blocks | 53 plan commits and 10 rounds on one SPEC; "ты зачем всё переделывать стал". | the review-rounds rule; `review-plan` skill deleted | rounds ≤ 3 |
| A cheap judge reads the plan before the owner does | What a linter cannot see, the owner sees in a rewrite round: is the Goal a goal or a problem, does each Stage read as a commit, are the names existing ones, is the prose plain. A small model answers a fixed rubric in seconds (`claude -p --model haiku` on the owner's subscription: 1.4 s and about two cents for a test call today), quoting the plan for every answer. Not an agent, not a review round: a gate. | `plan-gate --judge`: the rubric is a versioned file `shared/code-production/plan-judge.md` (one question per the goal rule; the vocabulary-page rule; the types rule; the boxes-are-commands rule; the pre-approval screen rule and the plain-prose rule, answer PASS or FAIL with a quote and the fix); the verdict is stored by SPEC hash so unchanged bytes are never judged twice; `lock-spec` and the pre-approval screen refuse without a PASS; the judge rule | substance rounds ≤ 3; corrections about form: 0 |
| Types are shown, not described | The owner decides on types; an agent that writes "the shape as in the SDK" or a sentence instead of an interface hides the decision, and the owner asks for it in a rewrite round. A type that does not exist yet is the one thing prose cannot carry. | the types rule: every new or changed type appears in the SPEC as TypeScript, hand-written interfaces one field per line, zod decoding into them; the pre-approval screen has a Types block; plan-gate refuses a SPEC that adds or changes `.ts` sources and shows no TypeScript | rewrite rounds for missing types: 0 |
| The pre-approval screen is what the owner reads | Every steering correction across three branches was one of: the file tree, the stories, what is not verified. | the pre-approval screen rule kept; adds the new-names count and the "not verified" list that replaces prose boxes | — |

**Stage 2 — Execution**

| Decision | Mechanism | What changes | Seen as |
|---|---|---|---|
| Three tiers of freedom | Dumb questions come from machine refusals, not decisions: writes lists, receipts, docs re-pins. Let the machine record instead of refuse; keep the owner's word for the goal, the tree, the meaning of a criterion. | PR #12; the three-tiers rule; the always-on rule that a tool refusal is not a question | "да" on mechanics 25 → 0; "продолжай" 12 → 0; bookkeeping Deviations → 0 |
| Boxes are commands | 24 prose boxes at the last end-work can never be ticked by a machine, so the owner is asked to close them by hand. | the boxes-are-commands rule; plan-gate refuses a prose box; the "not verified" list takes its place | prose boxes: 0 |
| One gate per Delivery | Each extra full run is 25–50 minutes and a flake; #244 bought 10, #248 bought 4. The pre-push hook already writes the receipt. | the push rule; the verification rule; the browser-baseline rule (browser baseline at the start) | gates: 1 local + 1 CI |
| The post-merge checklist | Raw SQL with old columns, colliding migration numbers, moved docs anchors, CI-only gates (`check:rename`): each is a red push and a re-pin commit; 34–39 re-pin commits. | the post-merge checklist; Magnis follow-up: pre-push runs the CI-only checks (the commands rule) | red CI pushes per Delivery ≤ 1; re-pin follow-up commits: 0 |
| One law for author and reviewers | A reviewer with a different rule set flags different things and misses what the author was told; `codex/AGENTS.md` has none of the six rules, Codex carries its own skill copies; the cops carry Rust sections for TS code. | `AGENTS.md` = the six rules; one law set in `shared/`; three cops kept, each one metric, ≤ 80 lines, Rust removed; the two reviewer rules | defects found at integration: 0; findings contradicting a rule: 0 |
| Four code rules always on | Verify on the artifact, no fallbacks, extend the existing, red first with mutation proof: 28 owner corrections, each in memory, none in the file the agent reads at start. | the four code rules in `claude/CLAUDE.md` | second copies merged: 0 |
| Nothing contradictory, nothing dead | A model given "run cargo test" and "run bun test", "rebase" and "never rebase", "full suite per stage" and "once per Delivery" picks one at random; 59 contradictions, 49 dead references, 57 Rust-era rules. | 16 skills and 2 laws deleted; the language guides load by file extension; `instruction-audit` refuses dead references and duplicates; 56 files → 14, ≤ 900 lines | contradictions and dead references: 0, checked |
| Memory becomes law | A lesson in memory is recalled by chance: "no test asserts a deleted file" was in memory and violated 26 days later. | register M: 22 lessons written once where the agent reads them, marked "memories" in their Today column below; 93 + 16 memory files → 10 | repeated corrections: 0 |

**Stage 3 — Retro**

| Decision | Mechanism | What changes | Seen as |
|---|---|---|---|
| The retro reports the owner's currencies | A retro that reports minutes and credits reports what nobody measures; the three currencies above are what the owner reads. | `end-work` prints, per Delivery: owner corrections about form and about substance before approval; dumb questions, stops and gates during execution; and the status of the previous experiment. Minutes and credits leave. | every retro carries the three numbers |
| One experiment, with a status | 9 experiments since 25.08, none adopted; the same round trip repeated. | the retro register rule: the experiment goes into a register at the end of the process law; the next `end-work` refuses to close a Delivery while the previous experiment has no status; an accepted one becomes a rule in the same PR | adopted or declined: 9 of 9 |
| A partial close is honest | "Partial close, ledger cannot be closed from here" three times this week, each time worded differently. | the ledger row says: merged, N boxes open under Deviations, the experiment line | — |

## What changes, file by file (0_agents)

| File | Holds | Lines | Serves |
|---|---|---:|---|
| `claude/CLAUDE.md` = `~/.claude/CLAUDE.md` | six always-on rules, routing by file, boundaries | ≤ 30 | four code rules always on; nothing contradictory, nothing dead; one vocabulary per project |
| `codex/AGENTS.md` | the same six rules, Codex paths | ≤ 12 | one law for author and reviewers |
| `shared/lang/typescript.md`, `shared/lang/rust.md` | language style only | ≤ 40 each | nothing contradictory, nothing dead |
| `laws/development-process.md` | lifecycle, sizes, cadence, three tiers, git, verification once, unattended, handoff, the retro register | ≤ 100 | three tiers of freedom; one gate per Delivery; small plans in one format; fresh base before the lock; one experiment with a status; the post-merge checklist |
| `laws/plan-format.md` | sections, one template, what approval freezes, plan-gate mechanics, forbidden | ≤ 80 | small plans in one format; boxes are commands; a linter with a strict skeleton |
| `shared/code-production/package-contract.md` | the `agent:*` script API | as is | — |
| skills `blueprint`, `blueprint-start`, `end-work`, `bug` | the four moments of the process; `end-work` carries the retro format: the three currencies, one experiment with a status, an honest partial close | ≤ 60 each | the goal in the owner's currencies; small plans in one format; review on the owner's word; the retro reports the currencies |
| skills `cleanup-worktrees`, `mdurl`, `dictate`, `nvim`, `review-implementation` | utilities, the review driver | trimmed | one law for author and reviewers |
| agents `coherence-cop`, `coverage-cop`, `simplicity-cop` | three reviewers | ≤ 80 each | one law for author and reviewers |
| skills `startup-pressure-test`, `icp-pain`, `investor` | business | untouched | — |
| `shared/code-production/instruction-audit.ts` | the machine that keeps the diet | new | nothing contradictory, nothing dead; a linter with a strict skeleton |
| `shared/code-production/plan-judge.md`, `planctl/src/core/plan-judge.ts` | the rubric and the call: `plan-gate --judge` | new | a cheap judge before the owner |

Removed: skills `start-work`, `test-protocol`, `completion-note`, `verify-app`, `verify-frontend`, `fast-precommit`, `fix-ci-cd`, `quick-fix`, `plan`, `review-plan`, `execute`, `finish-plan`, `git`, `dispatch-to-linear`, `execute-from-linear`, `launch-e2e`; laws `plan-protocol.md`, `git-workflow.md`. Their surviving rules are in the tables below with their new home.

## The rules as they will read

"Today" counts the files that state the rule now (registers A, B, C in `docs/research/instruction-registers/`).

**Always on — `claude/CLAUDE.md`**

| # | Rule | Today | Serves |
|---|---|---|---|
| 1 | A claim about code is checked on the artifact it names: run it, open it, `git show origin/staging:<path>`, run the compiler. Never from structure, grep, a colleague's report or a tree behind staging. | 0 files, 8 memories | four code rules always on |
| 2 | No fallbacks, defaults, safety nets or "just in case" code the owner did not ask for. A missing value stays missing and surfaces as an error. | 5 files | four code rules always on |
| 3 | Find the existing mechanism and extend it; a second copy is a defect. Delete what the change makes unnecessary in the same commit. | 3 files + 9 corrections | four code rules always on |
| 4 | The test comes first and is red for the behavior, not for syntax or environment. A test green from birth is proven by mutating the source and watching only it fail. | 11 files + 3 memories | four code rules always on |
| 5 | A tool refusal is not a question for the owner: record one line and continue. Every stop ends with "waiting for: X" or "continuing". "Impossible" needs an author: an owner decision, a documented invariant, an external contract. | 10 files + 5 memories | three tiers of freedom |
| 6 | Write in the repository's own words. A new name comes with a table "why the existing one is not enough". No task codes, invariant numbers or `file.ts:123` in prose; a report to the owner is sentences, not test ids. | 1 file + 4 memories | one vocabulary per project |

Plus: read the project file; a language guide loads for files of that language; the boundaries (workflows, infrastructure, `.claude/`, secrets, `CLAUDE.md`/`AGENTS.md` only when the task names them); never kill or reuse processes you did not start; the owner is on a Claude subscription, not the API.

**How a plan is written — `blueprint` + `plan-format.md`**

| # | Rule | Today | Serves |
|---|---|---|---|
| 7 | The Goal is the owner's currencies with today's number and the target, never "measure X". | example in 2 files is a measurement goal | the goal in the owner's currencies |
| 8 | Before `lock-spec`: fresh `origin/staging`, and the open PRs into staging that touch the SPEC's files, recorded in the SPEC. | 0 files, 7 corrections | fresh base before the lock |
| 8a | The plan's names come from the project's vocabulary page or its SDK; a new name is declared in a table with the reason the existing one is not enough; the pre-approval screen prints how many. | 0 files; the Magnis page is the follow-up plan | one vocabulary per project |
| 9a | Every new or changed type is in the SPEC as TypeScript: hand-written interfaces, one field per line, zod decodes into them, never `z.infer` for a domain type, never a sentence or "as in the SDK". Things that are not types (a command line, a file) get no interface. | 1 file says "interfaces in TypeScript rather than prose"; 1 memory (owner 2026-09-09); the check does not exist | types shown, not described |
| 9 | Sizes the gate counts: SPEC ≤ 250 lines; a Delivery ≤ 8 Stages; a Stage description ≤ 40 lines and reads as the future commit message; a Task story ≤ 200 characters. More work is the next Delivery. | 0 files | small plans in one format |
| 10 | A Task's writes are files, directories or globs, as many as the change needs; the story does not repeat them. | 4 files say "four writes" | three tiers of freedom |
| 11 | No minutes and no credits in a plan. Size is files and lines a Stage touches; the fact comes from git at end-work. Mermaid is parsed, and banned words, task codes and `file.ts:123` in prose are refused, before the plan is shown. | 12 rules in 6 files; 2 mermaid parse bombs in one week | a linter with a strict skeleton |
| 12 | Every new file or mechanism names what it replaces or extends; the Reuse map holds the greps. | 2 files | four code rules always on |
| 13 | Review of a plan runs only on the owner's word, at most three rounds, and fixes only what the plan cannot run without; the rest is listed as declined. | caps 2 and 3 in 3 files | review on the owner's word |
| 14 | Read each acceptance command against the tree the plan builds; a command only this machine can pass is prose with its number. | 2 files + 4 memories | boxes are commands |
| 15 | A plan judged by a model-run metric first publishes the band of the unchanged product and counts an effect only when every block clears it. | 3 memories | memory becomes law |
| 16 | Forbidden, as today: opening with the problem, DEC lists, tests asserting layout or a deleted file, inventory pins, self-declared approval, boxes mirroring CI or PR state. | 2 files | — |
| 16a | A box is a command with its exit code or the Commit box. What a machine cannot check goes to the pre-approval screen under "not verified". | 0 files | boxes are commands |
| 17a | Before the owner is asked, `plan-gate --judge` has said PASS on these exact bytes: a fixed rubric answered by a small model with a quote for every answer; a FAIL names the sentence and the fix. `lock-spec` refuses without it. The judge is unavailable → the lock is refused, not skipped. | 0 files; no LLM reads a plan today | a cheap judge before the owner |
| 17 | The pre-approval screen is the last block and the one the owner reads: file tree, acceptance stories in plain words, the count of new names, what is not verified and why. | 2 files | the pre-approval screen |

**How a plan is executed — `blueprint-start` + `development-process.md`**

| # | Rule | Today | Serves |
|---|---|---|---|
| 18 | Three tiers. Free: add a test, add a file the compiler names, touch a file beyond the writes in the same commit, close a Stage whose commands are green; planctl records the difference. Recorded: a new file outside the target tree, a deleted test, a criterion that became unreachable — one Deviations line and on. Owner's word: the goal and its measure, removing a promised file, the meaning of a criterion, scope beyond the Delivery. | 0 files | three tiers of freedom |
| 19 | Start and before the gate: merge `origin/staging`, install root and backend, build the SDK, dry-run the compiler, grep raw SQL for renamed columns, `uniq -d` migration numbers, re-pin docs in the same commit that moves an anchor. | 2 files partial + 2 memories | the post-merge checklist |
| 20 | Stage cadence, as today: `start-task`, RED, GREEN, the Stage's one to three named test files, micro-review with the three cops, one commit, `complete-task`, next Stage. | 6 files | one law for author and reviewers |
| 21 | The browser lane runs once at the start of a Delivery for its baseline, not at the end. | 0 files | one gate per Delivery |
| 22 | A parallel Stage agent returns one commit and a typed result; it never edits the plan. | 2 files | — |
| 23 | Unattended: decide the smallest reversible thing, record it, continue; stop only for data loss, security or destruction of unmerged work. | 4 files + 2 skills | three tiers of freedom |

**Git and publication — `development-process.md` §Git**

| # | Rule | Today | Serves |
|---|---|---|---|
| 24 | All work in a `.worktrees/<slug>` worktree on `feat\|fix\|refactor\|chore/<slug>` from `origin/staging`; one agent, one worktree, one branch; `git -C <abs>` for every writing git command. | 4 files + 1 memory | nothing contradictory, nothing dead |
| 25 | Merge commits only; never rebase, amend, force-push or squash; never `cp` or `git checkout <branch> -- <path>` between trees. | 7 files, contradicted by `fix-ci-cd` | nothing contradictory, nothing dead |
| 26 | One work commit per Stage, Conventional subject, body says why. No wip commits in a plan run. | 5 files, contradicted by `git` and `start-work` | nothing contradictory, nothing dead |
| 27 | A push buys a CI matrix: push when someone needs the new state. The pre-push hook is the gate, run once, and writes the receipt; nobody runs `agent:verify:pr` by hand first. A plan document is pushed on the owner's word. The agent flips ready, the owner merges. Never push to staging or main. | 12 files for "never push", 0 for "when" + 9 memories | one gate per Delivery |
| 28 | Everything on GitHub is English and product-framed and links only to GitHub URLs; documents for the owner go through `mdurl`, never cloud artifacts. | 0 files + 4 memories | memory becomes law |
| 29 | Handoff is `[PR #N — title](url)`, the plan `mdurl`, the head SHA, what is not verified. After the merge: `end-work`, retro, ledger. | 4 files | — |
| 29a | A retro names one experiment. `end-work` writes it into the register at the end of the process law with a date; the next `end-work` refuses to close a Delivery while the previous experiment has no status (accepted or declined, on the owner's word). A partial close says so in the ledger: merged, N boxes open under Deviations. | 0 files | one experiment with a status |

**Verification and tests — `development-process.md` §Verification**

| # | Rule | Today | Serves |
|---|---|---|---|
| 30 | Inner loop: the exact `bun run agent:test:<lane> -- <file>`; Stage: its one to three files; Delivery: the complete gate once through the pre-push hook; CI repeats it on the published SHA; review reuses the receipt. | 7 files, contradicted by 5 skills | one gate per Delivery |
| 31 | A red CI run: read the log, reproduce with the exact command, fix one failure class per push; a failure that is on the base is named to the owner, not fixed silently. | `fix-ci-cd`, 220 lines of cargo | nothing contradictory, nothing dead |
| 32 | Never skip, weaken or ignore a test to get green; a failing test is a root cause to find. | 4 files | — |

**Review — three cops + `review-implementation`**

| # | Rule | Today | Serves |
|---|---|---|---|
| 33 | Three reviewers, three metrics, in parallel: coherence (reuse and layers), coverage (tests and edge cases), simplicity (no speculative abstraction, no file bloat). Default verdict REJECT. | 3 files × 2 copies with Rust inside | one law for author and reviewers |
| 34 | Codex review only when asked or for diffs over 200 lines; at most two rounds; a real correctness finding at the cap is fixed, style is dropped. | caps 2 vs 3; "Task tool" | one law for author and reviewers |

**Repository facts — the Magnis `CLAUDE.md` (next plan)**

| # | Rule | Today | Serves |
|---|---|---|---|
| 35 | Commands as they exist: `db:up`, `dev`, `backend:dev`, scoped `bun test`, `check:backend`, `docs:check`, `test:e2e`; planctl only as `bun .agents/code-production/runtime/planctl.ts`; `git reset -q` after a refused commit; pre-push runs `check:rename` and the client-react typecheck. | `dev:web` (gone), `MAGNIS_DB_MODE` (retired), bare `planctl` | the post-merge checklist |
| 36 | Dev stand: `db:up` prints `DATABASE_URL` (embedded PG 16, `--docker` for multi-user), `dev` runs backend and Vite on it; PGlite only in the test runner; one user, open auth, no CORS or origin guards. | wrong in CLAUDE.md, right in 4 memories | memory becomes law |
| 37 | docs:check resolves anchors at `verified_against`: pin an ancestor that exists, anchor files that exist there. | 1 memory | memory becomes law |
| 38 | Domain types are hand-written interfaces, zod decodes into them; one camelCase spelling across a boundary; never hand-roll UI, assemble from `@magnis/host/ui`. | 2 memories; rules files describe serde and `.rs` | memory becomes law |
| 39 | E2E runs in CI only on PRs into main; run it locally against a staging baseline. | 1 memory + 5 waivers | memory becomes law |

## Today, the raw counts

Measured on 0_agents `7cbc4a5` and magnis-app `dc396a3ee` (2026-09-17).

| What | Number |
|---|---:|
| Instruction files an agent may load in a Magnis session | 56 |
| Lines in them | ≈ 6 100 |
| Rules extracted (registers A, B, C) | 974 |
| Rules stated in two or more files | 92 (global and skills) + 219 (laws and copies) + 25 (repo copies of global rules) |
| Rows flagged as contradicting another rule | 54 + 1 + 4 |
| Rows stale or naming something that does not exist | 14 + 5 + 30 |
| Rust-era rules in a TypeScript project | 57 |
| Task formats across laws and copies | 3 |
| Memory files (magnis-app + twin directory) | 93 + 16 |
| Owner corrections 19.08–15.09 (retro) | 218, none became a rule |
| Owner "да" answers for writes-list edits in one plan | 25 |
| Deviations lines that are planctl bookkeeping, not decisions | ≈ 60 % of 377 |
| agent-delegation end-work, 2026-09-17 | 49 open boxes: 24 prose, the rest behind `complete-task`; retro experiment 9 of 9 without a status |
| Skills last substantively changed | 2026-08-30 |

What already works and stays: the push hook, the draft-without-matrix rule, the ready guard, the pre-approval screen, the three cops, micro-review, `mdurl`.

## Invariants

1. `one-home`: no sentence of twelve or more words appears in two instruction files.
2. `no-dead-reference`: every path, script and skill an instruction names exists.
3. `size`: the always-loaded set plus the two laws and four process skills is at most 900 lines.
4. `no-jargon`: the instruction files contain none of the banned words (lane, receipt as a noun for a test result, stand, farm, envelope, ceremony, doctrine, census, plane, currency).
5. `language-by-file`: a language guide is named only in a rule that routes by file extension.
6. `free-tier`: a Task with five writes, a story naming none of them and a commit touching one more file is accepted and recorded (PR #12, tests 015–018).
7. `three-tiers-stated`: the process law names the three tiers and the owner's word appears only in the third.
8. `boxes-are-commands`: `plan-gate` refuses a plan whose acceptance box is neither `` `cmd` exits N `` nor `Commit`.
9. `retro-has-a-status`: `end-work` refuses closure while the previous Delivery's experiment line has no status.
12. `judge-before-owner`: `lock-spec` refuses a SPEC whose hash carries no PASS from `plan-gate --judge`; the judge's answers each carry a quote from the plan; the rubric file is the only prompt.
13. `strict-skeleton`: `plan-gate` refuses a plan missing any block of the skeleton (currencies table, target tree, Types block when `.ts` sources change, New names table, Not verified list).
11. `types-shown`: `plan-gate` refuses a SPEC whose target tree adds or changes `.ts` sources and whose SPEC has no TypeScript block; the pre-approval screen carries a Types block.
10. `retro-reports-currencies`: an `end-work` retro without the three currency numbers is refused by the same check.

The first five are one script, `shared/code-production/instruction-audit.ts`, run by `agent:verify:docs` in 0_agents and red today. `boxes-are-commands`, `types-shown`, `judge-before-owner` and `strict-skeleton` are checks in `plan-gate`; `retro-has-a-status` and `retro-reports-currencies` are checks in `end-work`; all red today.

## Not in this plan

- The Magnis repository layer: the vocabulary page `docs/project.md` (what Magnis is, key ideas, names anchored to `@magnis/sdk`, notation for dates, ids and wire spelling), `CLAUDE.md`, `AGENTS.md`, `.claude/rules/*`, the repo copies of skills and cops, the cargo hook, the docs copies of the laws, the pre-push additions, the re-vendored runtime. It is the next plan in magnis-app, rule 35–39 are its content, and it starts when this PR and PR #12 are merged.
- The memory cleanup (register M) is done by hand on the owner's word after that plan; it lives outside any repository.
- The S/M/L size loop with git-measured facts and an optimism ratio at end-work is its own later plan.
- Cyrus skills are deleted, not migrated; Cyrus does not run Magnis.
- `content-os` and other consumers of 0_agents get the same skills through `update.sh`; their project files are not touched.
<!-- plan:spec:end -->

<!-- plan:implementation:start -->
## Implementation contract
<!-- plan:implementation:end -->

<!-- plan:execution:start -->
## Execution log
<!-- plan:execution:end -->
