# Agent instructions, rule by rule: memory becomes law, the rest is cut

Status: SPEC_DRAFT  
Spec lock: unlocked  
Implementation lock: unlocked  
Active Delivery: none  
Unattended decisions: allowed  

<!-- plan:spec:start -->
## The Goal

Four currencies. Everything below is their decomposition down to a file.

| # | Currency | Today | Goal |
|---|---|---|---|
| M1 | **Speed through the workflow**: time from "утверждаю" to "мержу", full gates bought per Delivery, stops that were not decisions | unified-launch 15 h (4 h of work); 3–10 full gates per Delivery; 12 "продолжай" in 9 plans, every one at a tool refusal | one local gate and one CI per Delivery; zero stops at a tool refusal |
| M2 | **Code quality**: defects the review catches before the commit, not at integration | 7 defects found at one Integration Stage; a second copy of a mechanism merged in 6 plans; Codex and Claude review by different rule sets | integration finds nothing a Stage review missed; reviewers read one rule set |
| M3 | **Fewer errors and less owner involvement**: owner answers that decide nothing, red CI pushes, boxes the owner must close by hand | 25 "да" for writes lists in one plan; 34–39 docs re-pin commits; 49 open boxes at the last end-work, 24 of them prose | zero owner answers on mechanics; zero prose boxes; a red CI push only for a real product defect |
| M4 | **A vocabulary that stops growing**: new names per plan, invented words in instructions and plans | 44 "птичий язык" and 37 "ты снова выдумал" in four weeks; three Task formats; the laws themselves say receipt ×75, lane ×44, gate ×90 | new names in a plan ≤ 5, each with a table "why the existing one is not enough"; zero banned words in instructions |

## Decisions, from currency to file

Each decision names the mechanism (why it moves the currency), what changes, and how the movement will be seen.

**M1 Speed**

| Decision | Mechanism | What changes | Seen as |
|---|---|---|---|
| D1.1 Three tiers of freedom | Stops happen at machine refusals, not at decisions: 60 % of 377 Deviations lines are planctl bookkeeping. Let the machine record instead of refuse. | PR #12 (planctl: writes as contract, no cap, extra files recorded); rule 18 in the process law; rule 5 always-on | "продолжай" 12 → 0; Deviations lines that are bookkeeping → 0 |
| D1.2 One gate per Delivery | Every extra full run is 25–50 min and a flake risk; #244 bought 10, #248 bought 4. The pre-push hook already writes a receipt. | rules 27, 30: the hook is the gate, nobody runs `agent:verify:pr` by hand; rule 21: browser baseline at the start of the Delivery | gates per Delivery: 1 local + 1 CI |
| D1.3 Small plans | The plans the owner approved in one round were ≤ 1 000 lines; the 3 000-line ones took 10 review rounds and 42 Stages. | rule 9: SPEC ≤ 250, Delivery ≤ 8 Stages, Stage ≤ 40 lines, more work = next Delivery; plan-gate counts it | SPEC review rounds ≤ 3; plan commits before approval ≤ 10 |
| D1.4 Fresh base before the SPEC is locked | S1 of #258 was discarded because staging already carried the mechanism; 7 "fresh staging" corrections. | rule 8: fresh `origin/staging` and the in-flight PR list before `lock-spec`; rule 19: the post-merge checklist | integration conflicts with staging: 0 mechanisms replaced |
| D1.5 A retro that changes something | 9 experiments since 25.08, none adopted; the same red-CI round trips repeat (check:rename twice). | rule 29a: the experiment goes into a register with a status; end-work refuses to close while the previous one has none | each end-work carries one accepted or declined line |

**M2 Code quality**

| Decision | Mechanism | What changes | Seen as |
|---|---|---|---|
| D2.1 Codex and Claude read the same law | A reviewer with a different rule set flags different things and misses what the author was told. Today `codex/AGENTS.md` has none of the six rules and Codex carries its own skill copies. | `AGENTS.md` states the same six rules; one law set in `shared/`; skills symlinked to both | Codex review findings that contradict a Claude rule: 0 |
| D2.2 Three reviewers, three metrics | One agent holds one objective; three cops in parallel see reuse, coverage and simplicity separately (owner's design). Rust sections make them judge TS code by the wrong rules. | cops kept, each ≤ 80 lines, Rust removed, verdict REJECT by default; rules 33, 34 | defects found at integration → 0 |
| D2.3 Four code rules always on | Verify on the artifact, no fallbacks, extend the existing, red first with mutation proof: 8 + 9 + 11 owner corrections, each in memory, none in the file the agent reads at start. | rules 1–4 in `claude/CLAUDE.md` | second copies of a mechanism merged: 0 |
| D2.4 No contradictions, nothing dead | A model given "run cargo test" and "run bun test", "rebase" and "never rebase", "full suite per stage" and "once per Delivery" picks one at random. 59 contradictions, 49 dead references, 57 Rust-era rules. | 16 skills and 2 laws deleted; `instruction-audit` refuses dead references | dead references and contradictions: 0, checked by the audit |
| D2.5 Language guides by file | A TS task must not read the Rust guide; other repositories still need it. | rule: a guide loads for `.ts`/`.tsx` or `.rs` files, never by "the language of the task" | — |

**M3 Fewer errors, less owner involvement**

| Decision | Mechanism | What changes | Seen as |
|---|---|---|---|
| D3.1 = D1.1 | The 25 "да" were answers to a writes-list check. | PR #12, rule 18 | owner answers on mechanics: 0 |
| D3.2 Boxes are commands | 24 prose boxes at the last end-work can never be ticked by a machine, so the owner is asked to close them by hand. | rule 16a; plan-gate refuses a prose box; what a machine cannot check goes to "not verified" | prose boxes: 0 |
| D3.3 The post-merge checklist | Raw SQL with old columns, colliding migration numbers and moved docs anchors pass the compiler and fail CI; 34–39 re-pin commits. | rule 19 as a checklist in blueprint-start; re-pin in the same commit | red CI pushes per Delivery ≤ 1 |
| D3.4 CI-only gates run locally | `check:rename` and the client-react typecheck run only in CI; two red round trips on #254. | Magnis follow-up: pre-push runs them (rule 35 area) | — |
| D3.5 Memory becomes law | A lesson in memory is recalled by chance: "no test asserts a deleted file" was in memory and violated 26 days later. 93 files → 22 rules written once where the agent reads them. | register M; rules 1, 4, 5, 6, 13–15, 27, 28, 36–39 | memory files: 10; repeated corrections: 0 |

**M4 Vocabulary**

| Decision | Mechanism | What changes | Seen as |
|---|---|---|---|
| D4.1 Repository words, new names with a table | 37 "ты снова выдумал"; a name the plan invents is a name the code and docs carry forever. | rule 6 always-on; the pre-approval screen prints the count of new names | new names per plan ≤ 5 |
| D4.2 Words the instructions themselves use | The laws say receipt ×75, lane ×44, gate ×90; the agent learns the dialect from the law. | `instruction-audit` refuses the banned list in instruction files; the laws are rewritten in plain words | banned words in instructions: 0 |
| D4.3 One Task format, one plan format | Three Task formats across laws and copies, a fourth in the `plan` skill; the agent mixes them. | `plan` skill and `plan-protocol.md` deleted; plan-format keeps one template | formats: 1 |
| D4.4 The goal in the owner's words | The skill's own "good goal" example is a measurement goal the owner rejected on 09-09; the agent copies the example. | rule 7; examples replaced | "это не цель, это проблема": 0 |
| D4.5 Fewer files | Each file brings its own nouns: 56 files, 6 100 lines. | 14 files, ≤ 900 lines; `instruction-audit` counts | lines loaded: ≤ 900 |

## What changes, file by file (0_agents)

| File | Holds | Lines | Decisions |
|---|---|---:|---|
| `claude/CLAUDE.md` = `~/.claude/CLAUDE.md` | six always-on rules, routing by file, boundaries | ≤ 30 | D2.3, D2.5, D4.1 |
| `codex/AGENTS.md` | the same six rules, Codex paths | ≤ 12 | D2.1 |
| `shared/lang/typescript.md`, `shared/lang/rust.md` | language style only | ≤ 40 each | D2.5 |
| `laws/development-process.md` | lifecycle, sizes, cadence, three tiers, git, verification once, unattended, handoff, the retro register | ≤ 100 | D1.1–D1.5, D3.3 |
| `laws/plan-format.md` | sections, one template, what approval freezes, plan-gate mechanics, forbidden | ≤ 80 | D1.3, D3.2, D4.3 |
| `shared/code-production/package-contract.md` | the `agent:*` script API | as is | — |
| skills `blueprint`, `blueprint-start`, `end-work`, `bug` | the four moments of the process | ≤ 60 each | D1.3–D1.5, D4.4 |
| skills `cleanup-worktrees`, `mdurl`, `dictate`, `nvim`, `review-implementation` | utilities, the review driver | trimmed | D2.2 |
| agents `coherence-cop`, `coverage-cop`, `simplicity-cop` | three reviewers | ≤ 80 each | D2.2 |
| skills `startup-pressure-test`, `icp-pain`, `investor` | business | untouched | — |
| `shared/code-production/instruction-audit.ts` | the machine that keeps the diet | new | D2.4, D4.2, D4.5 |

Removed: skills `start-work`, `test-protocol`, `completion-note`, `verify-app`, `verify-frontend`, `fast-precommit`, `fix-ci-cd`, `quick-fix`, `plan`, `review-plan`, `execute`, `finish-plan`, `git`, `dispatch-to-linear`, `execute-from-linear`, `launch-e2e`; laws `plan-protocol.md`, `git-workflow.md`. Their surviving rules are in the tables below with their new home.

## The rules as they will read

"Today" counts the files that state the rule now (registers A, B, C in `docs/research/instruction-registers/`).

**Always on — `claude/CLAUDE.md`**

| # | Rule | Today | Decision |
|---|---|---|---|
| 1 | A claim about code is checked on the artifact it names: run it, open it, `git show origin/staging:<path>`, run the compiler. Never from structure, grep, a colleague's report or a tree behind staging. | 0 files, 8 memories | D2.3 |
| 2 | No fallbacks, defaults, safety nets or "just in case" code the owner did not ask for. A missing value stays missing and surfaces as an error. | 5 files | D2.3 |
| 3 | Find the existing mechanism and extend it; a second copy is a defect. Delete what the change makes unnecessary in the same commit. | 3 files + 9 corrections | D2.3 |
| 4 | The test comes first and is red for the behavior, not for syntax or environment. A test green from birth is proven by mutating the source and watching only it fail. | 11 files + 3 memories | D2.3 |
| 5 | A tool refusal is not a question for the owner: record one line and continue. Every stop ends with "waiting for: X" or "continuing". "Impossible" needs an author: an owner decision, a documented invariant, an external contract. | 10 files + 5 memories | D1.1 |
| 6 | Write in the repository's own words. A new name comes with a table "why the existing one is not enough". No task codes, invariant numbers or `file.ts:123` in prose; a report to the owner is sentences, not test ids. | 1 file + 4 memories | D4.1 |

Plus: read the project file; a language guide loads for files of that language; the boundaries (workflows, infrastructure, `.claude/`, secrets, `CLAUDE.md`/`AGENTS.md` only when the task names them); never kill or reuse processes you did not start; the owner is on a Claude subscription, not the API.

**How a plan is written — `blueprint` + `plan-format.md`**

| # | Rule | Today | Decision |
|---|---|---|---|
| 7 | The Goal is the owner's currencies with today's number and the target, never "measure X". | example in 2 files is a measurement goal | D4.4 |
| 8 | Before `lock-spec`: fresh `origin/staging`, and the open PRs into staging that touch the SPEC's files, recorded in the SPEC. | 0 files, 7 corrections | D1.4 |
| 9 | Sizes the gate counts: SPEC ≤ 250 lines; a Delivery ≤ 8 Stages; a Stage description ≤ 40 lines and reads as the future commit message; a Task story ≤ 200 characters. More work is the next Delivery. | 0 files | D1.3 |
| 10 | A Task's writes are files, directories or globs, as many as the change needs; the story does not repeat them. | 4 files say "four writes" | D1.1 |
| 11 | No minutes and no credits in a plan. Size is files and lines a Stage touches; the fact comes from git at end-work. | 12 rules in 6 files | D1.3 |
| 12 | Every new file or mechanism names what it replaces or extends; the Reuse map holds the greps. | 2 files | D2.3 |
| 13 | Review of a plan runs only on the owner's word, at most three rounds, and fixes only what the plan cannot run without; the rest is listed as declined. | caps 2 and 3 in 3 files | D1.3 |
| 14 | Read each acceptance command against the tree the plan builds; a command only this machine can pass is prose with its number. | 2 files + 4 memories | D3.2 |
| 15 | A plan judged by a model-run metric first publishes the band of the unchanged product and counts an effect only when every block clears it. | 3 memories | D3.5 |
| 16 | Forbidden, as today: opening with the problem, DEC lists, tests asserting layout or a deleted file, inventory pins, self-declared approval, boxes mirroring CI or PR state. | 2 files | — |
| 16a | A box is a command with its exit code or the Commit box. What a machine cannot check goes to the pre-approval screen under "not verified". | 0 files | D3.2 |
| 17 | The pre-approval screen is the last block and the one the owner reads: file tree, acceptance stories in plain words, the count of new names, what is not verified and why. | 2 files | D4.1 |

**How a plan is executed — `blueprint-start` + `development-process.md`**

| # | Rule | Today | Decision |
|---|---|---|---|
| 18 | Three tiers. Free: add a test, add a file the compiler names, touch a file beyond the writes in the same commit, close a Stage whose commands are green; planctl records the difference. Recorded: a new file outside the target tree, a deleted test, a criterion that became unreachable — one Deviations line and on. Owner's word: the goal and its measure, removing a promised file, the meaning of a criterion, scope beyond the Delivery. | 0 files | D1.1 |
| 19 | Start and before the gate: merge `origin/staging`, install root and backend, build the SDK, dry-run the compiler, grep raw SQL for renamed columns, `uniq -d` migration numbers, re-pin docs in the same commit that moves an anchor. | 2 files partial + 2 memories | D3.3 |
| 20 | Stage cadence, as today: `start-task`, RED, GREEN, the Stage's one to three named test files, micro-review with the three cops, one commit, `complete-task`, next Stage. | 6 files | D2.2 |
| 21 | The browser lane runs once at the start of a Delivery for its baseline, not at the end. | 0 files | D1.2 |
| 22 | A parallel Stage agent returns one commit and a typed result; it never edits the plan. | 2 files | — |
| 23 | Unattended: decide the smallest reversible thing, record it, continue; stop only for data loss, security or destruction of unmerged work. | 4 files + 2 skills | D1.1 |

**Git and publication — `development-process.md` §Git**

| # | Rule | Today | Decision |
|---|---|---|---|
| 24 | All work in a `.worktrees/<slug>` worktree on `feat|fix|refactor|chore/<slug>` from `origin/staging`; one agent, one worktree, one branch; `git -C <abs>` for every writing git command. | 4 files + 1 memory | D2.4 |
| 25 | Merge commits only; never rebase, amend, force-push or squash; never `cp` or `git checkout <branch> -- <path>` between trees. | 7 files, contradicted by `fix-ci-cd` | D2.4 |
| 26 | One work commit per Stage, Conventional subject, body says why. No wip commits in a plan run. | 5 files, contradicted by `git` and `start-work` | D2.4 |
| 27 | A push buys a CI matrix: push when someone needs the new state. The pre-push hook is the gate, run once, and writes the receipt; nobody runs `agent:verify:pr` by hand first. A plan document is pushed on the owner's word. The agent flips ready, the owner merges. Never push to staging or main. | 12 files for "never push", 0 for "when" + 9 memories | D1.2 |
| 28 | Everything on GitHub is English and product-framed and links only to GitHub URLs; documents for the owner go through `mdurl`, never cloud artifacts. | 0 files + 4 memories | D3.5 |
| 29 | Handoff is `[PR #N — title](url)`, the plan `mdurl`, the head SHA, what is not verified. After the merge: `end-work`, retro, ledger. | 4 files | — |
| 29a | A retro names one experiment. `end-work` writes it into the register at the end of the process law with a date; the next `end-work` refuses to close a Delivery while the previous experiment has no status (accepted or declined, on the owner's word). A partial close says so in the ledger: merged, N boxes open under Deviations. | 0 files | D1.5 |

**Verification and tests — `development-process.md` §Verification**

| # | Rule | Today | Decision |
|---|---|---|---|
| 30 | Inner loop: the exact `bun run agent:test:<lane> -- <file>`; Stage: its one to three files; Delivery: the complete gate once through the pre-push hook; CI repeats it on the published SHA; review reuses the receipt. | 7 files, contradicted by 5 skills | D1.2 |
| 31 | A red CI run: read the log, reproduce with the exact command, fix one failure class per push; a failure that is on the base is named to the owner, not fixed silently. | `fix-ci-cd`, 220 lines of cargo | D2.4 |
| 32 | Never skip, weaken or ignore a test to get green; a failing test is a root cause to find. | 4 files | — |

**Review — three cops + `review-implementation`**

| # | Rule | Today | Decision |
|---|---|---|---|
| 33 | Three reviewers, three metrics, in parallel: coherence (reuse and layers), coverage (tests and edge cases), simplicity (no speculative abstraction, no file bloat). Default verdict REJECT. | 3 files × 2 copies with Rust inside | D2.2 |
| 34 | Codex review only when asked or for diffs over 200 lines; at most two rounds; a real correctness finding at the cap is fixed, style is dropped. | caps 2 vs 3; "Task tool" | D2.1 |

**Repository facts — the Magnis `CLAUDE.md` (next plan)**

| # | Rule | Today | Decision |
|---|---|---|---|
| 35 | Commands as they exist: `db:up`, `dev`, `backend:dev`, scoped `bun test`, `check:backend`, `docs:check`, `test:e2e`; planctl only as `bun .agents/code-production/runtime/planctl.ts`; `git reset -q` after a refused commit; pre-push runs `check:rename` and the client-react typecheck. | `dev:web` (gone), `MAGNIS_DB_MODE` (retired), bare `planctl` | D3.4 |
| 36 | Dev stand: `db:up` prints `DATABASE_URL` (embedded PG 16, `--docker` for multi-user), `dev` runs backend and Vite on it; PGlite only in the test runner; one user, open auth, no CORS or origin guards. | wrong in CLAUDE.md, right in 4 memories | D3.5 |
| 37 | docs:check resolves anchors at `verified_against`: pin an ancestor that exists, anchor files that exist there. | 1 memory | D3.5 |
| 38 | Domain types are hand-written interfaces, zod decodes into them; one camelCase spelling across a boundary; never hand-roll UI, assemble from `@magnis/host/ui`. | 2 memories; rules files describe serde and `.rs` | D3.5 |
| 39 | E2E runs in CI only on PRs into main; run it locally against a staging baseline. | 1 memory + 5 waivers | D3.5 |

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

Invariants 1–5 are one script, `shared/code-production/instruction-audit.ts`, run by `agent:verify:docs` in 0_agents and red today. Invariants 8 and 9 are two checks in `plan-gate` and `end-work`, red today.

## Not in this plan

- The Magnis repository layer: `CLAUDE.md`, `AGENTS.md`, `.claude/rules/*`, the repo copies of skills and cops, the cargo hook, the docs copies of the laws, the pre-push additions, the re-vendored runtime. It is the next plan in magnis-app, rules 35–39 are its content, and it starts when this PR and PR #12 are merged.
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
