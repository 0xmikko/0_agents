# Agent instructions, rule by rule: memory becomes law, the rest is cut

Status: SPEC_DRAFT  
Spec lock: unlocked  
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

## What it becomes

### The screen every agent reads first

What belongs on an always-on screen is settled: commands the model cannot guess, style that differs from defaults, repository etiquette, environment quirks, and the mistakes this model keeps making here; not what it can read from the code, not explanations. A rule that must hold every time goes to a hook; knowledge needed only sometimes goes to a skill; for every remaining line the test is "would removing it cause a mistake?" ([Anthropic, Claude Code best practices](https://code.claude.com/docs/en/best-practices); Boris Cherny, YC Startup School, July 2026: delete everything, then bring back one instruction at a time when the model actually struggles).

Today the global entry is 85 lines that repeat the skills, and the Codex entry has none of it. Both become this one screen. There are two modes and nothing else: planning with `/blueprint`, working by an approved plan with `/blueprint-start`. `/end-work` is not on the screen because the owner invokes it after a merge. The git rules that hooks already enforce are not on the screen either; the hook is the rule.

```markdown
# Working here

Two modes. Planning: `/blueprint` writes `docs/plans/<slug>.md` in its own worktree and
the owner approves twice, the SPEC and then the Stages. Working by an approved plan:
`/blueprint-start`. There is no third mode.

IMPORTANT: the vocabulary does not grow. Every entity, field, status and command has one
name, the one the code and the SDK already use. Before writing a name, find it. A name
that exists nowhere is declared in the plan's table "new names: why the existing one is
not enough" or it does not appear. No synonyms, no task codes, no `file.ts:123` in prose.

Code is DRY and SOLID, and here that means: one mechanism per job, extend it, never copy
it; one class per file, one reason to change; depend on interfaces the caller owns; a
function does one thing and is named for it. A second copy of anything is a defect, and
the reviewers reject it.

The plan belongs to planctl after the first lock: `init`, `set-spec`, `lock-spec`,
`put-stage`, `approve-plan`, `start-task`, `complete-task`, `close-stage`,
`add-deviation`; `amend` only with the owner's word. Never edit a locked plan by hand;
the pre-commit hook refuses it. In a consumer repository planctl is
`bun .agents/code-production/runtime/planctl.ts`, nothing else.

Verify only with the project's `agent:*` scripts: `bun run agent:test:<lane> -- <file>`
in the loop, the Stage's one to three files before its commit, the full gate once per
Delivery through the pre-push hook. Never compose framework commands.

Mistakes this model keeps making here, so do not:
- Claims from structure. Check the artifact: run it, open it, `git show origin/staging:<path>`.
- Fallbacks, defaults, "just in case". A missing value is an error.
- Tests green from birth. Red first; prove a green-from-birth test by mutating the source.
- Stopping at a tool refusal. Record one line and continue; a stop ends with "waiting for: X".

Language guide by file: `.ts`/`.tsx` → typescript.md, `.rs` → rust.md.
Never edit workflows, infrastructure, `.claude/`, secrets, CLAUDE.md or AGENTS.md unless
the task names the file. Never kill or reuse a process you did not start.
The owner is on a Claude subscription: no API key, ever.
```

`codex/AGENTS.md` is the same screen with `~/.codex/lang/` paths. That is the whole always-on set: about 35 lines, under 800 tokens. One line carries IMPORTANT, the vocabulary, because it is the most frequent correction (81 in four weeks) and the guidance is to emphasize one line, not ten.

### Planning

Today a plan is written against four laws and three skills that disagree on the Task format, teach a "good goal" that is a measurement, require minutes and credits nobody measures, and check nothing about how the text reads. The owner reads 3 000-line plans and corrects form 151 times a month.

It changes to this. The plan has one fixed skeleton, and a linter refuses a plan that breaks it before anyone reads it: the Goal as the owner's currencies with today's number and the target; the target file tree; every new or changed type as TypeScript, hand-written interfaces one field per line, zod decoding into them, never a sentence or "as in the SDK"; a table of new names with the reason the existing one is not enough; the list of what is not verified and why. The linter also parses every mermaid block, refuses banned words, task codes and `file.ts:123` in prose, sentences over thirty words, and any minutes or credits.

Sizes are counted, not hoped for: a SPEC is at most 250 lines, a Delivery at most eight Stages, a Stage description at most forty lines and reads as its future commit message, a Task story at most 200 characters. More work is the next Delivery, never a bigger plan. A Task's writes are files, directories or globs, as many as the change needs, and the story does not repeat them.

The names in a plan come from the project's vocabulary: a page that says what the project is, its key ideas, the names of its entities anchored to the SDK, and how things are written, dates, ids, spelling on the wire. Magnis gets that page in the next plan. A plan may use those names or declare a new one in the table; the pre-approval screen prints how many it declared.

Before the SPEC is locked, the agent merges fresh `origin/staging` and lists the open PRs into staging that touch the SPEC's files, so a Stage is not built on a mechanism staging already has.

Before the owner is asked "Утверждаешь?", a cheap judge reads the plan: a fixed rubric of the questions a linter cannot answer, is the Goal a goal or a problem, does each Stage read as a commit, are the names existing ones, is the prose plain, answered by a small model through `claude -p --model haiku` on the owner's subscription, with a quote from the plan for every answer. Today that call takes 1.4 seconds. The verdict is stored by the SPEC's hash, so the same bytes are never judged twice; `lock-spec` refuses without a PASS, and an unavailable judge refuses the lock rather than skipping it. It is a gate, not a review round.

Review of a plan runs only on the owner's word, at most three rounds, and fixes only what the plan cannot run without; the rest is listed as declined.

### Execution

Today the agent stops at machine refusals and asks the owner: a commit touched one file beyond the writes, a Task had five writes, a docs anchor moved, a Stage depended on an open Stage. The owner answers "да" 25 times and "продолжай" 12 times, and 60 % of the Deviations log is bookkeeping.

It changes to three tiers, written in the process law. Free, the agent just does it and planctl records the difference in the result row: add a test, add a file the compiler names, touch a file beyond the writes in the same commit, close a Stage whose commands are green. Recorded, one Deviations line and on: a new file outside the target tree, a deleted test, a criterion that became unreachable. The owner's word, and only here: the goal and its measure, removing a promised file from the tree, the meaning of an acceptance criterion, scope beyond the Delivery. PR #12 already makes planctl behave this way.

A box in a plan is a command with its exit code or the Commit box, nothing else. What a machine cannot check is not a box; it goes to the "not verified" list the owner sees before approval. So no plan ends with 24 boxes nobody can tick.

The complete gate runs once per Delivery, through the pre-push hook, which writes the receipt; nobody runs `agent:verify:pr` by hand to see. A push buys a CI matrix and happens when someone needs the new state. The browser lane runs once at the start of a Delivery for its baseline, not at the end. After merging staging the agent walks one checklist: install root and backend, build the SDK, dry-run the compiler, grep raw SQL for renamed columns, `uniq -d` the migration numbers, re-pin docs in the same commit that moves an anchor; the Magnis pre-push also runs the checks that today exist only in CI.

The author and the reviewers read one law. Today Codex reviews by an `AGENTS.md` that has none of the six rules, and the three cops carry Rust sections for TypeScript code. The three cops stay, one metric each, coherence, coverage, simplicity, verdict REJECT by default, trimmed to what applies. Codex is called when asked or for diffs over 200 lines, at most two rounds; a real correctness finding at the cap is fixed, style is dropped.

Nothing contradictory and nothing dead remains: sixteen skills of the cargo and Cyrus era go, two of the four laws fold into the other two, the language guides load by file extension, and an audit script refuses a dead reference, a duplicate sentence, a banned word or more than 900 lines in the loaded set. Twenty-two lessons that today live in 93 memory files are written once where the agent reads them, and the memory directory shrinks to ten files.

### Retro

Today end-work reports minutes and credits nobody measures and proposes an experiment nobody adopts.

It changes to this. The retro reports the three numbers above for the Delivery: corrections about form and about substance before approval; dumb questions, stops and gates during execution; and the status of the previous experiment. It names one new experiment and writes it into a register at the end of the process law with a date. The next end-work refuses to close a Delivery while the previous experiment has no status, accepted or declined on the owner's word; an accepted one becomes a rule in the same PR. A partial close says so in the ledger in one fixed form: merged, N boxes open under Deviations, the experiment line.

### The files

What stays in 0_agents: `claude/CLAUDE.md` and `codex/AGENTS.md` (the screen above); `shared/lang/typescript.md` and `rust.md`, style only; two laws, `development-process.md` (lifecycle, sizes, cadence, the three tiers, git, verification once, unattended, handoff, the retro register) and `plan-format.md` (the skeleton, one template, what approval freezes, the linter's rules); the `agent:*` package contract; four process skills, `blueprint`, `blueprint-start`, `end-work`, `bug`; the utilities `cleanup-worktrees`, `mdurl`, `dictate`, `nvim` and the review driver `review-implementation`; the three cops; the owner's business skills untouched. New: `instruction-audit.ts` (the audit) and `plan-judge.md` with `plan-judge.ts` (the rubric and the call).

What goes: skills `start-work`, `test-protocol`, `completion-note`, `verify-app`, `verify-frontend`, `fast-precommit`, `fix-ci-cd`, `quick-fix`, `plan`, `review-plan`, `execute`, `finish-plan`, `git`, `dispatch-to-linear`, `execute-from-linear`, `launch-e2e`; laws `plan-protocol.md` and `git-workflow.md`. Every rule of theirs that survives is in the paragraphs above.

## Today, the raw counts

Measured on 0_agents `7cbc4a5` and magnis-app `dc396a3ee` on 2026-09-17. An agent in a Magnis session may load 56 instruction files, about 6 100 lines. They hold 974 rules (the registers under `docs/research/instruction-registers/` list each with every file it lives in): 336 are stated in two or more files, 59 contradict another rule, 49 name something that does not exist, 57 are about cargo and Rust in a TypeScript project, and the Task format exists in three versions. Memory holds 93 files plus 16 twins in a neighbouring directory. Of the owner's 218 corrections between 19 August and 15 September none became a rule; the skills were last changed on 30 August. At the last end-work, on 17 September, 49 boxes stayed open, 24 of them prose, and the retro's experiment was the ninth in a row without a status.

What already works and stays: the push hook, the draft-without-matrix rule, the ready guard, the pre-approval screen, the three cops, micro-review, `mdurl`.

## Invariants

- `one-home`: no sentence of twelve or more words appears in two instruction files.
- `no-dead-reference`: every path, script and skill an instruction names exists.
- `size`: the always-loaded set plus the two laws and four process skills is at most 900 lines.
- `no-jargon`: the instruction files contain none of the banned words (lane, receipt as a noun for a test result, stand, farm, envelope, ceremony, doctrine, census, plane, currency).
- `language-by-file`: a language guide is named only in a rule that routes by file extension.
- `free-tier`: a Task with five writes, a story naming none of them and a commit touching one more file is accepted and recorded (PR #12).
- `three-tiers-stated`: the process law names the three tiers and the owner's word appears only in the third.
- `boxes-are-commands`: plan-gate refuses a plan whose acceptance box is neither `` `cmd` exits N `` nor `Commit`.
- `strict-skeleton`: plan-gate refuses a plan missing a block of the skeleton.
- `types-shown`: plan-gate refuses a SPEC that adds or changes `.ts` sources and shows no TypeScript.
- `judge-before-owner`: `lock-spec` refuses a SPEC whose hash carries no PASS from `plan-gate --judge`; every answer carries a quote; the rubric file is the only prompt.
- `retro-has-a-status`: end-work refuses closure while the previous Delivery's experiment line has no status.
- `retro-reports-currencies`: an end-work retro without the three numbers is refused by the same check.

The first five are one script, `shared/code-production/instruction-audit.ts`, run by `agent:verify:docs` in 0_agents and red today. The plan-gate and end-work checks are red today too.

## Not in this plan

- The Magnis repository layer: the vocabulary page `docs/project.md`, `CLAUDE.md` (its PGlite line and dead commands), `AGENTS.md`, `.claude/rules/*`, the repo copies of skills and cops, the cargo hook, the docs copies of the laws, the pre-push additions, the re-vendored runtime. It is the next plan in magnis-app and starts when this PR and PR #12 are merged.
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
