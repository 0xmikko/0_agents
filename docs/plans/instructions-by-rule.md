# Agent instructions, rule by rule: memory becomes law, the rest is cut

Status: SPEC_DRAFT  
Spec lock: unlocked  
Implementation lock: unlocked  
Active Delivery: none  
Unattended decisions: allowed  

<!-- plan:spec:start -->
## The Goal

After this merges, an agent opens a session on any of our repositories, reads one screen of rules it can hold in its head, and works through an approved plan without asking the owner about anything a machine can decide. The owner's word stays where a decision lives: the goal, the target tree, the meaning of an acceptance criterion. Measure: instruction lines loaded in a Magnis session, 6 100 in 56 files today, at most 900 in 14 files; owner answers per Delivery that decide nothing (writes lists, receipts, docs re-pins), 25 in the last backend plan, zero.

## The target

One rule has one home. A rule is stated where the agent is when it needs it: the global entry for what is always true, the process law for how a plan runs, a skill for the moment it is invoked, the project file for facts of that repository. Nothing is stated twice.

### The files that remain (0_agents)

| File | What it holds | Lines |
|---|---|---:|
| `claude/CLAUDE.md` = `~/.claude/CLAUDE.md` | six always-on rules, routing, boundaries | ≤ 30 |
| `codex/AGENTS.md` | the same six rules, Codex paths | ≤ 12 |
| `shared/lang/typescript.md`, `shared/lang/rust.md` | language style; loaded when the task touches `.ts`/`.tsx` or `.rs` files, never by "the language of the task" | ≤ 40 each |
| `shared/code-production/laws/development-process.md` | the process: lifecycle, sizes, stage cadence, the three tiers, git, verification once, unattended, handoff | ≤ 100 |
| `shared/code-production/laws/plan-format.md` | plan sections, template, what approval freezes, plan-gate mechanics, forbidden | ≤ 80 |
| `shared/code-production/package-contract.md` | the `agent:*` script API | as is |
| skills `blueprint`, `blueprint-start`, `end-work`, `bug` | the four moments of the process | ≤ 60 each |
| skills `cleanup-worktrees`, `mdurl`, `dictate`, `nvim`, `review-implementation` | utilities and the review driver | as is, trimmed |
| agents `coherence-cop`, `coverage-cop`, `simplicity-cop` | three reviewers, three metrics, Rust sections removed | ≤ 80 each |
| skills `startup-pressure-test`, `icp-pain`, `investor` | the owner's business skills | untouched |
| `shared/code-production/instruction-audit.ts` | the machine that keeps the diet: sizes, dead references, duplicate sentences, jargon | new |

Removed: skills `start-work`, `test-protocol`, `completion-note`, `verify-app`, `verify-frontend`, `fast-precommit`, `fix-ci-cd`, `quick-fix`, `plan`, `review-plan`, `execute`, `finish-plan`, `git`, `dispatch-to-linear`, `execute-from-linear`, `launch-e2e` (16); laws `plan-protocol.md` and `git-workflow.md` (folded into the two that stay).

### The rules, group by group

Each row is the rule as it will read. "Today" counts the files that state it now (register A/B/C in `docs/research/instruction-registers/`).

**Always on — `claude/CLAUDE.md`, six rules**

| # | Rule | Today | From |
|---|---|---|---|
| 1 | A claim about code is checked on the artifact it names: run it, open it, `git show origin/staging:<path>`, run the compiler. Never from structure, grep, a colleague's report or a tree behind staging. | 0 files, 8 memories | memory |
| 2 | No fallbacks, defaults, safety nets or "just in case" code the owner did not ask for. A missing value stays missing and surfaces as an error. | 5 files | global, project, cop |
| 3 | Find the existing mechanism and extend it; a second copy is a defect. Delete what the change makes unnecessary in the same commit. | 3 files + 9 owner corrections | global, project |
| 4 | The test comes first and is red for the behavior, not for syntax or environment. A test that is green from birth is proven by mutating the source and watching only it fail. | 11 files + 3 memories | everywhere |
| 5 | A tool refusal is not a question for the owner: record one line and continue. Every stop ends with "waiting for: X" or "continuing". "Impossible" needs an author: an owner decision, a documented invariant, an external contract. | 10 files + 5 memories + 12 owner "продолжай" | everywhere |
| 6 | Write in the repository's own words. A new name comes with a table "why the existing one is not enough". No task codes, invariant numbers or `file.ts:123` in prose; a report to the owner is sentences, not test ids. | 1 file + 4 memories + 44 owner corrections | memory |

Plus: read the project `CLAUDE.md`; load a language guide only for files of that language; the boundaries (workflows, infrastructure, `.claude/`, secrets, `CLAUDE.md`/`AGENTS.md` only when the task names them); never kill or reuse processes you did not start; the owner is on a Claude subscription, not the API.

**How a plan is written — `blueprint` + `plan-format.md`**

| # | Rule | Today | From |
|---|---|---|---|
| 7 | The Goal is the product standard in the owner's words and its measure, three sentences, never "measure X". | example in 2 files is a measurement goal the owner rejected 2026-09-09 | owner |
| 8 | Before `lock-spec`: fresh `origin/staging`, and the list of open PRs into staging that touch the SPEC's files, recorded in "Today". | 0 files, 7 owner corrections, S1 of #258 thrown away | plans |
| 9 | Sizes the gate counts: SPEC ≤ 250 lines; a Delivery ≤ 8 Stages; a Stage description ≤ 40 lines and reads as the future commit message; a Task story ≤ 200 characters. More work is a second Delivery, never a bigger plan. | 0 files; plans of 3 590 lines / 42 Stages | owner |
| 10 | A Task's writes are files, directories or globs, as many as the change needs; the story does not repeat them. | 4 files say "four writes, name every path" | PR #12 |
| 11 | No minutes and no credits in a plan. Size is the number of files and lines a Stage touches; the fact comes from git at end-work. | 12 rules in 6 files require Predict | owner 2026-05-07, retro |
| 12 | Every new file or mechanism names what it replaces or extends; the Reuse map holds the greps proving nothing existing covers it. | 2 files | law |
| 13 | Review of a plan runs only on the owner's word, at most three rounds, and fixes only what the plan cannot run without; the rest is listed as declined. | caps 2 and 3 in 3 files | memory |
| 14 | Read each acceptance command in the future tense against the tree the plan builds; a command that only this machine can pass is prose with its number. | 2 files + 4 memories | law, memory |
| 15 | A plan judged by a model-run metric first publishes the band of the unchanged product and counts an effect only when every block clears it. | 3 memories | memory |
| 16 | Forbidden, as today: opening with the problem, DEC lists, tests asserting layout or a deleted file, inventory pins, self-declared approval, boxes mirroring CI or PR state. | 2 files (kept) | law |
| 16a | A box is a command with its exit code or the Commit box, nothing else. What a machine cannot check is not a box: it goes to the pre-approval screen under "not verified". | 0 files; agent-delegation closed 2026-09-17 with 24 prose boxes planctl can never tick | plans |
| 17 | The pre-approval screen is the last block and the one the owner reads: file tree, acceptance stories in plain words, what is not verified and why. | 2 files (kept) | law |

**How a plan is executed — `blueprint-start` + `development-process.md`**

| # | Rule | Today | From |
|---|---|---|---|
| 18 | Three tiers. Free: add a test, add a file the compiler names, touch a file beyond the writes in the same commit, close a Stage whose commands are green; planctl records the difference in Results. Recorded: a new file outside the target tree, a deleted test, a criterion that became unreachable, one Deviations line and on. Owner's word: the goal and its measure, removing a promised file, the meaning of a criterion, scope beyond the Delivery. | 0 files; 60 % of 377 Deviations lines are tier 1–2 | retro П6, owner |
| 19 | Start and before the gate: merge `origin/staging`, install root and backend, build the SDK, dry-run the compiler, grep raw SQL for renamed columns, `uniq -d` migration numbers, re-pin docs in the same commit that moves an anchor. | 2 files partial + 2 memories + 34 re-pin follow-up commits | memory, plans |
| 20 | Stage cadence, as today: `start-task`, RED, GREEN, the Stage's one to three named test files, micro-review with the three cops, one commit, `complete-task`, next Stage. | 6 files | law |
| 21 | The browser lane runs once at the start of a Delivery for its baseline, not at the end. | 0 files; #249 and #258 paid it at S8 | retro |
| 22 | A parallel Stage agent returns one commit and a typed result; it never edits the plan. | 2 files | law |
| 23 | Unattended: decide the smallest reversible thing, record it, continue; stop only for data loss, security or destruction of unmerged work. | 4 files + `execute` and `finish-plan` twice more | law |

**Git and publication — `development-process.md` §Git (the `git` skill folds in)**

| # | Rule | Today | From |
|---|---|---|---|
| 24 | All work in a `.worktrees/<slug>` worktree on `feat|fix|refactor|chore/<slug>` from `origin/staging`; one agent, one worktree, one branch; `git -C <abs>` for every writing git command. | 4 files + 1 memory | law |
| 25 | Merge commits only; never rebase, amend, force-push or squash; never `cp` or `git checkout <branch> -- <path>` between trees. | 7 files, contradicted by `fix-ci-cd` (rebase + force-with-lease) | law |
| 26 | One work commit per Stage, Conventional subject, body says why. No wip commits in a plan run. | 5 files, contradicted by `git` skill ("wip encouraged") and `start-work` (stage-checklist body) | law |
| 27 | A push buys a CI matrix: push when someone needs the new state. The pre-push hook is the gate, run once, and writes the receipt; do not run `agent:verify:pr` yourself first. A plan document is pushed on the owner's word. The agent flips ready, the owner merges. Never push to staging or main. | 12 files for "never push", 0 for "when to push" + 9 memories | memory |
| 28 | Everything on GitHub is English and product-framed and links only to GitHub URLs; documents for the owner go through `mdurl`, never cloud artifacts. | 0 files + 4 memories | memory |
| 29 | Handoff is `[PR #N — title](url)`, the plan `mdurl`, the head SHA, what is not verified. After the merge: `end-work`, retro, ledger. | 4 files | law |
| 29a | A retro names one experiment. `end-work` writes it into the register at the end of the process law with a date; the next `end-work` refuses to close a Delivery while the previous experiment has no status (accepted or declined, on the owner's word). A partial close says so in the ledger: merged, N boxes open under Deviations. | 0 files; 9 experiments since 08-25, none with a status | retro H, plans |

**Verification and tests — `development-process.md` §Verification**

| # | Rule | Today | From |
|---|---|---|---|
| 30 | Inner loop: the exact `bun run agent:test:<lane> -- <file>`; Stage: its one to three files; Delivery: the complete gate once through the pre-push hook; CI repeats it on the published SHA; review reuses the receipt. | 7 files, contradicted by 5 skills that demand the full suite per stage | law |
| 31 | A red CI run: read the log, reproduce with the exact command, fix one failure class per push; a failure that is on the base is named to the owner, not fixed silently. | `fix-ci-cd` (220 lines, cargo) | skill, cut to 3 lines |
| 32 | Never skip, weaken or ignore a test to get green; a failing test is a root cause to find. | 4 files | law |

**Review — three cops + `review-implementation`**

| # | Rule | Today | From |
|---|---|---|---|
| 33 | Three reviewers, three metrics, in parallel: coherence (reuse and layers), coverage (tests and edge cases), simplicity (no speculative abstraction, no file bloat). Default verdict REJECT. | 3 files each × 2 copies (Rust sections inside) | owner |
| 34 | Codex review only when asked or for diffs over 200 lines; at most two rounds; a real correctness finding at the cap is fixed, style is dropped. | caps 2 vs 3 in 3 files; "Task tool" | skill |

**Repository facts — the project `CLAUDE.md` (Magnis, follow-up plan)**

| # | Rule | Today | From |
|---|---|---|---|
| 35 | Commands as they exist: `db:up`, `dev`, `backend:dev`, scoped `bun test`, `check:backend`, `docs:check`, `test:e2e`; planctl only as `bun .agents/code-production/runtime/planctl.ts`; `git reset -q` after a refused commit. | `dev:web` (gone), `MAGNIS_DB_MODE` (retired), bare `planctl` | stale |
| 36 | Dev stand: `db:up` prints `DATABASE_URL` (embedded PG 16, `--docker` for multi-user), `dev` runs backend and Vite on it; PGlite only in the test runner; one user, open auth, no CORS or origin guards. | wrong in CLAUDE.md, right in 4 memories | memory |
| 37 | docs:check resolves anchors at `verified_against`: pin an ancestor that exists, anchor files that exist there. | 1 memory | memory |
| 38 | Domain types are hand-written interfaces, zod decodes into them; one camelCase spelling across a boundary; never hand-roll UI, assemble from `@magnis/host/ui`. | 2 memories; rules files describe serde and `.rs` | memory |
| 39 | E2E runs in CI only on PRs into main; run it locally against a staging baseline. | 1 memory + 5 owner waivers | memory |

### Memory after the diet

93 + 16 files become 10: two consolidated references (host and shell traps; bun on this host), three project pointers (telegram fast-sync PR #257, the unpushed graph-reading-pipeline branch, the process retro), two runtime blockers until PR #12 merges, and the index. Register M lists every file and its fate.

## Today, measured against that

Measured on 0_agents `7cbc4a5` and magnis-app `dc396a3ee` (2026-09-17).

| What | Number |
|---|---:|
| Instruction files an agent may load in a Magnis session | 56 |
| Lines in them | ≈ 6 100 |
| Rules extracted (registers A, B, C) | 974 |
| Rules stated in two or more files | 92 (global and skills) + 219 (laws and their copies) + 25 (repo copies of global rules) |
| Rows flagged as contradicting another rule | 54 + 1 + 4 |
| Rows that are stale or name something that does not exist (a file, a script, a command, "scorecard") | 14 + 5 + 30 |
| Rust-era rules in a TypeScript project | 57 |
| Different Task formats across laws and copies | 3 |
| Memory files (magnis-app + twin directory) | 93 + 16 |
| Owner corrections 19.08–15.09 (retro) | 218, none became a rule |
| Owner "да" answers for writes-list edits in one plan | 25 |
| Deviations lines that are planctl bookkeeping, not decisions | ≈ 60 % of 377 |
| Skills last substantively changed | 2026-08-30 |
| agent-delegation `end-work` on 2026-09-17 (PR #254 merged) | 49 open boxes: 24 prose boxes no machine closes, the rest behind `complete-task` refusing paths beyond the writes; retro experiment 9 of 9 without an owner status; worktree kept |

The three registers and register M are committed under `docs/research/instruction-registers/` with this plan.

What already works and stays: the push hook, the draft-without-matrix rule, the ready guard, the pre-approval screen, the three cops, micro-review, `mdurl`.

## Invariants

1. `one-home`: no sentence of twelve or more words appears in two instruction files.
2. `no-dead-reference`: every path, script and skill an instruction names exists.
3. `size`: the always-loaded set plus the two laws and four process skills is at most 900 lines.
4. `no-jargon`: the instruction files contain none of the words the owner banned (lane, receipt as a noun for a test result, stand, farm, envelope, ceremony, doctrine, census, plane, currency).
5. `language-by-file`: a language guide is named only in a rule that routes by file extension.
6. `free-tier`: a Task with five writes, a story naming none of them and a commit touching one more file is accepted and recorded (PR #12, tests 015–018).
7. `three-tiers-stated`: the process law names the three tiers and the owner's word appears only in the third.
8. `boxes-are-commands`: `plan-gate` refuses a plan whose acceptance box is neither `` `cmd` exits N `` nor `Commit`.
9. `retro-has-a-status`: `end-work` refuses closure while the previous Delivery's experiment line has no status.

Invariants 1–5 are one script, `shared/code-production/instruction-audit.ts`, run by `agent:verify:docs` in 0_agents and red today. Invariants 8 and 9 are two checks in `plan-gate` and `end-work`, red today.

## Not in this plan

- The Magnis repository layer: `CLAUDE.md`, `AGENTS.md`, `.claude/rules/*`, the repo copies of skills and cops, the cargo hook, the docs copies of the laws, the re-vendored runtime. It is the next plan in magnis-app, rules 35–39 above are its content, and it starts when this PR and PR #12 are merged.
- The memory cleanup (register M) is done by hand on the owner's word after that plan; it lives outside any repository.
- Predict minutes and credits leave the plan text here; the S/M/L size loop with git-measured facts and an optimism ratio at end-work is its own later plan.
- Cyrus skills are deleted, not migrated; Cyrus does not run Magnis.
- `content-os` and other consumers of 0_agents get the same skills through `update.sh`; their project files are not touched.
<!-- plan:spec:end -->

<!-- plan:implementation:start -->
## Implementation contract
<!-- plan:implementation:end -->

<!-- plan:execution:start -->
## Execution log
<!-- plan:execution:end -->
