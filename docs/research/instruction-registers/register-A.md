# Rule register A — global + skills layer of `~/Coding/0_agents`

Source checkout: `/home/marketing/Coding/0_agents/.worktrees/instructions-by-rule/` (branch `feat/instructions-by-rule`). Paths are relative to that root. `claude/lang` and `codex/lang` are symlinks to `shared/lang`; every `claude/skills/*` and `codex/skills/*` entry named below that also exists under `shared/skills` is a symlink to it, so one home covers both tools. `codex/agents/*-cop.md` are copies of `claude/agents/*-cop.md` with identical line numbers (coherence-cop differs only by `CLAUDE.md` -> `AGENTS.md` wording), so cop homes list the claude copy once. Missing-reference and rust-era notes were verified against `/home/marketing/Coding/magnis-app` and this host on 2026-09-17.

| id | rule (≤ 20 words, plain English, no jargon) | homes (file:line, all of them) | group | note |
|---|---|---|---|---|
| A-001 | Follow the first message's purpose, constraints and skill instructions; otherwise treat the session as normal interactive work. | claude/CLAUDE.md:7-12 | lifecycle |  |
| A-002 | Read the project-local CLAUDE.md or AGENTS.md in cwd or any ancestor before starting a task. | claude/CLAUDE.md:16-17; codex/AGENTS.md:11-13 | lifecycle |  |
| A-003 | Determine the task's languages and read every matching lang guide before editing or reviewing code. | claude/CLAUDE.md:18-19,23-28; codex/AGENTS.md:5-11 | lifecycle |  |
| A-004 | The process has three entrypoints: blueprint plans, blueprint-start executes, end-work closes a merged Delivery. | claude/CLAUDE.md:34-35; codex/AGENTS.md:17-18 | lifecycle |  |
| A-005 | Do not chain auxiliary process skills or require project-specific framework commands. | claude/CLAUDE.md:35-36; codex/AGENTS.md:18-19 | lifecycle | contradicts A-030 |
| A-006 | Skills auto-invoke on triggers: bug reports, task completion, git operations, writing tests, plan-to-code transition, frontend changes, paused plans. | shared/skills/bug/SKILL.md:3; shared/skills/completion-note/SKILL.md:3; shared/skills/git/SKILL.md:3; shared/skills/test-protocol/SKILL.md:3; shared/skills/start-work/SKILL.md:3; claude/skills/verify-frontend/SKILL.md:3; claude/skills/finish-plan/SKILL.md:3 | lifecycle |  |
| A-007 | cleanup-worktrees, quick-fix, plan, review-plan and review-implementation are invoked by the user only, never automatically. | shared/skills/cleanup-worktrees/SKILL.md:5; shared/skills/quick-fix/SKILL.md:3,5; claude/skills/plan/SKILL.md:5; claude/skills/review-plan/SKILL.md:5; claude/skills/review-implementation/SKILL.md:5 | lifecycle |  |
| A-008 | Before executing, work in the plan's existing worktree and confirm the PR is open and the plan APPROVED. | shared/skills/blueprint-start/SKILL.md:14-15 | lifecycle |  |
| A-009 | Run agent-stack check and planctl verify <plan> before executing a plan. | shared/skills/blueprint-start/SKILL.md:15 | lifecycle |  |
| A-010 | Select only dependency-ready Stages to execute. | shared/skills/blueprint-start/SKILL.md:18 | lifecycle |  |
| A-011 | Run planctl start-task <plan> --task <id> before writing RED and follow the printed frozen scope. | shared/skills/blueprint-start/SKILL.md:24-25 | lifecycle |  |
| A-012 | After a Stage is green, remove its registered .tmp/code-production Stage root. | shared/skills/blueprint-start/SKILL.md:31 | lifecycle |  |
| A-013 | Import each Stage result with planctl complete-task and close-stage; checkbox changes ride the next work commit. | shared/skills/blueprint-start/SKILL.md:34-40 | lifecycle |  |
| A-014 | At close, confirm the owner merged; record the PR URL, published head and merge SHA. | shared/skills/end-work/SKILL.md:10-11 | lifecycle |  |
| A-015 | Run the vendored plan-gate with --closure; refuse open Tasks, criteria, invalid receipts or temp leftovers. | shared/skills/end-work/SKILL.md:12-13 | lifecycle |  |
| A-016 | Compare predicted with actual time, credits, rework, review rounds and gates; say whether parallelism helped. | shared/skills/end-work/SKILL.md:14-16 | lifecycle |  |
| A-017 | Post one compact PR retro: what shipped, scope drift, estimate misses, duplicated work, one process experiment. | shared/skills/end-work/SKILL.md:17-18 | lifecycle |  |
| A-018 | Update the project plan ledger if the project has one. | shared/skills/end-work/SKILL.md:19 | lifecycle |  |
| A-019 | Prove the feature worktree is clean and merged, then remove it and only its registered temp roots. | shared/skills/end-work/SKILL.md:20-21 | lifecycle |  |
| A-020 | Implementation and dispatch need a plan with Status: APPROVED; otherwise stop and route to planning. | shared/skills/start-work/SKILL.md:18,39; claude/skills/dispatch-to-linear/SKILL.md:28,52,344,359; claude/skills/execute-from-linear/SKILL.md:26 | lifecycle | contradicts A-286; routes to /spec, a skill that does not exist |
| A-021 | Resolve the plan by explicit path or confirmed conversation context; otherwise ask the operator in plain words. | shared/skills/start-work/SKILL.md:25-37; claude/skills/dispatch-to-linear/SKILL.md:37-52 | lifecycle | start-work:28 cites markdown-view, retired (lib/install.sh:151) |
| A-022 | Never pick a plan by file modification time or "newest file". | shared/skills/start-work/SKILL.md:224; claude/skills/dispatch-to-linear/SKILL.md:340 | lifecycle | contradicts A-447, A-023 |
| A-023 | finish-plan locates the plan as the one just started or the most recently APPROVED. | claude/skills/finish-plan/SKILL.md:26-27 | lifecycle | contradicts A-022 |
| A-024 | Use quick-fix only for one file, at most 10 lines, no new logic, no API or schema change. | shared/skills/quick-fix/SKILL.md:14-21 | lifecycle |  |
| A-025 | quick-fix skips start-work preflight, /plan, /review-implementation and Codex rounds. | shared/skills/quick-fix/SKILL.md:3,31 | lifecycle |  |
| A-026 | If a quick fix grows beyond one file or needs logic or a helper, revert and restart under start-work. | shared/skills/quick-fix/SKILL.md:35-40 | lifecycle |  |
| A-027 | Use fix-ci-cd when an open PR has failing required checks or a shared base branch broke. | shared/skills/fix-ci-cd/SKILL.md:36-38 | lifecycle |  |
| A-028 | Do not use fix-ci-cd to open a fresh PR (that is ship-pr) or for local compile errors. | shared/skills/fix-ci-cd/SKILL.md:40-42 | lifecycle | ship-pr does not exist in this layer |
| A-029 | Invoke execute for overnight or "do not babysit" work; it drives a plan to done unattended. | claude/skills/execute/SKILL.md:3,12 | lifecycle |  |
| A-030 | execute sets up the worktree and TDD via /start-work and delegates the loop to /finish-plan. | claude/skills/execute/SKILL.md:22,27 | lifecycle | contradicts A-005 |
| A-031 | Auto-invoke mdurl on "open in browser", "give me a link", "share this", the Russian equivalents, or $mdurl. | shared/skills/mdurl/SKILL.md:3,10-16 | lifecycle |  |
| A-032 | Auto-invoke nvim when the operator asks to open or edit a file in nvim or wants an editor. | claude/skills/nvim/SKILL.md:3,10-15 | lifecycle |  |
| A-033 | The plan lives at <repo>/docs/plans/<slug>.md, kebab-case, matching the branch name. | shared/skills/blueprint/SKILL.md:8; claude/skills/plan/SKILL.md:92,97; shared/skills/start-work/SKILL.md:42; claude/skills/execute/SKILL.md:18; claude/skills/finish-plan/SKILL.md:26 | plan-writing |  |
| A-034 | Plans change only through planctl; after approval never edit the plan or its checkboxes directly. | claude/CLAUDE.md:36; codex/AGENTS.md:20; shared/skills/blueprint/SKILL.md:9-10,80-81; shared/skills/blueprint-start/SKILL.md:9 | plan-writing |  |
| A-035 | Start a plan with planctl init docs/plans/<slug>.md --title and commit it immediately. | shared/skills/blueprint/SKILL.md:14-17 | plan-writing |  |
| A-036 | Agree on the Goal, user flows, success metrics, constraints, reuse and testable invariants before writing the SPEC. | shared/skills/blueprint/SKILL.md:19-20 | plan-writing |  |
| A-037 | Write the SPEC with planctl set-spec <plan> --from <spec.md>. | shared/skills/blueprint/SKILL.md:21-23 | plan-writing |  |
| A-038 | Open the draft PR once the SPEC is coherent. | shared/skills/blueprint/SKILL.md:25 | plan-writing |  |
| A-039 | Publish the plan with mdurl and give the owner the URL; if mdurl is missing, continue with text. | shared/skills/blueprint/SKILL.md:25,64; claude/skills/plan/SKILL.md:86-88 | plan-writing |  |
| A-040 | Ask whether the owner approves the SPEC; this is a hard stop. | shared/skills/blueprint/SKILL.md:26 | plan-writing | contradicts A-286 |
| A-041 | After an explicit yes, run planctl approve-spec with the owner's words. | shared/skills/blueprint/SKILL.md:27 | plan-writing |  |
| A-042 | A Goal names a concrete deliverable and its measurement, never a vague aim like "make development faster". | shared/skills/blueprint/SKILL.md:29-33 | plan-writing |  |
| A-043 | One Delivery is one PR; each Stage is one delegable result and one work commit. | shared/skills/blueprint/SKILL.md:37-38; shared/skills/blueprint-start/SKILL.md:18-19 | plan-writing |  |
| A-044 | Do not parallelize multiple Deliveries by default. | shared/skills/blueprint/SKILL.md:38 | plan-writing |  |
| A-045 | Give each Stage a result-oriented title, never branch history. | shared/skills/blueprint/SKILL.md:39-40,68-70 | plan-writing |  |
| A-046 | Supply each Stage's owner, dependencies, parallel set, writes and temp root in the put-stage JSON. | shared/skills/blueprint/SKILL.md:40-41 | plan-writing |  |
| A-047 | A Task story names one concrete change and every write path, fits 200 characters, owns at most four writes. | shared/skills/blueprint/SKILL.md:42-43,72-78 | plan-writing |  |
| A-048 | Never point a Task at "the new files", "as discussed", chat history or a colleague's branch. | shared/skills/blueprint/SKILL.md:44-45 | plan-writing |  |
| A-049 | Each Task JSON supplies exact writes, one RED command, predicted minutes and credits, and How. | shared/skills/blueprint/SKILL.md:46-48 | plan-writing |  |
| A-050 | A Task's RED is one exact bun run agent:test:<lane> -- <target> invocation, never agent:verify:pr. | shared/skills/blueprint/SKILL.md:48-50; shared/code-production/package-contract.md:18-19 | plan-writing |  |
| A-051 | Derive each Stage forecast as the Task sum plus an explicit verification share, for minutes and credits. | shared/skills/blueprint/SKILL.md:52-53 | plan-writing |  |
| A-052 | Trace each acceptance story through public calls; a new cross-service method puts its owning file in writes. | shared/skills/blueprint/SKILL.md:54-57 | plan-writing |  |
| A-053 | Stages may run in parallel only when their writes do not overlap; declare dependencies and integration order. | shared/skills/blueprint/SKILL.md:58-59; shared/skills/blueprint-start/SKILL.md:18-19 | plan-writing |  |
| A-054 | Add Stages through planctl put-stage JSON; do not hand-author implementation Markdown. | shared/skills/blueprint/SKILL.md:60-61 | plan-writing |  |
| A-055 | Check every Goal, flow and invariant is covered, each Task is independently executable, the critical path explicit. | shared/skills/blueprint/SKILL.md:62-63 | plan-writing |  |
| A-056 | Ask whether the owner approves the complete plan; this is the second hard stop. | shared/skills/blueprint/SKILL.md:64-65 | plan-writing |  |
| A-057 | After an explicit yes, run planctl approve-plan with the owner's words. | shared/skills/blueprint/SKILL.md:66 | plan-writing |  |
| A-058 | A plan must be complete enough for an agent to execute it without further questions. | claude/skills/plan/SKILL.md:13 | plan-writing |  |
| A-059 | Before planning read CLAUDE.md, AGENTS.md, docs/testing/e2e-standard.md, policy.md, docs/backend/testing.md, docs/architecture.md. | claude/skills/plan/SKILL.md:17-25 | plan-writing | plan:22 names TestCore and SyncE2EHarness, which no longer exist; plan:25 cites rust-rules (rust-era) |
| A-060 | Write a numbered user scenario scn_<module>_<feature>_001 and decompose it into testable layers. | claude/skills/plan/SKILL.md:30,33 | plan-writing | contradicts A-171 (format scn_<domain>_<nnn>) |
| A-061 | Ask: no new files? no new abstractions? reuse existing mocks? smallest full change? what NOT to do? | claude/skills/plan/SKILL.md:36-40 | plan-writing |  |
| A-062 | List every file with CREATE or MODIFY, what and why, grouped by layer. | claude/skills/plan/SKILL.md:43; claude/skills/review-plan/SKILL.md:73-74 | plan-writing |  |
| A-063 | Put mermaid lifecycle and flow diagrams with explicit decision branches inside the plan for non-trivial flows. | claude/skills/plan/SKILL.md:46-50 | plan-writing |  |
| A-064 | Diagrams must show every state's exit, destructive transitions, identity, dependency direction and undo; else fix the design. | claude/skills/plan/SKILL.md:59-66 | plan-writing |  |
| A-065 | Specify tests as step-by-step behavioral scenarios, not pseudocode. | claude/skills/plan/SKILL.md:72; claude/skills/review-plan/SKILL.md:74-75 | plan-writing |  |
| A-066 | The plan has a worktree section, a staged order with dependencies, and an autonomous execution contract. | claude/skills/plan/SKILL.md:75-81 | plan-writing |  |
| A-067 | Present the plan as one document with sections 1-9; do not start implementation. | claude/skills/plan/SKILL.md:85 | plan-writing |  |
| A-068 | Never write plans to ~/.claude/plans/, <repo>/.claude/plans/, .claude/temp/ or sibling-repo copies. | claude/skills/plan/SKILL.md:93 | plan-writing | contradicts A-447, A-324 |
| A-069 | A plan found elsewhere is moved to docs/plans/ and the copy deleted; keep one file only. | claude/skills/plan/SKILL.md:94 | plan-writing |  |
| A-070 | If already in a worktree, write the plan inside it so it travels with the branch. | claude/skills/plan/SKILL.md:95 | plan-writing |  |
| A-071 | The plan is the first commit on the feature branch. | shared/skills/start-work/SKILL.md:74,105,225; shared/skills/blueprint/SKILL.md:17; claude/skills/plan/SKILL.md:95-96; claude/skills/dispatch-to-linear/SKILL.md:105 | plan-writing |  |
| A-072 | After 5 edits to one plan file in a session, stop, dump pending revisions and ask the user. | claude/skills/plan/SKILL.md:108 | plan-writing |  |
| A-073 | New plans use the marked planctl format; every locked mutation requires its journal. | shared/code-production/package-contract.md:55-56 | plan-writing |  |
| A-074 | Markerless legacy plans stay frozen: protected text changes only when the same commit adds an owner Amendment. | shared/code-production/package-contract.md:56-59 | plan-writing |  |
| A-075 | Agents never merge to staging or main; the owner merges. | claude/CLAUDE.md:37-38; codex/AGENTS.md:21; shared/skills/git/SKILL.md:87-90,175; shared/skills/start-work/SKILL.md:200,227; shared/skills/blueprint-start/SKILL.md:66; shared/skills/end-work/SKILL.md:11; shared/skills/fix-ci-cd/SKILL.md:202-203; claude/skills/execute/SKILL.md:79; claude/skills/finish-plan/SKILL.md:69,82; claude/skills/execute-from-linear/SKILL.md:153,178; claude/skills/dispatch-to-linear/SKILL.md:156 | git |  |
| A-076 | Never rewrite history: no rebase, amend, force push, filter-branch, public resets or pre-PR squash. | claude/CLAUDE.md:41; shared/skills/git/SKILL.md:10-11,97-109; shared/skills/blueprint-start/SKILL.md:16; claude/skills/execute-from-linear/SKILL.md:182-183; claude/skills/dispatch-to-linear/SKILL.md:348 | git | contradicts A-109, A-110, A-111 |
| A-077 | Rewrite history only when the user explicitly says "rewrite this", under their direction. | shared/skills/git/SKILL.md:111-112 | git |  |
| A-078 | Feature work happens in a worktree on a dedicated branch; never implement in the main tree. | shared/skills/git/SKILL.md:15; shared/skills/start-work/SKILL.md:20,67,226; shared/skills/quick-fix/SKILL.md:25-27; shared/skills/blueprint/SKILL.md:14 | git | contradicts A-397 |
| A-079 | Branch names are feat/, fix/, refactor/, chore/<topic> or task/<id>-<topic>; no random hashes. | shared/skills/git/SKILL.md:16-17; shared/skills/start-work/SKILL.md:72,115-116 | git |  |
| A-080 | One agent = one worktree = one branch; never share. | shared/skills/git/SKILL.md:18; shared/skills/start-work/SKILL.md:73 | git |  |
| A-081 | Branch off origin/staging, never main and never the stale local staging ref. | shared/skills/git/SKILL.md:19; shared/skills/start-work/SKILL.md:76-79,222; shared/skills/blueprint/SKILL.md:14; claude/skills/dispatch-to-linear/SKILL.md:76 | git |  |
| A-082 | Worktrees live at .worktrees/<slug>/ inside the repo root, gitignored and local-only. | shared/skills/start-work/SKILL.md:71,118 | git |  |
| A-083 | Before creating a new worktree, commit uncommitted work and push unpushed commits in the current one. | shared/skills/start-work/SKILL.md:19,45-59,221 | git |  |
| A-084 | Push the new branch with -u right after the plan commit so the work exists off this disk. | shared/skills/start-work/SKILL.md:107-108 | git |  |
| A-085 | Moving the untracked plan file into the new worktree is the only file move allowed between trees. | shared/skills/start-work/SKILL.md:111-113; claude/skills/plan/SKILL.md:96 | git |  |
| A-086 | If already in a worktree, verify the plan commit is at the head of the branch; add it if not. | shared/skills/start-work/SKILL.md:120 | git |  |
| A-087 | Commit once after each completed Stage of an approved plan. | shared/skills/git/SKILL.md:25; shared/skills/blueprint-start/SKILL.md:32; shared/skills/start-work/SKILL.md:164; claude/skills/execute/SKILL.md:52; claude/skills/finish-plan/SKILL.md:68 | git |  |
| A-088 | Commit when the user explicitly asks. | shared/skills/git/SKILL.md:26 | git |  |
| A-089 | WIP commits as recovery points are valid and encouraged; messy WIP chains stay messy. | shared/skills/git/SKILL.md:27-28,108-109 | git |  |
| A-090 | Every commit message explains why, not just what; non-trivial commits carry a body. | shared/skills/git/SKILL.md:32-39,66-78 | git | contradicts A-093 |
| A-091 | Use Conventional Commit prefixes feat, fix, refactor, test, docs, chore, wip with a scope. | shared/skills/git/SKILL.md:51-59; shared/skills/start-work/SKILL.md:173; shared/skills/quick-fix/SKILL.md:30; shared/skills/blueprint-start/SKILL.md:32; claude/skills/finish-plan/SKILL.md:68 | git | contradicts A-094, A-421 |
| A-092 | Imperative mood, lowercase first character, subject under about 72 characters. | shared/skills/git/SKILL.md:61-62 | git |  |
| A-093 | Stage commits read "feat(module): ... [Stage N/M]" with a body listing plan stages and changes. | shared/skills/start-work/SKILL.md:171-186; claude/skills/finish-plan/SKILL.md:68-69 | git | contradicts A-090 |
| A-094 | The plan commit message is "plan(<slug>): approved spec", optionally with a one-line summary. | shared/skills/start-work/SKILL.md:105; claude/skills/dispatch-to-linear/SKILL.md:105,221 | git | contradicts A-091 (plan is not a listed prefix) |
| A-095 | Merges use merge commits, never squash or rebase-merge. | shared/skills/git/SKILL.md:84-85 | git |  |
| A-096 | feat/* merges into staging via PR by the user after review; staging merges into main by the user manually. | shared/skills/git/SKILL.md:87-90 | git |  |
| A-097 | Never push to main or staging directly; only via PR. | shared/skills/git/SKILL.md:175-176; claude/skills/execute-from-linear/SKILL.md:180 | git |  |
| A-098 | Never delete branches you did not create; the user controls cleanup. | shared/skills/git/SKILL.md:177 | git |  |
| A-099 | Never move code between trees with cp or git checkout <branch> -- <files>; use git merge. | shared/skills/git/SKILL.md:178-180; shared/skills/start-work/SKILL.md:228; shared/skills/blueprint-start/SKILL.md:51 | git |  |
| A-100 | Before executing, merge origin/staging into the feature branch without rewriting history, then run agent:install. | shared/skills/blueprint-start/SKILL.md:16-17 | git | contradicts A-109 (which says the hook bans this merge) |
| A-101 | Before opening a PR, fetch and inspect staging..HEAD; read, do not rebase; if far behind, ask the user. | shared/skills/git/SKILL.md:118-123 | git | contradicts A-109 |
| A-102 | Push the feature branch before opening the PR. | shared/skills/git/SKILL.md:125 | git |  |
| A-103 | The PR title is in Conventional Commit format and becomes the merge commit subject. | shared/skills/git/SKILL.md:126-128 | git |  |
| A-104 | Push the exact green head once; the push reuses its local receipt and CI verifies the published SHA. | shared/skills/blueprint-start/SKILL.md:62-63 | git | contradicts A-418 |
| A-105 | Never leave a finished branch unpushed; an unpushed branch is indistinguishable from lost work. | shared/skills/start-work/SKILL.md:196-198,223 | git |  |
| A-106 | After the merge, confirm the branch tip is an ancestor of origin/staging; stacked PRs can miss staging. | shared/skills/start-work/SKILL.md:202-217 | git |  |
| A-107 | Research history with git log --grep, -S, -p, blame and show before implementing something like past work. | shared/skills/git/SKILL.md:156-171 | git |  |
| A-108 | The integrator merges returned Stage commits into the Delivery tree and records their results. | shared/skills/blueprint-start/SKILL.md:50-51 | git |  |
| A-109 | To reproduce CI's merge ref, rebase onto origin/<base>; the hook bans merging the base inside a worktree. | shared/skills/fix-ci-cd/SKILL.md:106-113,218 | git | contradicts A-076, A-100, A-101 |
| A-110 | After a rebase, re-check that revert commits were not skipped; re-apply missing config blocks. | shared/skills/fix-ci-cd/SKILL.md:119-123 | git | contradicts A-076; rust-era (profile.release linker block) |
| A-111 | After a rebase, push with --force-with-lease; never bare --force. | shared/skills/fix-ci-cd/SKILL.md:174-181,219 | git | contradicts A-076 |
| A-112 | cleanup-worktrees shows a dry-run plan first and acts only after explicit approval. | shared/skills/cleanup-worktrees/SKILL.md:10-11,34,37,51,56-57 | git |  |
| A-113 | Fetch origin first; every "is it merged?" question is asked against origin/staging, never a local ref. | shared/skills/cleanup-worktrees/SKILL.md:15-17 | git |  |
| A-114 | Classify worktrees as prunable, merged, stale (14 days and worktree-agent-* name), unpublished, or keep. | shared/skills/cleanup-worktrees/SKILL.md:19-33 | git |  |
| A-115 | Never remove a worktree whose commits are on no remote; offer git push -u instead. | shared/skills/cleanup-worktrees/SKILL.md:31-32,35-36,47-49 | git |  |
| A-116 | Never remove a worktree with uncommitted changes; report it and skip. | shared/skills/cleanup-worktrees/SKILL.md:46 | git |  |
| A-117 | Never touch the main or integration working directories. | shared/skills/cleanup-worktrees/SKILL.md:45 | git |  |
| A-118 | Never force-delete a branch with -D; use -d and let git refuse if unmerged. | shared/skills/cleanup-worktrees/SKILL.md:50; claude/skills/execute-from-linear/SKILL.md:183 | git | contradicts A-401 |
| A-119 | On approval: worktree prune, worktree remove then branch -d, unlocking auto-named locked worktrees first. | shared/skills/cleanup-worktrees/SKILL.md:39-41 | git |  |
| A-120 | Project verification runs only through the Bun agent:* scripts; never compose framework commands or other package managers. | claude/CLAUDE.md:36-37; codex/AGENTS.md:18-21; shared/skills/blueprint/SKILL.md:8-9; shared/skills/blueprint-start/SKILL.md:9-10,60-61 | verification | contradicts A-147, A-139, A-448, A-339 |
| A-121 | Before a Stage commit run only the Stage's 1-3 named behavior test files. | claude/CLAUDE.md:50; shared/skills/blueprint-start/SKILL.md:28-29 | verification | contradicts A-123 |
| A-122 | The complete suite runs once at PR publication via agent:verify:pr; CI repeats it on the published SHA. | claude/CLAUDE.md:50-52; shared/skills/blueprint-start/SKILL.md:60-62; shared/code-production/package-contract.md:13; shared/skills/start-work/SKILL.md:190; shared/skills/fast-precommit/SKILL.md:10,58; shared/skills/git/SKILL.md:124; claude/skills/finish-plan/SKILL.md:33-34 | verification |  |
| A-123 | Run the full test suite after every stage or bug fix to catch regressions. | shared/skills/start-work/SKILL.md:156; shared/skills/bug/SKILL.md:34; claude/skills/execute-from-linear/SKILL.md:102; claude/skills/finish-plan/SKILL.md:31; claude/skills/execute/SKILL.md:28 | verification | contradicts A-121 |
| A-124 | Use scoped fast-precommit checks on every per-stage commit in a worktree. | shared/skills/fast-precommit/SKILL.md:3,10 | verification |  |
| A-125 | At Deliver run bun run agent:install, then .githooks/pre-push once. | shared/skills/blueprint-start/SKILL.md:60 | verification |  |
| A-126 | Fix a real CI failure locally with its exact command before one new push; never push to see. | shared/skills/blueprint-start/SKILL.md:64-65; shared/skills/fix-ci-cd/SKILL.md:12-17,133-135,172,205-211 | verification |  |
| A-127 | Read the actual CI failure logs first; the reported cause is a hypothesis, not a diagnosis. | shared/skills/fix-ci-cd/SKILL.md:46-51,215 | verification |  |
| A-128 | Check whether the failing file is in git diff BASE...HEAD; if not, the base branch is broken. | shared/skills/fix-ci-cd/SKILL.md:80-95,217 | verification |  |
| A-129 | A passing compile or typecheck proves the code builds, not that it behaves; run what CI ran. | shared/skills/fix-ci-cd/SKILL.md:22-26,216 | verification | rust-era (cargo check vs cargo test) |
| A-130 | Fix one failure class per push; never batch fixes you have not reproduced. | shared/skills/fix-ci-cd/SKILL.md:125,194-195 | verification |  |
| A-131 | Run the exact failing test first, the whole affected suite second, push third. | shared/skills/fix-ci-cd/SKILL.md:147-149,210 | verification |  |
| A-132 | After pushing, watch the run for that SHA to completion before reporting a result. | shared/skills/fix-ci-cd/SKILL.md:183-192,211 | verification |  |
| A-133 | A PR is green only when every required check succeeds for the latest SHA, E2E and platform builds included. | shared/skills/fix-ci-cd/SKILL.md:199-201,220 | verification |  |
| A-134 | For a real product bug, fix the source, not the test; confirm against a sibling implementation. | shared/skills/fix-ci-cd/SKILL.md:164-166 | verification |  |
| A-135 | For a stale test premise, fix the test and leave a comment naming the commit that changed it. | shared/skills/fix-ci-cd/SKILL.md:167-170 | verification |  |
| A-136 | For API drift in tests, update call sites to the pattern sibling tests already use. | shared/skills/fix-ci-cd/SKILL.md:161-163 | verification |  |
| A-137 | Staging must be green before feature work starts; fix staging first. | shared/skills/start-work/SKILL.md:21,239 | verification | contradicts A-409 |
| A-138 | Preflight is tiered: trivial skips; standard checks the touched crate or frontend; large runs the full suite. | shared/skills/start-work/SKILL.md:122-144 | verification | rust-era (cargo check --workspace); cites agent/, which does not exist in magnis-app |
| A-139 | Frontend-only changes run cd frontend && bun run typecheck && lint && test --changed. | shared/skills/fast-precommit/SKILL.md:16-19; shared/skills/start-work/SKILL.md:159 | verification | contradicts A-120 |
| A-140 | Agent-only changes run cd agent && bun run typecheck && test. | shared/skills/fast-precommit/SKILL.md:21-24; shared/skills/start-work/SKILL.md:140-141,190 | verification | agent/ directory does not exist in magnis-app |
| A-141 | One Rust crate runs cargo fmt --check, clippy -D warnings and test with -p <crate>. | shared/skills/fast-precommit/SKILL.md:26-31; shared/skills/start-work/SKILL.md:160 | verification | rust-era |
| A-142 | Cross-cutting changes (core, db, migrations, Cargo.lock, 3+ modules, public API) run the full workspace. | shared/skills/fast-precommit/SKILL.md:3,33-40,51-54; shared/skills/start-work/SKILL.md:161 | verification | rust-era |
| A-143 | If a scoped check fails, fix it and re-run only the failed check. | shared/skills/fast-precommit/SKILL.md:47 | verification |  |
| A-144 | For a quick fix run only the directly affected test file; cosmetic changes with no test need no run. | shared/skills/quick-fix/SKILL.md:29 | verification |  |
| A-145 | Verify with the project's real commands named in the plan's acceptance criteria. | claude/skills/finish-plan/SKILL.md:70-71 | verification | rust-era mention (fmt/clippy) |
| A-146 | After all stages, run the plan's acceptance criteria and failure matrix and fix anything red. | claude/skills/finish-plan/SKILL.md:33-34; claude/skills/execute/SKILL.md:29 | verification |  |
| A-147 | TypeScript verification is bun run typecheck, bun run lint, bun run test. | shared/lang/typescript.md:83-87 | verification | contradicts A-120 |
| A-148 | App-visible frontend changes need a real browser check; typecheck, build and unit tests do not prove UI. | shared/lang/typescript.md:89-91; shared/skills/completion-note/SKILL.md:35-39,54,60-61; claude/skills/verify-frontend/SKILL.md:12-14,99-100 | verification |  |
| A-149 | Verification follows change type: backend invariants plus tests, integration via mocks, FE logic bun checks, FE visible Playwright, agent gates. | shared/skills/completion-note/SKILL.md:47-55 | verification | rust-era (cargo); TestCore does not exist |
| A-150 | Every Rust change runs cargo fmt --check, clippy --workspace -D warnings and cargo test --workspace. | shared/lang/rust.md:5-12 | verification | rust-era |
| A-151 | verify-app runs all configured steps even if earlier ones fail and reports every failure. | shared/skills/verify-app/SKILL.md:75-76 | verification |  |
| A-152 | Do not skip a verification step because "it would pass"; run it. | shared/skills/verify-app/SKILL.md:77 | verification |  |
| A-153 | verify-app never edits source files; it is a verifier, not a fixer. | shared/skills/verify-app/SKILL.md:74 | verification |  |
| A-154 | Count warnings from verification output where applicable. | shared/skills/verify-app/SKILL.md:78 | verification |  |
| A-155 | If SCREENSHOT_CMD is unset, verify-frontend reports SKIPPED and asks a human to verify visually. | claude/skills/verify-frontend/SKILL.md:36-37 | verification |  |
| A-156 | Launch the E2E stack through the repo launcher script in tmux; the launcher output is the source of truth. | codex/skills/launch-e2e/SKILL.md:10-12,35-37,49 | verification |  |
| A-157 | If a spec was passed, the launcher already ran it; do not rerun Playwright manually unless debugging. | codex/skills/launch-e2e/SKILL.md:61 | verification |  |
| A-158 | Define numbered testable invariants before writing any code. | claude/CLAUDE.md:45-46; claude/skills/plan/SKILL.md:69; shared/skills/completion-note/SKILL.md:51 | tdd |  |
| A-159 | Every non-trivial invariant maps to a numbered test; tests and code are bidirectionally traceable. | shared/skills/test-protocol/SKILL.md:10 | tdd |  |
| A-160 | Write a RED test that fails on current code; if it passes immediately, rewrite it. | claude/CLAUDE.md:47-48; shared/skills/bug/SKILL.md:26,29,43-44; shared/skills/start-work/SKILL.md:151-152,230; shared/skills/blueprint-start/SKILL.md:26; claude/skills/execute-from-linear/SKILL.md:100,112,172; claude/skills/finish-plan/SKILL.md:31; claude/skills/execute/SKILL.md:28; claude/agents/coverage-cop.md:53 | tdd |  |
| A-161 | RED must fail for missing behavior, not for syntax, dependencies or environment. | shared/skills/blueprint-start/SKILL.md:26-27 | tdd |  |
| A-162 | Implement the minimum code that makes the test GREEN. | claude/CLAUDE.md:49; shared/skills/start-work/SKILL.md:154; shared/skills/blueprint-start/SKILL.md:28; shared/skills/bug/SKILL.md:32-33; claude/skills/execute-from-linear/SKILL.md:101; claude/skills/finish-plan/SKILL.md:31 | tdd |  |
| A-163 | Only a skill may announce a RED bypass ("Skipping red test: <reason>" for 3-line typos); never skip on your own. | claude/CLAUDE.md:53-55; shared/skills/bug/SKILL.md:47 | tdd |  |
| A-164 | For a bug, trace the code path and explain the root cause in 2-3 sentences before testing. | shared/skills/bug/SKILL.md:19-21 | tdd |  |
| A-165 | The bug test asserts the correct behavior and reproduces the exact scenario, one test per bug. | shared/skills/bug/SKILL.md:24-25,45 | tdd |  |
| A-166 | Prefer unit tests over e2e when the bug is in logic, not rendering. | shared/skills/bug/SKILL.md:46; shared/skills/test-protocol/SKILL.md:102 | tdd |  |
| A-167 | Every bug fix gets a regression test at the closest valid layer that fails on the broken code. | claude/agents/coverage-cop.md:17,52-53; shared/skills/test-protocol/SKILL.md:99-103 | tdd |  |
| A-168 | Do not close a bug as fixed on code inspection alone. | shared/skills/test-protocol/SKILL.md:104 | tdd |  |
| A-169 | When a test fails unexpectedly, investigate the root cause; never comment it out or fake green. | shared/skills/start-work/SKILL.md:238; claude/skills/finish-plan/SKILL.md:41-42; claude/skills/execute/SKILL.md:64-65 | tdd |  |
| A-170 | Test IDs are tst_<layer>_<area>_<nnn>: lowercase snake_case, immutable, the first stable token of the test name. | shared/skills/test-protocol/SKILL.md:14-38 | tdd |  |
| A-171 | Scenario IDs are scn_<domain>_<nnn>; scenarios describe behavior and may map to many tests. | shared/skills/test-protocol/SKILL.md:42-45 | tdd | contradicts A-060 |
| A-172 | Non-trivial tests carry @test-id, @scenario, @covers, @deterministic and @fixtures near the definition. | shared/skills/test-protocol/SKILL.md:49-57 | tdd |  |
| A-173 | Playwright tests also carry @video-mode and @manual-flow. | shared/skills/test-protocol/SKILL.md:59-64 | tdd |  |
| A-174 | Annotate state transitions, merge, routing, gates, sync loops and normalization with @tested-by and @invariant; not getters. | shared/skills/test-protocol/SKILL.md:68-76 | tdd |  |
| A-175 | Automated suites never use live providers, real OAuth, unbounded wall-clock timing, unseeded randomness or stray file writes. | shared/skills/test-protocol/SKILL.md:81-85; claude/agents/coverage-cop.md:60; shared/skills/completion-note/SKILL.md:52 | tdd |  |
| A-176 | Automated suites may use real SQLite in temp dirs, real migrations, in-process wiring, fixture runtimes and captured payloads. | shared/skills/test-protocol/SKILL.md:88-92 | tdd | rust-era (SQLite was the Rust backend's store; magnis now runs PGlite/Postgres) |
| A-177 | Tests hitting live systems are marked manual and never serve as the main correctness signal. | shared/skills/test-protocol/SKILL.md:95 | tdd |  |
| A-178 | Each test states its environment, clients, mocks and data in a comment block. | shared/skills/test-protocol/SKILL.md:124-130 | tdd |  |
| A-179 | Explore before editing: read relevant files and grep for existing patterns; never guess ownership or architecture. | claude/CLAUDE.md:59-60; shared/skills/blueprint/SKILL.md:19; claude/agents/coherence-cop.md:16,38 | code-quality |  |
| A-180 | Never add fallbacks, defaults, safety nets or "just in case" code that was not requested; surface the missing value. | claude/CLAUDE.md:61-63; shared/skills/start-work/SKILL.md:231; claude/agents/simplicity-cop.md:21,49; claude/skills/execute-from-linear/SKILL.md:101; shared/skills/git/SKILL.md:152 | code-quality |  |
| A-181 | When docs and code differ, prefer the code and call out the drift. | claude/CLAUDE.md:64-65 | code-quality |  |
| A-182 | Code whose output must be reproducible gives the same output for the same inputs; use stable sorts with explicit tie-breakers. | shared/lang/rust.md:26-33 | code-quality |  |
| A-183 | Edit plan files with targeted old/new strings, not full-file rewrites. | claude/skills/plan/SKILL.md:105 | code-quality |  |
| A-184 | Prefer bun for new projects; respect the package manager the project already uses. | shared/lang/typescript.md:3-4 | language-style |  |
| A-185 | No any, ever: no as any, Array<any>, Record<string, any>; use unknown, generics, unions or JsonValue. | shared/lang/typescript.md:8-10; claude/agents/coherence-cop.md:78 | language-style |  |
| A-186 | Explicit return types on all exported functions; local helpers may infer. | shared/lang/typescript.md:11-12 | language-style |  |
| A-187 | No @ts-ignore or @ts-nocheck; non-null ! only for React refs after a guard. | shared/lang/typescript.md:13-14 | language-style |  |
| A-188 | Union switches are exhaustive through an assertNever(value: never) helper. | shared/lang/typescript.md:15 | language-style |  |
| A-189 | catch variables are always unknown; narrow before use. | shared/lang/typescript.md:16 | language-style |  |
| A-190 | tsconfig requires strict, noImplicitAny, useUnknownInCatchVariables, noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitReturns, noFallthroughCasesInSwitch. | shared/lang/typescript.md:18-32 | language-style |  |
| A-191 | Use function declarations for top-level exports; arrow functions only for callbacks. | shared/lang/typescript.md:36-37 | language-style |  |
| A-192 | Use type for unions, intersections and branded IDs; interface for extendable object shapes. | shared/lang/typescript.md:38-39 | language-style |  |
| A-193 | No enum; use string unions. | shared/lang/typescript.md:40-41; claude/agents/coherence-cop.md:77 | language-style |  |
| A-194 | Named exports only; default exports only where a framework requires them. | shared/lang/typescript.md:42-43; claude/agents/coherence-cop.md:76 | language-style |  |
| A-195 | ES modules only; never require(). | shared/lang/typescript.md:44 | language-style |  |
| A-196 | Use import type for type-only imports. | shared/lang/typescript.md:45 | language-style |  |
| A-197 | Import order: built-in, external, internal, parent/sibling, then type imports. | shared/lang/typescript.md:46-47 | language-style |  |
| A-198 | Use branded ID types (Brand<T, B>) so one ID kind cannot be passed as another. | shared/lang/typescript.md:51-59 | language-style |  |
| A-199 | Type unknown JSON payloads as JsonValue, not any or bare unknown. | shared/lang/typescript.md:61-73 | language-style |  |
| A-200 | One React component per file; the only other export is its props interface. | shared/lang/typescript.md:77; claude/agents/simplicity-cop.md:57 | language-style |  |
| A-201 | No helper functions in component files; extract to helpers.ts or a hook. | shared/lang/typescript.md:78 | language-style |  |
| A-202 | Components are thin orchestrators that compose hooks and wire outputs to JSX. | shared/lang/typescript.md:79 | language-style |  |
| A-203 | Use thiserror for typed domain errors; no raw string errors cross module boundaries. | shared/lang/rust.md:15-16 | language-style | rust-era |
| A-204 | Domain layers expose typed errors; the transport layer translates them; never leak raw DB errors. | shared/lang/rust.md:17-20 | language-style | rust-era |
| A-205 | anyhow only for binary entry points and orchestration glue, never library APIs. | shared/lang/rust.md:21-22 | language-style | rust-era |
| A-206 | Use BTreeMap or IndexMap instead of HashMap when iteration order matters; never rely on HashSet order. | shared/lang/rust.md:29-32,35 | language-style | rust-era |
| A-207 | The runtime is tokio: one global runtime with the default work-stealing scheduler. | shared/lang/rust.md:39 | language-style | rust-era |
| A-208 | Never call block_on inside async code; use spawn_blocking for sync or CPU-bound work. | shared/lang/rust.md:40-42 | language-style | rust-era |
| A-209 | Prefer async fn in trait definitions when the language version permits. | shared/lang/rust.md:43 | language-style | rust-era |
| A-210 | Prefer bounded tokio channels over unbounded ones for natural backpressure. | shared/lang/rust.md:44-46 | language-style | rust-era |
| A-211 | Public library types get /// doc comments describing invariants and intended use. | shared/lang/rust.md:50-51 | language-style | rust-era |
| A-212 | Prefer constructors that validate invariants over public field mutation. | shared/lang/rust.md:52 | language-style | rust-era |
| A-213 | Match exhaustively; avoid _ => arms unless the type is genuinely open. | shared/lang/rust.md:53-54 | language-style | rust-era |
| A-214 | use declarations go at the top of their module, never inside functions or impl blocks. | shared/lang/rust.md:58-61 | language-style | rust-era |
| A-215 | Import types at module scope and use short names; never repeat long absolute paths in items. | shared/lang/rust.md:62-66 | language-style | rust-era |
| A-216 | Alias same-named imports with use path::Type as DescriptiveType and use the alias consistently. | shared/lang/rust.md:67-68 | language-style | rust-era |
| A-217 | Keep a fully qualified path only when Rust requires it; make any exception clear in the code. | shared/lang/rust.md:69-72 | language-style | rust-era |
| A-218 | cargo fmt on save; clippy -D warnings enforced in CI; cargo-nextest when the project supports it. | shared/lang/rust.md:86-88 | language-style | rust-era |
| A-219 | Each cop's default verdict is REJECT until the change proves otherwise. | claude/agents/coherence-cop.md:10; claude/agents/coverage-cop.md:10; claude/agents/simplicity-cop.md:10 | review |  |
| A-220 | Search for existing patterns before approving new code; no search evidence means REJECT. | claude/agents/coherence-cop.md:16,21-34,38,110 | review |  |
| A-221 | Similar logic or utility anywhere (utils, shared, common, lib) means REJECT: reuse the existing one. | claude/agents/coherence-cop.md:18,39 | review |  |
| A-222 | A new logger, HTTP client or validator instead of the project's existing one is REJECT. | claude/agents/coherence-cop.md:40 | review |  |
| A-223 | Naming must follow the project's existing convention. | claude/agents/coherence-cop.md:41 | review |  |
| A-224 | A wrapper around something that already has a wrapper is REJECT. | claude/agents/coherence-cop.md:42 | review |  |
| A-225 | Read CLAUDE.md, AGENTS.md and project docs for layer rules before reviewing. | claude/agents/coherence-cop.md:46,72; claude/skills/review-implementation/SKILL.md:49 | review |  |
| A-226 | Reject low-level importing high-level, infra leaking into domain, unjustified dependency directions, cycles, cross-feature private imports. | claude/agents/coherence-cop.md:17,19,49-53 | review |  |
| A-227 | Presentation skipping the controller or view-model to call a repository directly is REJECT. | claude/agents/coherence-cop.md:54 | review |  |
| A-228 | Typical layers: View to Controller to Service to Repository; anything to utils; domain to primitives; the project table wins. | claude/agents/coherence-cop.md:56-72 | review |  |
| A-229 | Each cop reports in its fixed VERDICT block with evidence tables and required fixes. | claude/agents/coherence-cop.md:80-106; claude/agents/coverage-cop.md:73-101; claude/agents/simplicity-cop.md:68-93 | review |  |
| A-230 | Every new public function has at least one test; modified functions get their tests updated. | claude/agents/coverage-cop.md:16,18,44-45 | review |  |
| A-231 | Edge cases (null, empty, boundary) and error paths must be tested; happy-path-only coverage is REJECT. | claude/agents/coverage-cop.md:19,46-48 | review |  |
| A-232 | Pre-review lists changed source files and checks that a companion test file exists for each. | claude/agents/coverage-cop.md:23-40 | review |  |
| A-233 | A regression test's name describes the bug prevented; check adjacent code for similar bugs. | claude/agents/coverage-cop.md:54-55 | review |  |
| A-234 | Tests are independent, deterministic and assert meaningfully; they cover the contract, not implementation details. | claude/agents/coverage-cop.md:59-62 | review |  |
| A-235 | Coverage thresholds: 100% of new functions tested (warn at 80%), 2+ edge cases each, error paths covered. | claude/agents/coverage-cop.md:64-71 | review |  |
| A-236 | New abstractions are guilty until proven necessary; speculative flexibility and "future" cases are defects. | claude/agents/simplicity-cop.md:16-17,44 | review |  |
| A-237 | Every new file is a tax; if code fits an existing file, reject the new one; consolidation over creation. | claude/agents/simplicity-cop.md:18-20; claude/skills/plan/SKILL.md:36 | review |  |
| A-238 | Pre-review greps changed files for speculative patterns and counts new files and their line counts. | claude/agents/simplicity-cop.md:25-36 | review |  |
| A-239 | Reject cyclomatic complexity over 10, nesting over 4, more than 2 layers of indirection; flag functions over 50 lines. | claude/agents/simplicity-cop.md:40-41,45-46,65-66 | review |  |
| A-240 | An interface, trait or abstract class with one implementation is REJECT unless a test seam or stable contract. | claude/agents/simplicity-cop.md:42 | review |  |
| A-241 | A generic parameter used in one place is REJECT; use the concrete type. | claude/agents/simplicity-cop.md:43 | review |  |
| A-242 | A wrapper around a single function is REJECT (inline it); a builder for 3 or fewer fields is REJECT. | claude/agents/simplicity-cop.md:47-48 | review |  |
| A-243 | unwrap_or, ?? or similar that hides missing data instead of surfacing an error is flagged. | claude/agents/simplicity-cop.md:50 | review |  |
| A-244 | Reject new files under 30 lines, types-only files, or PRs adding more than 3 files without justification. | claude/agents/simplicity-cop.md:54-56,63-64 | review |  |
| A-245 | Review each Stage diff for exact declared writes, reuse, duplication and accidental fallbacks. | shared/skills/blueprint-start/SKILL.md:30-31 | review |  |
| A-246 | Run a Codex review pass only for diffs over 200 lines, public API changes, or when asked. | shared/skills/fast-precommit/SKILL.md:42-45; shared/skills/start-work/SKILL.md:162 | review |  |
| A-247 | Run review-implementation after the Integration Stage made the exact head green; it reuses that verification. | claude/skills/review-implementation/SKILL.md:13-15 | review |  |
| A-248 | Use the active plan in the conversation to understand the intent of the reviewed change. | claude/skills/review-implementation/SKILL.md:46-47 | review |  |
| A-249 | Review runs no product suites; the Delivery receipt at code-production/verify-pr.sha must equal HEAD or review stops. | claude/skills/review-implementation/SKILL.md:53-61; shared/code-production/package-contract.md:27-28 | review |  |
| A-250 | Any review fix changes HEAD and invalidates the receipt; never buy a second copy of the suites. | claude/skills/review-implementation/SKILL.md:63-65 | review |  |
| A-251 | review-implementation never fixes; the caller runs the fix loop and must re-call it after fixes. | claude/skills/review-implementation/SKILL.md:17-18,26-28,144 | review |  |
| A-252 | Launch coherence-cop, coverage-cop and simplicity-cop in parallel and collect their verdicts. | claude/skills/review-implementation/SKILL.md:68-74 | review | cites the "Task tool", which is now named Agent |
| A-253 | Call mcp__codex__codex for correctness, invariants, security, data integrity and API stability. | claude/skills/review-implementation/SKILL.md:76-79 | review |  |
| A-254 | Never self-assert a review outcome; only the latest cop or Codex output counts as the verdict. | claude/skills/review-plan/SKILL.md:17-19,103-104; claude/skills/review-implementation/SKILL.md:22-25,145 | review |  |
| A-255 | Triage every finding as REAL (apply), CONTEXT-MISMATCHED (ask the user) or STYLE (ignore). | claude/skills/review-plan/SKILL.md:20,26-35; claude/skills/review-implementation/SKILL.md:29-30,81-91; shared/skills/start-work/SKILL.md:194 | review |  |
| A-256 | Present each context-mismatched finding with the quote, your reasoning and options apply / skip with note / override. | claude/skills/review-plan/SKILL.md:37-52; claude/skills/review-implementation/SKILL.md:97-105 | review |  |
| A-257 | When unsure whether a finding is REAL, default to CONTEXT-MISMATCHED and ask. | claude/skills/review-implementation/SKILL.md:93-95 | review |  |
| A-258 | Implementation review caps at 2 rounds; after round 2 remaining findings become follow-up issues. | claude/skills/review-implementation/SKILL.md:33-34; shared/skills/start-work/SKILL.md:191-195; claude/skills/execute-from-linear/SKILL.md:122 | review | contradicts A-266 |
| A-259 | Only missing or wrong tests, behavior vs invariants, security, data loss or public-API break can block approval. | claude/skills/review-implementation/SKILL.md:37-42; shared/skills/start-work/SKILL.md:192 | review |  |
| A-260 | Wording, naming and doc-phrasing comments are out of scope; drop them. | claude/skills/review-implementation/SKILL.md:35-36; shared/skills/start-work/SKILL.md:194; claude/skills/plan/SKILL.md:106 | review |  |
| A-261 | Return only APPROVED, NEEDS_WORK or NEEDS_HUMAN_DECISION, per the fixed report and verdict rules. | claude/skills/review-implementation/SKILL.md:107-145 | review |  |
| A-262 | Review the plan through mcp__codex__codex; loop until APPROVED and never exit on NEEDS_WORK. | claude/skills/review-plan/SKILL.md:12,21-22,80-95 | review |  |
| A-263 | Plan review caps at 3 Codex rounds, then stop and escalate to the user. | claude/skills/review-plan/SKILL.md:23-24,92-101 | review | contradicts A-264 |
| A-264 | Plan review caps at 2 Codex rounds; re-enter only for missing stages, wrong invariants, bad paths, contradictions. | claude/skills/plan/SKILL.md:106-107 | review | contradicts A-263 |
| A-265 | Codex evaluates requirements completeness, feasibility, file map, test scenario quality, strategy and file count. | claude/skills/review-plan/SKILL.md:73-76 | review |  |
| A-266 | A REAL correctness finding at the review ceiling is fixed (RED, fix, re-gate), never punted; only style nits defer. | claude/skills/execute/SKILL.md:40-44 | review | contradicts A-258 |
| A-267 | Continue automatically to the next Stage; never pause to ask "continue?". | shared/skills/blueprint-start/SKILL.md:41; shared/skills/start-work/SKILL.md:233; claude/skills/finish-plan/SKILL.md:32,47-55; claude/skills/execute/SKILL.md:28-29,70-71; claude/skills/execute-from-linear/SKILL.md:94 | unattended |  |
| A-268 | Never stop partway; deliver 100% of the plan or explain what blocked you. | shared/skills/start-work/SKILL.md:232; claude/skills/finish-plan/SKILL.md:14-21; claude/skills/execute/SKILL.md:12 | unattended |  |
| A-269 | Stop only on genuine stage failure, true plan ambiguity, or explicit user interrupt. | shared/skills/start-work/SKILL.md:233; claude/skills/finish-plan/SKILL.md:39-45 | unattended | contradicts A-270 |
| A-270 | Under execute, stop only on stage failure, a no-safe-default costly-irreversible decision, or explicit interrupt. | claude/skills/execute/SKILL.md:33-38,63-69 | unattended | contradicts A-269, A-271 |
| A-271 | If the plan is ambiguous, ask the user; do not guess. | shared/skills/start-work/SKILL.md:240; claude/skills/finish-plan/SKILL.md:43-44 | unattended | contradicts A-270 |
| A-272 | Take a safe default and log "ASSUMPTION: <decision> -> <default> (why)" instead of stopping. | claude/skills/execute/SKILL.md:23,33-38 | unattended | contradicts A-273 (two logging mechanisms) |
| A-273 | Unattended, make the smallest reversible decision, record a Deviation via planctl, commit and continue. | shared/skills/blueprint-start/SKILL.md:55-56 | unattended | contradicts A-272 |
| A-274 | When scope changes while the owner is available, use owner-authorized planctl amend. | shared/skills/blueprint-start/SKILL.md:54-55 | unattended |  |
| A-275 | Time overrun alone is not a reason to stop. | shared/skills/blueprint-start/SKILL.md:56 | unattended |  |
| A-276 | If a Task needs an owner answer, run planctl needs-owner before asking and planctl resume-task afterwards. | shared/skills/blueprint-start/SKILL.md:43-48 | unattended |  |
| A-277 | Do not infer an owner obligation from transcript punctuation or a terminal turn. | shared/skills/blueprint-start/SKILL.md:45-46 | unattended |  |
| A-278 | Parallel child agents each return one commit and a typed result; they never edit the plan or invent Tasks. | shared/skills/blueprint-start/SKILL.md:18-20,51-52 | unattended |  |
| A-279 | Resume from the last "[Stage N]" commit; commit per stage so a dead run loses at most one stage. | claude/skills/finish-plan/SKILL.md:28-29; claude/skills/execute/SKILL.md:46-54 | unattended |  |
| A-280 | Keep sub-agent fan-out modest; bursts of concurrent agents cause 429s. | claude/skills/execute/SKILL.md:55-56 | unattended |  |
| A-281 | Retry tool-level transient failures (HTTP 429, network blips) with backoff inside the turn. | claude/skills/execute/SKILL.md:57-58 | unattended |  |
| A-282 | While running, progress is the commits and assumptions log; no prose check-ins. | claude/skills/execute/SKILL.md:75-76; claude/skills/finish-plan/SKILL.md:79 | unattended |  |
| A-283 | "Context is getting long" is not a stop; finish the current stage and commit so the next turn resumes. | claude/skills/finish-plan/SKILL.md:51-53 | unattended |  |
| A-284 | If a stage is big, decompose within the stage and keep moving; never turn size into a stop. | claude/skills/finish-plan/SKILL.md:72-73 | unattended |  |
| A-285 | Use sub-agents for parallel research or verification when it speeds completion. | claude/skills/finish-plan/SKILL.md:74-75 | unattended |  |
| A-286 | Under execute, with no approved plan, write a short staged plan, commit it, and proceed without approval. | claude/skills/execute/SKILL.md:18-21 | unattended | contradicts A-020, A-040 |
| A-287 | Every task completion includes a structured report; never present partial verification as final proof. | shared/skills/completion-note/SKILL.md:10,63 | handoff |  |
| A-288 | List changed files grouped by layer with specific descriptions, not "updated backend". | shared/skills/completion-note/SKILL.md:14-16 | handoff |  |
| A-289 | List the tst_* and scn_* IDs added, updated or relied upon; explain if none. | shared/skills/completion-note/SKILL.md:18-20 | handoff |  |
| A-290 | List the exact verification commands run and their results; never "all tests pass". | shared/skills/completion-note/SKILL.md:22-33,59 | handoff | rust-era examples (cargo) |
| A-291 | State whether Playwright ran, its mode and video path; otherwise say the fix is unproven in the app. | shared/skills/completion-note/SKILL.md:35-39,60 | handoff |  |
| A-292 | List every unverified risk honestly; never omit risks to look clean. | shared/skills/completion-note/SKILL.md:41-43,62 | handoff |  |
| A-293 | Use the completion-note template: what changed, tests, verification, Playwright, unverified risks. | shared/skills/completion-note/SKILL.md:65-86 | handoff |  |
| A-294 | PR descriptions follow What / Why / How / Verification / Visual proof / Reviewer checklist. | shared/skills/git/SKILL.md:129-154 | handoff |  |
| A-295 | Return the PR as a Markdown URL plus the plan mdurl; the owner merges. | shared/skills/blueprint-start/SKILL.md:66; shared/skills/end-work/SKILL.md:22 | handoff |  |
| A-296 | Report completion naming the branch and its remote. | shared/skills/start-work/SKILL.md:199 | handoff |  |
| A-297 | Produce one completion report at the end: stages done, acceptance criteria AC-by-AC, assumptions, blockers. | claude/skills/execute/SKILL.md:77-79; claude/skills/finish-plan/SKILL.md:35-36,80-82 | handoff |  |
| A-298 | Show the user the test name, what it checks and its failure output before fixing. | shared/skills/bug/SKILL.md:27 | handoff |  |
| A-299 | Explain the fix in 2-3 sentences and tell the user how to verify manually; loop if they find more. | shared/skills/bug/SKILL.md:35,38-40 | handoff |  |
| A-300 | When a CI failure is pre-existing on the base, name both options to the user; never pick silently. | shared/skills/fix-ci-cd/SKILL.md:97-102 | handoff |  |
| A-301 | Report the final SHA and a one-line summary per failure class fixed. | shared/skills/fix-ci-cd/SKILL.md:202 | handoff |  |
| A-302 | To publish, run mdurl on the absolute path, capture the one-line URL and reply with it. | shared/skills/mdurl/SKILL.md:50-53 | handoff |  |
| A-303 | Clean transliterated tech terms into English, lightly structure the text, present it in a code block. | shared/skills/dictate/SKILL.md:3,10 | handoff |  |
| A-304 | After cleanup ask "Выполнять?" for a command or "Ок?" for a note. | shared/skills/dictate/SKILL.md:12 | handoff |  |
| A-305 | After opening nvim, confirm with one short line naming the cwd and file. | claude/skills/nvim/SKILL.md:43 | handoff |  |
| A-306 | Do not ask the operator to type the zellij command; run it for them. | claude/skills/nvim/SKILL.md:67 | handoff |  |
| A-307 | verify-frontend reports tool, output dir, result and artifact list; cite the path in the completion note. | claude/skills/verify-frontend/SKILL.md:67-81 | handoff |  |
| A-308 | verify-app reports a SMOKE_TEST block with per-step PASS/FAIL/SKIPPED and a verdict. | shared/skills/verify-app/SKILL.md:58-70 | handoff |  |
| A-309 | launch-e2e reports backend, agent and frontend URLs, database, test result and log paths. | codex/skills/launch-e2e/SKILL.md:69-82 | handoff |  |
| A-310 | Project-local CLAUDE.md or AGENTS.md wins on a specific conflict; otherwise the global file is the source of truth. | claude/CLAUDE.md:16-17,75-76; codex/AGENTS.md:11-13 | boundaries |  |
| A-311 | Do not kill, stop, reuse or attach to processes you did not start. | claude/CLAUDE.md:69; shared/skills/verify-app/SKILL.md:82-83 | boundaries | contradicts A-365 |
| A-312 | Never use shared dev ports for E2E or Playwright; pick isolated ports per worktree. | claude/CLAUDE.md:70-71 | boundaries |  |
| A-313 | Never modify .github/workflows/, infrastructure/, .claude/, ~/.claude/, ~/.cyrus/, ~/Coding/0_agents/claude/ or secret paths unless the task names the file. | claude/CLAUDE.md:80-82 | boundaries | contradicts A-400, A-362 |
| A-314 | Never edit CLAUDE.md or AGENTS.md inside a feature task; that is a separate user-initiated task. | claude/CLAUDE.md:83-85 | boundaries |  |
| A-315 | Never bypass hooks with --no-verify; fix the failure and commit again. | shared/skills/blueprint-start/SKILL.md:32-33; shared/skills/start-work/SKILL.md:165-166,229,237; claude/skills/finish-plan/SKILL.md:69; claude/skills/execute-from-linear/SKILL.md:181 | boundaries |  |
| A-316 | plan, review-plan, review-implementation and verify-frontend have codex twins; sync them or document the divergence. | claude/skills/plan/SKILL.md:9; claude/skills/review-plan/SKILL.md:8; claude/skills/review-implementation/SKILL.md:9; claude/skills/verify-frontend/SKILL.md:8 | boundaries |  |
| A-317 | Do not install mdurl yourself without explicit approval; it touches /usr/local/bin and creates a system user. | shared/skills/mdurl/SKILL.md:69 | boundaries |  |
| A-318 | Never publish files containing secrets through mdurl; anyone on the tailnet can read them. | shared/skills/mdurl/SKILL.md:76 | boundaries |  |
| A-319 | Do not remove another user's mdurl slug. | shared/skills/mdurl/SKILL.md:75 | boundaries |  |
| A-320 | Never run nvim directly from Bash; it locks Claude's terminal. | claude/skills/nvim/SKILL.md:51,65 | boundaries |  |
| A-321 | Do not open an editor when the operator wants you to make the edit yourself. | claude/skills/nvim/SKILL.md:21 | boundaries |  |
| A-322 | Never delete or overwrite existing screenshot artifacts; each run writes a new task-slugged subdirectory. | claude/skills/verify-frontend/SKILL.md:101-102 | boundaries |  |
| A-323 | Do not commit .claude/artifacts/; it should be gitignored. | claude/skills/verify-frontend/SKILL.md:103 | boundaries |  |
| A-324 | Do not pollute the workspace with temp files outside .claude/temp/. | shared/skills/verify-app/SKILL.md:84 | boundaries | contradicts A-068 |
| A-325 | Never commit session transcripts; they can carry secrets, env values and machine paths. | claude/skills/dispatch-to-linear/SKILL.md:289,353 | boundaries |  |
| A-326 | Seven agent:* scripts are mandatory with stable names; their implementation belongs to the consumer repo. | codex/AGENTS.md:20-21; shared/code-production/package-contract.md:3-14 | tooling-fact |  |
| A-327 | agent:install refreshes the exact workspace dependencies after a merge and in CI. | shared/code-production/package-contract.md:8; shared/skills/blueprint-start/SKILL.md:17,60 | tooling-fact |  |
| A-328 | agent:test:backend, agent:test:frontend and agent:test:e2e run the target supplied after --. | shared/code-production/package-contract.md:9-11 | tooling-fact |  |
| A-329 | agent:verify:commit is the fast changed-scope check per Stage commit, owned by the pre-commit hook, never calling verify:pr. | shared/code-production/package-contract.md:12,20; shared/skills/blueprint-start/SKILL.md:33 | tooling-fact |  |
| A-330 | agent:verify:pr is complete for the repo; it may classify paths but never silently omit a lane. | shared/code-production/package-contract.md:13,21-22 | tooling-fact |  |
| A-331 | agent:verify:docs runs documentation and process verification. | shared/code-production/package-contract.md:14 | tooling-fact |  |
| A-332 | A missing lane is an explicit successful N/A script with its reason; a missing script is invalid. | shared/code-production/package-contract.md:23-24 | tooling-fact |  |
| A-333 | Hooks and CI call only the agent:* names; no framework paths, runners or duplicated policy. | shared/code-production/package-contract.md:25-26 | tooling-fact |  |
| A-334 | A repo opts out of managed CI with agentStack.ci "external" and an existing ciWorkflow; pre-push still stores the receipt. | shared/code-production/package-contract.md:32-51 | tooling-fact |  |
| A-335 | planctl commands: init, set-spec, approve-spec, put-stage, approve-plan, amend, start-task, complete-task, add-deviation, close-stage, needs-owner, resume-task, verify. | shared/skills/blueprint/SKILL.md:16,23,27,60,66,80-81; shared/skills/blueprint-start/SKILL.md:15,24,36-37,44,47 | tooling-fact |  |
| A-336 | The Delivery receipt lives at the git path code-production/verify-pr.sha and names the verified SHA. | claude/skills/review-implementation/SKILL.md:56-57 | tooling-fact |  |
| A-337 | Codex may run git status, diff, log --oneline, ls-remote heads and global config list without asking. | codex/rules/default.rules:1-8 | tooling-fact |  |
| A-338 | Codex may run gh auth status and gh auth setup-git without asking. | codex/rules/default.rules:9-10 | tooling-fact |  |
| A-339 | Codex may run pnpm build/test/lint and npm run build/test/lint without asking. | codex/rules/default.rules:11-16 | tooling-fact | contradicts A-120 |
| A-340 | CI builds refs/pull/N/merge (base plus PR head), so a broken base reddens a green branch. | shared/skills/fix-ci-cd/SKILL.md:28-32,218 | tooling-fact |  |
| A-341 | Every PR push runs the full Actions matrix, roughly 15 minutes of paid CI. | shared/skills/fix-ci-cd/SKILL.md:14,206 | tooling-fact |  |
| A-342 | Find CI failures with gh run list, gh api .../runs/<id>/jobs, and the job-log endpoint when --log-failed 403s. | shared/skills/fix-ci-cd/SKILL.md:53-67 | tooling-fact |  |
| A-343 | Log patterns map to classes: rustfmt diff, E0061 signature drift, invalid linker, panicked assertion, clippy -D warnings. | shared/skills/fix-ci-cd/SKILL.md:69-76 | tooling-fact | rust-era |
| A-344 | Warm the cache with CARGO_TARGET_DIR pointing at the main checkout's target/. | shared/skills/fix-ci-cd/SKILL.md:127-131,209 | tooling-fact | rust-era |
| A-345 | Missing linker: move host tuning to ~/.cargo/config.toml or apt-get install mold in every Linux cargo job. | shared/skills/fix-ci-cd/SKILL.md:156-159 | tooling-fact | rust-era |
| A-346 | rustfmt drift: run cargo fmt --all and commit it as a style: change. | shared/skills/fix-ci-cd/SKILL.md:160 | tooling-fact | rust-era |
| A-347 | The CLI is mdurl <path> [slug]; the server is http://u3775:6420 and returns http://u3775:6420/<user>/<slug>. | shared/skills/mdurl/SKILL.md:3,26-36 | tooling-fact |  |
| A-348 | Skip mdurl when the user is off Tailscale, the file is not .md, or it is missing locally. | shared/skills/mdurl/SKILL.md:18-22 | tooling-fact |  |
| A-349 | mdurl copies the file, so re-run it after edits. | shared/skills/mdurl/SKILL.md:38 | tooling-fact |  |
| A-350 | mdurl -l lists your documents, -L lists everyone's, -r <slug> removes yours. | shared/skills/mdurl/SKILL.md:43-45 | tooling-fact |  |
| A-351 | If the URL fails: systemctl is-active markdown-server, mdurl -l, journalctl -u markdown-server. | shared/skills/mdurl/SKILL.md:54-57 | tooling-fact |  |
| A-352 | If mdurl is missing, tell the user to run sudo bash ~/Coding/0_agents/setup-mdurl.sh, then update.sh. | shared/skills/mdurl/SKILL.md:61-67 | tooling-fact | script is at lib/setup-mdurl.sh, not the cited path |
| A-353 | Do not start your own grip or Python server or cp files into /srv/markdown/. | shared/skills/mdurl/SKILL.md:73-74 | tooling-fact |  |
| A-354 | Open nvim with zellij action new-pane --direction right --cwd <abs-cwd> --name nvim -- nvim <target>. | claude/skills/nvim/SKILL.md:8,26 | tooling-fact |  |
| A-355 | The pane cwd is Claude's pwd, never the user's home or the repo root. | claude/skills/nvim/SKILL.md:29,66 | tooling-fact |  |
| A-356 | The target is always required: "." with no argument, otherwise the path as given. | claude/skills/nvim/SKILL.md:30-32,37-40 | tooling-fact |  |
| A-357 | Skip nvim when $ZELLIJ is unset or nvim is not on PATH, and tell the operator. | claude/skills/nvim/SKILL.md:19-20,41,45-49 | tooling-fact |  |
| A-358 | Run the zellij action one-shot without awaiting; one invocation opens one pane. | claude/skills/nvim/SKILL.md:42,68 | tooling-fact |  |
| A-359 | For a floating pane use --floating (the MARKDOWN_VIEW_PANE=floating shortcut). | claude/skills/nvim/SKILL.md:53-61 | tooling-fact | markdown-view is retired (lib/install.sh:151) |
| A-360 | Without env.sh, detect commands from package.json, Cargo.toml, pyproject.toml or go.mod; mark undetected steps SKIPPED. | shared/skills/verify-app/SKILL.md:25-34 | tooling-fact |  |
| A-361 | SCREENSHOT_CMD honors OUT_DIR, exits 0 on success, and handles its own service setup and teardown. | claude/skills/verify-frontend/SKILL.md:29-34 | tooling-fact |  |
| A-362 | Screenshots go to <repo>/.claude/artifacts/screenshots/<task-slug>/ for Cyrus, CI or a human to pick up. | claude/skills/verify-frontend/SKILL.md:25,85-95 | tooling-fact | contradicts A-313 |
| A-363 | launch-e2e flags: <spec> runs it, --headed runs headed, --keep keeps the stack alive. | codex/skills/launch-e2e/SKILL.md:16-21 | tooling-fact |  |
| A-364 | The tmux session is launch-e2e-<repo>; status file /tmp/<session>.status; launcher scripts/launch-e2e.sh. | codex/skills/launch-e2e/SKILL.md:28-30,35-42 | tooling-fact |  |
| A-365 | Kill any same-named tmux session, start the launcher in a new one, wait up to 180 s for status. | codex/skills/launch-e2e/SKILL.md:40-56 | tooling-fact | contradicts A-311 |
| A-366 | Kill the tmux session after the run unless --keep was passed. | codex/skills/launch-e2e/SKILL.md:63-66 | tooling-fact |  |
| A-367 | Parse git worktree list --porcelain and git status --porcelain to classify worktrees. | shared/skills/cleanup-worktrees/SKILL.md:18-24 | tooling-fact |  |
| A-368 | A magnis PreToolUse hook refuses git worktree add on an unsettled tree; use the documented escape, never copy files. | shared/skills/start-work/SKILL.md:61-63 | tooling-fact |  |
| A-369 | A PreToolUse hook blocks writes to non-canonical plan paths; do not retry elsewhere, move the file. | claude/skills/plan/SKILL.md:99 | tooling-fact |  |
| A-370 | Mermaid in plans is flowchart only, ASCII only, no parentheses in node IDs, quoted labels; mdurl fails otherwise. | claude/skills/plan/SKILL.md:52-57 | tooling-fact |  |
| A-371 | Testing layers: core, kernel, module, src_iso, src_int, fe_unit, fe_scn, agent_unit, agent_beh, agent_pol, eval_scn, eval_qual, cert. | shared/skills/test-protocol/SKILL.md:134-136 | tooling-fact |  |
| A-372 | Canonical testing docs: docs/testing/policy.md, e2e-standard.md, layers.md and docs/backend/testing.md. | shared/skills/test-protocol/SKILL.md:136,140-142; claude/skills/plan/SKILL.md:20-22 | tooling-fact |  |
| A-373 | The slug is the plan filename without .md; the title is its first H1. | shared/skills/start-work/SKILL.md:41-43; claude/skills/dispatch-to-linear/SKILL.md:54-57 | tooling-fact |  |
| A-374 | For truly hands-off runs wrap execute in /loop or a schedule routine to restart dead sessions. | claude/skills/execute/SKILL.md:59-61 | tooling-fact |  |
| A-375 | A skill cannot retry a model-side 429; the turn ends, so recovery must come from per-stage commits. | claude/skills/execute/SKILL.md:46-51 | tooling-fact |  |
| A-376 | Branch protection allows Merge only; a squash, if ever asked, is done by the user in the GitHub UI. | shared/skills/git/SKILL.md:92-95 | tooling-fact |  |
| A-377 | Cop definitions live at ~/.claude/agents/{coherence,coverage,simplicity}-cop.md. | claude/skills/review-implementation/SKILL.md:70-72 | tooling-fact |  |
| A-378 | Codex cannot read outside the repo sandbox; paste the plan content into the prompt, no temp files. | claude/skills/review-plan/SKILL.md:64-69 | tooling-fact |  |
| A-379 | execute, finish-plan and execute-from-linear allow Bash, Read, Grep, Glob, Edit, Write, Agent; dispatch allows read-only Bash. | claude/skills/execute/SKILL.md:7; claude/skills/finish-plan/SKILL.md:7; claude/skills/execute-from-linear/SKILL.md:7; claude/skills/dispatch-to-linear/SKILL.md:7 | tooling-fact |  |
| A-380 | start-work is limited to git, cargo and cd-and-bun Bash commands plus Read, Grep, Glob and Agent. | shared/skills/start-work/SKILL.md:7 | tooling-fact | rust-era (cargo) |
| A-381 | dispatch-to-linear creates one Linear issue, one branch with the plan commit, and optionally a draft PR. | claude/skills/dispatch-to-linear/SKILL.md:14-18 | cyrus |  |
| A-382 | Cyrus owns worktree creation, branch checkout, bot spawn, agent_context and Linear comments; never duplicate that. | claude/skills/dispatch-to-linear/SKILL.md:20; claude/skills/execute-from-linear/SKILL.md:14,18 | cyrus |  |
| A-383 | Never paste the plan body or TDD protocol into the Linear issue; pointer, summary and acceptance only. | claude/skills/dispatch-to-linear/SKILL.md:22,339 | cyrus |  |
| A-384 | Dispatch needs a tree where only the plan file is uncommitted; other changes mean stop and ask. | claude/skills/dispatch-to-linear/SKILL.md:29 | cyrus |  |
| A-385 | The bot is $(whoami)-bot verified via mcp__linear__list_users; --bot overrides; not found means stop and ask. | claude/skills/dispatch-to-linear/SKILL.md:30,61-69,343 | cyrus |  |
| A-386 | Never assign coding work to humans; bots only. | claude/skills/dispatch-to-linear/SKILL.md:65,342 | cyrus |  |
| A-387 | Search Linear and origin for an existing dispatch; on a hit stop and ask update / new / abort. | claude/skills/dispatch-to-linear/SKILL.md:31,345 | cyrus |  |
| A-388 | gh must be authenticated with PR-write scope before dispatch. | claude/skills/dispatch-to-linear/SKILL.md:32 | cyrus |  |
| A-389 | Print the full artifact preview and wait for an explicit YES; auto-mode does not bypass this. | claude/skills/dispatch-to-linear/SKILL.md:33,163-203,341 | cyrus |  |
| A-390 | Team is the single or repo-matching one; project is optional and never auto-created; base defaults to staging and must exist. | claude/skills/dispatch-to-linear/SKILL.md:74-77,346 | cyrus |  |
| A-391 | The issue uses the plan H1 as title, the bot as assignee, priority High, state Todo, pointer description. | claude/skills/dispatch-to-linear/SKILL.md:85-87 | cyrus |  |
| A-392 | The branch name is Linear's issue.gitBranchName verbatim, lowercase mag-N; never derive it locally. | claude/skills/dispatch-to-linear/SKILL.md:91-102,212,349,355 | cyrus | contradicts A-393 |
| A-393 | The bot must be on a branch matching <bot>/mag-N-<slug>; otherwise stop and comment. | claude/skills/execute-from-linear/SKILL.md:14,24,212; shared/skills/start-work/SKILL.md:72 | cyrus | contradicts A-392 (Linear prefixes with the human's username) |
| A-394 | Pre-creating the draft PR is optional (default yes, --no-pr skips) and carries the generated-by-cyrus-dispatch marker. | claude/skills/dispatch-to-linear/SKILL.md:107-124 | cyrus |  |
| A-395 | The pointer body has Plan, Repo, Base, Branch, PR, Slug, Summary, Acceptance and Bot; both skills share it. | claude/skills/dispatch-to-linear/SKILL.md:126-161,364 | cyrus |  |
| A-396 | Mergeable means: one commit per stage, CI green, review APPROVED, human approval, plan carries a Linear footer. | claude/skills/dispatch-to-linear/SKILL.md:141-156 | cyrus |  |
| A-397 | Create in order: Linear issue, checkout -b from origin/<base>, plan commit, push -u, draft PR, update the issue. | claude/skills/dispatch-to-linear/SKILL.md:205-247 | cyrus | contradicts A-078 (branch is created in the main tree) |
| A-398 | On partial failure tell the operator and leave artifacts in place; never roll back automatically. | claude/skills/dispatch-to-linear/SKILL.md:250-253 | cyrus |  |
| A-399 | Append a "## Linear" footer to the plan, commit "docs(plan): link <slug> to Linear MAG-N + PR #M", push. | claude/skills/dispatch-to-linear/SKILL.md:257-274 | cyrus |  |
| A-400 | Archive the session JSONL to ~/.claude/sessions-by-plan/<slug>.jsonl; warn if missing, never skip otherwise. | claude/skills/dispatch-to-linear/SKILL.md:276-291,352 | cyrus | contradicts A-313 |
| A-401 | After dispatch, check out the base ref, git branch -D the local branch, remove the planning worktree unless --keep-local. | claude/skills/dispatch-to-linear/SKILL.md:293-320,354 | cyrus | contradicts A-118 |
| A-402 | Never open the dispatch PR ready-for-review; the bot flips it after implementation. | claude/skills/dispatch-to-linear/SKILL.md:347 | cyrus |  |
| A-403 | Never escape newlines in Linear or gh description fields. | claude/skills/dispatch-to-linear/SKILL.md:350 | cyrus |  |
| A-404 | Never mark the Linear issue Done from a skill; the merge does that. | claude/skills/dispatch-to-linear/SKILL.md:351; claude/skills/execute-from-linear/SKILL.md:155,179 | cyrus |  |
| A-405 | Do not dispatch unapproved plans, tiny work, or when stage-level Linear visibility is wanted. | claude/skills/dispatch-to-linear/SKILL.md:357-361 | cyrus |  |
| A-406 | dispatch flags: --bot, --project, --base, --state, --update, --no-pr, --keep-local, --dry-run. | claude/skills/dispatch-to-linear/SKILL.md:322-335 | cyrus |  |
| A-407 | The bot never runs git checkout or git worktree add; its cwd is already the worktree Cyrus made. | claude/skills/execute-from-linear/SKILL.md:14,18,168 | cyrus |  |
| A-408 | The plan must be in cwd under docs/plans/; if absent, stop and comment "dispatch incomplete". | claude/skills/execute-from-linear/SKILL.md:25 | cyrus |  |
| A-409 | If the base branch is red at start or breaks mid-run, stop and comment; only an operator fixes the base. | claude/skills/execute-from-linear/SKILL.md:27,193 | cyrus | contradicts A-137 |
| A-410 | Every STOP leaves the worktree intact, comments the precise block on Linear, and keeps the issue In Progress or Blocked. | claude/skills/execute-from-linear/SKILL.md:29,186,197 | cyrus |  |
| A-411 | Read the plan fully: Task, Spec (DEC/CON), scenarios, file map, INV, tests, stages, contract. | claude/skills/execute-from-linear/SKILL.md:31-38 | cyrus |  |
| A-412 | Never edit, soften or re-plan; if the plan is wrong or a stage impossible, stop and comment. | claude/skills/execute-from-linear/SKILL.md:40,114,169,185,191-192 | cyrus |  |
| A-413 | Move the issue to In Progress and post the starter comment before starting. | claude/skills/execute-from-linear/SKILL.md:42-54 | cyrus |  |
| A-414 | Before Stage 0 self-review for DEC/CON/INV tension, missing paths, unwriteable tests, unclear scope, environment assumptions. | claude/skills/execute-from-linear/SKILL.md:56-64 | cyrus |  |
| A-415 | Post all ambiguities as one numbered Linear comment and wait; after Stage 0 any question is a STOP. | claude/skills/execute-from-linear/SKILL.md:66-94,170-171 | cyrus |  |
| A-416 | With no ambiguity, post "Plan reviewed end-to-end, no ambiguities. Starting Stage 0." and proceed. | claude/skills/execute-from-linear/SKILL.md:88-92 | cyrus |  |
| A-417 | Each stage's commit subject equals the plan's "Commit:" line exactly. | claude/skills/execute-from-linear/SKILL.md:103,173 | cyrus |  |
| A-418 | One stage = one commit = one push (git push origin HEAD), then a one-line Linear comment. | claude/skills/execute-from-linear/SKILL.md:104-110,174 | cyrus | contradicts A-104 |
| A-419 | Regressions in unrelated suites block; fix inline if traced to your stage, else stop and comment. | claude/skills/execute-from-linear/SKILL.md:102 | cyrus |  |
| A-420 | After all stages run /review-implementation at least once; cap 2 rounds, then comment remaining findings and stop. | claude/skills/execute-from-linear/SKILL.md:116-123,175-176 | cyrus |  |
| A-421 | Review fixes are committed as "audit-fix REAL #N: <summary>", one per finding, pushed after each. | claude/skills/execute-from-linear/SKILL.md:122 | cyrus | contradicts A-091 |
| A-422 | Never mark the PR ready before review APPROVED; round-2 NEEDS_WORK leaves it a draft. | claude/skills/execute-from-linear/SKILL.md:176 | cyrus |  |
| A-423 | Append or update the "## Linear" footer with "Implemented under MAG-N; PR #M", commit and push. | claude/skills/execute-from-linear/SKILL.md:125-139 | cyrus |  |
| A-424 | Hand off to Cyrus's verify-and-ship skill for tests, changelog, PR readiness and the ship comment; never reimplement it. | claude/skills/execute-from-linear/SKILL.md:140-153,177,214 | cyrus |  |
| A-425 | The Linear issue body is a pointer; the plan file on the branch is canon when they disagree. | claude/skills/execute-from-linear/SKILL.md:184 | cyrus |  |
| A-426 | Read Cyrus's <agent_context> block once at startup for base branch, repo URL, bot username, assignee and guidance. | claude/skills/execute-from-linear/SKILL.md:27,199-208 | cyrus |  |
| A-427 | execute-from-linear accepts <issue-id>, --dry-run and --resume. | claude/skills/execute-from-linear/SKILL.md:157-164 | cyrus |  |
| A-428 | Stop on plan-vs-code drift, unwriteable tests, base breakage, repeated NEEDS_WORK, or an externally closed PR. | claude/skills/execute-from-linear/SKILL.md:188-195 | cyrus |  |
| A-429 | Pressure-test startup ideas with a Paul Graham-style lens: real users, painful problems, current behavior, manual traction. | shared/skills/startup-pressure-test/SKILL.md:10 | business |  |
| A-430 | Match the user's language; keep common startup terms in English. | shared/skills/startup-pressure-test/SKILL.md:14 | business |  |
| A-431 | If the idea is missing ask one short question for idea, customer and desired action; otherwise start at once. | shared/skills/startup-pressure-test/SKILL.md:18-24 | business |  |
| A-432 | Pick the mode from the request (pressure-test, problem-validation, competition-map, first-10-customers, mvp-plan, full); default full. | shared/skills/startup-pressure-test/SKILL.md:28-37 | business |  |
| A-433 | Default to the compact output: verdict, six-row scorecard, core assumption, fatal flaws, problem, competition, customers, MVP. | shared/skills/startup-pressure-test/SKILL.md:41-88 | business |  |
| A-434 | At most 3 sentences of verdict, 3 flaws, 3 bullets per section; no templates or weekly plans unless asked. | shared/skills/startup-pressure-test/SKILL.md:90-99 | business |  |
| A-435 | Be specific to the idea; never give generic startup advice. | shared/skills/startup-pressure-test/SKILL.md:103 | business |  |
| A-436 | Rank the most dangerous flaws first and name the core assumption that must hold. | shared/skills/startup-pressure-test/SKILL.md:104-105 | business |  |
| A-437 | Treat current behavior as competition; treat "we have no competition" as false by default. | shared/skills/startup-pressure-test/SKILL.md:106-107 | business |  |
| A-438 | Test real behavior, not compliments; discovery questions ask about past behavior. | shared/skills/startup-pressure-test/SKILL.md:108-109 | business |  |
| A-439 | Prefer manual founder-led validation; find the first customers by hand before ads or scale. | shared/skills/startup-pressure-test/SKILL.md:110-111 | business |  |
| A-440 | Cut features that do not test the riskiest assumption; the MVP tests that one assumption only. | shared/skills/startup-pressure-test/SKILL.md:112-113 | business |  |
| A-441 | If the idea is weak, say so directly and explain the pivot path. | shared/skills/startup-pressure-test/SKILL.md:114 | business |  |
| A-442 | Never invent market data; browse or state what must be verified. | shared/skills/startup-pressure-test/SKILL.md:115 | business |  |
| A-443 | Scores are 1-5 per area and tied to evidence from the idea, not vibes. | shared/skills/startup-pressure-test/SKILL.md:119-130 | business |  |
| A-444 | In deep mode add assumptions, disconfirming evidence, discovery questions, outreach, milestones and pivot options. | shared/skills/startup-pressure-test/SKILL.md:134-143 | business |  |
| A-445 | Read references/playbooks.md for mode-specific templates and criteria. | shared/skills/startup-pressure-test/SKILL.md:37,147 | business |  |
| A-446 | Git operations are documented in ~/.claude/agents/git.md; the summary is never rewrite history. | claude/CLAUDE.md:40-41 | stale | file does not exist; the policy lives at shared/skills/git/SKILL.md |
| A-447 | Find the plan from plan mode's system-prompt path or the newest .md in /Users/mikko/.claude/plans/. | claude/skills/review-plan/SKILL.md:56-60,64 | stale | contradicts A-068, A-022; macOS path that does not exist here |
| A-448 | verify-app and verify-frontend read TYPECHECK_CMD, LINT_CMD, TEST_CMD, BUILD_CMD, SCREENSHOT_CMD from .claude/temp/env.sh. | shared/skills/verify-app/SKILL.md:11-23,39; claude/skills/verify-frontend/SKILL.md:19-26,42 | stale | .claude/temp/env.sh does not exist in magnis-app; contradicts A-120 |
| A-449 | Test clients are Playwright, WsRpcClient, reqwest and direct TestCore calls. | shared/skills/test-protocol/SKILL.md:108-114 | stale | rust-era; WsRpcClient, reqwest and TestCore do not exist in magnis-app |
| A-450 | Mocks are MockChatSource, MockMailSource, MockSourceRuntime and MockAgentSidecar. | shared/skills/test-protocol/SKILL.md:117-122 | stale | none of these exist in magnis-app |
| A-451 | Run integration tests with MAGNIS_PGLITE_SERVER_BIN from scripts/codex/build-pglite-sidecar.sh and cargo test filters after --. | shared/skills/fix-ci-cd/SKILL.md:137-153 | stale | rust-era; scripts/codex/build-pglite-sidecar.sh does not exist |
| A-452 | The PR Verification section is the output of /verify or a completion-note report. | shared/skills/git/SKILL.md:143-144 | stale | no /verify skill exists (verify-app does) |

## Counts

| group | rows |
|---|---|
| lifecycle | 32 |
| plan-writing | 42 |
| git | 45 |
| verification | 38 |
| tdd | 21 |
| code-quality | 5 |
| language-style | 35 |
| review | 48 |
| unattended | 20 |
| handoff | 23 |
| boundaries | 16 |
| tooling-fact | 55 |
| cyrus | 48 |
| business | 17 |
| stale | 7 |
| **total** | **452** |

- Rules that appear in 2+ files: **92** of 452.
- Rows with a note: 96 (contradictions: 54; rust-era: 34; missing/retired references: 14).
