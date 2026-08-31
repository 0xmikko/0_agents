---
name: execute-from-linear
description: Server-side counterpart to /dispatch-to-linear. Runs in the bot's session that Cyrus spawned in the dispatch worktree. Reads the plan from the current branch (already checked out by Cyrus), executes implementation stages sequentially with TDD discipline, runs /review-implementation, then hands off to Cyrus's verify-and-ship for the PR + Linear ship comment. Auto-invokes when the bot session starts in a Cyrus dispatch worktree; user-invocable for manual replay.
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools: Bash Read Edit Write Grep Glob Agent
---

# Execute from Linear: server-side, plan → stages → ready PR

You are the **server side** of the dispatch flow:

- **Cyrus (the orchestrator)** — already heard the Linear webhook, created your worktree at `~/.cyrus/worktrees/<MAG-N>/`, checked out the branch `<bot>/mag-N-<slug>` (the one `/dispatch-to-linear` pre-pushed with the plan as its first commit), and spawned this Claude session inside it. Your `cwd` IS the worktree. Don't `git checkout`, don't `git worktree add`, don't go fetch the plan from somewhere — it's right there.
- **`/dispatch-to-linear` (client-side)** — already created the Linear issue, the git branch, the plan-commit, and possibly a draft PR.
- **`/execute-from-linear` (this skill)** — reads the plan from the current branch, executes the stages, pushes commits, runs `/review-implementation`, hands off to `verify-and-ship`.

You do NOT do worktree management. You do NOT switch branches. You do NOT fetch the plan from anywhere — it's already in your cwd.

## STOP — Pre-flight Check

When you start (Cyrus has just spawned you, or operator ran `/execute-from-linear` manually):

1. **Are you on the dispatch branch?** Run `git branch --show-current`. It must match the `<bot>/mag-N-<slug>` pattern. If not — STOP, comment on Linear: "not on a dispatch branch, expected `<bot>/mag-N-*`". This means Cyrus didn't put you in the right place; not your job to fix.
2. **Is the plan in cwd?** `find docs/plans/ -name '*.md' -newer ~/.cyrus/state/edge-worker-state.json` (or any heuristic to find the plan recently added). The plan filename matches the slug from the branch name. If absent — STOP, comment: "plan file not found on this branch; dispatch incomplete".
3. **Does the plan have `Status: APPROVED`?** Read the plan header. If not approved — STOP, comment: "plan is not approved, refusing to execute".
4. **Is `<base_branch>` healthy?** Cyrus's `<agent_context>` block in your system prompt names the base branch (default `staging`). Pull its head and run the project's verify suite (typecheck + tests). If broken — STOP, comment: "base ref red, cannot start cleanly". Only an operator fixes the base.

If any check fails, leave the issue in `In Progress` (or `Blocked` if your team has it), comment with the precise reason, stop. Don't retry blindly.

## Step 1: Read the plan in full

Read `docs/plans/<slug>.md` from the current worktree. The plan is canon. Extract:

- `## Task` — the goal
- `## Spec` — Decisions, Constraints (DEC-* / CON-*)
- `## Plan` — User scenarios, File change map, Invariants (INV-*), Tests, **Implementation stages**, Execution contract
- For each stage: file list, RED tests, exact commit message

You are NOT to edit, soften, or re-plan. If the plan is wrong, STOP and comment — the operator decides.

## Step 2: Move issue to In Progress, post starter comment

Use the Linear MCP tools (or whatever issue-tracker interface Cyrus exposes) to:

1. `state="In Progress"` on the dispatch issue
2. Post:
   ```
   Picked up. Plan: docs/plans/<slug>.md (Status: APPROVED).
   First reading the plan end-to-end; if anything is ambiguous I'll
   ask before starting Stage 0. Otherwise stages run sequentially,
   one commit + one push per stage. verify-and-ship marks the PR
   ready when done.
   ```

## Step 3: Pre-execution clarification round (Q&A)

After reading the plan but BEFORE writing any code, do an honest self-review:

- Are any DEC / CON / INV in tension with each other?
- Does any stage reference a file path / API / dependency that doesn't exist or has been renamed?
- Are any RED tests unwriteable as specified (the framework can't express them, the invariant doesn't compose, the harness is missing)?
- Is the scope of "minimum implementation" unclear for any stage?
- Does the plan assume something about the environment that may not hold (env var present, service running, secret available)?

**If you have ANY ambiguity** — post it on Linear as a numbered list, ONE comment containing all your questions:

```
Pre-execution review — N question(s) before starting Stage 0.

1. **<short title>** — <plan reference>
   <question>. Options I see:
   (a) <option>
   (b) <option>
   <which / open>?

2. **<short title>** — <plan reference>
   <question>. <options or open>.

…

Will not start Stage 0 until all are resolved. Worktree intact;
issue stays In Progress.
```

Then **WAIT**. Cyrus's webhook on operator reply will wake you up; re-read the comment thread, check whether ALL questions are answered. If yes — post a one-liner ("All clarified, starting Stage 0") and proceed to Step 4. If new follow-ups arose from the operator's answer, ask them in a second numbered list and wait again.

**If you have NO ambiguity** — post:
```
Plan reviewed end-to-end, no ambiguities. Starting Stage 0.
```
and proceed immediately.

The Q&A round is the ONLY interactive phase. Once Stage 0 starts, you do NOT pause to ask questions — stage transitions are automatic per "Anti-patterns" below. Any question that surfaces mid-execution is a STOP, not a question. Front-load them here.

## Step 4: Implement stages sequentially

For each stage in order:

1. **RED:** write the test(s) the plan lists for this stage. Cross-reference `### Tests` for exact step→verify scenarios. Run the test in isolation — it MUST fail. If it passes immediately, the test doesn't capture the invariant; rewrite it (don't move on).
2. **GREEN:** implement the minimum to make the test pass. No fallbacks, no defensive code, no scope creep.
3. **Full suite:** run the project's verify command. Regressions in unrelated suites are blockers — fix them inline if they trace to your stage; STOP and comment if they don't.
4. **Commit:** subject MUST equal the plan's "Commit:" line for this stage exactly. Body lines are fine.
5. **Push:** `git push origin HEAD`. CI on the PR refreshes per push; the activity feed shows the cadence.
6. **Comment on Linear** (one line):
   ```
   Stage N landed: <stage-title> (<short-sha>) — CI: <link>
   ```

One stage = one commit = one push. No batching. The plan dictates the sequence.

If a stage's test passes immediately on current code → the test doesn't capture the invariant → rewrite it (don't move on).

If a stage is impossible (file path drifted in the plan, dependency missing, the invariant doesn't compose with the framework) → STOP, comment, hand to operator. Don't re-interpret the plan.

## Step 5: After ALL stages — `/review-implementation`

Once the last stage commit is pushed:

1. Invoke `/review-implementation` (cops + Codex review).
2. **APPROVED:** proceed to Step 5.
3. **NEEDS_WORK with REAL findings:** batch the round, add targeted RED tests,
   fix it in one `fix(review): <summary>` rework commit, refresh the exact-head
   gate and re-run `/review-implementation`. Round 2 caps NIT/style loops only;
   continue REAL fixes until APPROVED.
4. **NEEDS_HUMAN_DECISION:** comment the ASK_USER findings; STOP. Don't guess.

## Step 6: Plan footer + hand off to `verify-and-ship`

1. Append to `docs/plans/<slug>.md` (in this worktree):
   ```markdown
   ## Linear

   Implemented under [MAG-N](<issue_url>); PR [#M](<pr_url>).
   ```
   If the dispatcher's footer is already there, update it to add the "implemented" sentence — don't duplicate.
2. Commit + push:
   ```
   git add docs/plans/<slug>.md
   git commit -m "docs(plan): link <slug> back to PR"
   git push origin HEAD
   ```
3. **Invoke Cyrus's `verify-and-ship` skill.** It handles:
   - Acceptance criteria validation against the Linear issue
   - Final test/lint/typecheck pass
   - Changelog updates
   - PR creation if not pre-created (`gh pr create --draft` or update existing)
   - PR description population (Cyrus marker, attribution, Linear link)
   - Marking PR ready-for-review (unless `<agent_guidance>` says keep as draft)
   - Posting final summary back to Linear

Don't reimplement what `verify-and-ship` does. Just invoke it.

## Step 7: After verify-and-ship completes

`verify-and-ship` does the Linear ship comment + state transition itself. Your job here ends. STOP. Do NOT merge.

The human reviewer takes it from there. When they merge, content-os `LinearSyncService.notifyPublished` (or Cyrus's webhook handler) flips the Linear issue to Done.

## Args

```
/execute-from-linear                    # picks the assigned dispatch issue (Cyrus auto-spawn)
/execute-from-linear <issue-id>         # explicit, for manual replay
/execute-from-linear --dry-run          # parse pointer, read plan, print intent — no writes
/execute-from-linear --resume           # re-run after a STOP (re-checks base, picks up at next unfinished stage)
```

## Anti-patterns — DO NOT

- **NEVER `git worktree add` or `git checkout`.** Cyrus put you in the right place. If you're not, STOP — that's a Cyrus / dispatch bug, not your fix.
- **NEVER re-plan.** Plan is approved. If wrong, STOP and comment.
- **NEVER skip the Step 3 pre-execution Q&A round** when you have ambiguity. Front-load questions; once Stage 0 starts, questions become STOPs. Ask everything you need upfront in one numbered comment, then go silent and execute.
- **NEVER pause mid-stage to ask a clarifying question.** That's a STOP, not a question. The Q&A window is Step 3, before Stage 0. After that, ambiguity → STOP + comment + wait.
- **NEVER skip RED.** Every stage starts with a failing test.
- **NEVER batch stages into one commit.** One commit per stage; commit messages must match the plan exactly.
- **NEVER skip the per-stage push.** PR conversation depends on per-stage CI.
- **NEVER skip `/review-implementation`.** At least one round is mandatory;
  REAL findings keep the loop open until APPROVED.
- **NEVER mark the PR ready before review APPROVED.** REAL findings remain
  inline work regardless of the review-round number.
- **NEVER reimplement `verify-and-ship`.** Use Cyrus's existing skill.
- **NEVER merge the PR.** Human-only.
- **NEVER mark the Linear issue Done.** Side-effect of merge.
- **NEVER push to the base ref.** Only the dispatch branch you started in.
- **NEVER `--no-verify` on commits.** Pre-commit hooks are a contract.
- **NEVER force-push the branch.** First commit is the plan; never rewrite shared history.
- **NEVER use destructive git ops** (`reset --hard`, `push --force`, `branch -D` on shared branches).
- **NEVER treat the Linear issue body as authoritative for the plan.** Body is a pointer; the plan file at `<branch>:docs/plans/<slug>.md` is canon. If they disagree, file wins.
- **NEVER re-interpret a stage that's gone wrong.** Comment, STOP, hand to operator.
- **NEVER leave the issue silently in In Progress.** STOPs require a comment explaining the block.

## On STOP conditions

Categories you'll hit:
- **Plan disagrees with code reality** (file path drifted, dependency renamed): STOP, comment, hand to operator.
- **Test impossible to write** (invariant doesn't compose with the framework): STOP, comment.
- **Base ref breaks mid-run** (unrelated commit landed and broke the suite): STOP, comment. Don't try to fix unrelated breakages from inside this run.
- **Codex review repeatedly NEEDS_WORK**: STOP, comment, hand to operator.
- **PR was closed externally:** STOP, comment.

In every STOP: leave the worktree intact, comment on Linear with the precise block, set state to `In Progress` (or `Blocked` if available). Cyrus or the operator decides recovery.

## Cyrus context you should use

When Cyrus spawns you, your system prompt contains an `<agent_context>` block with at least:
- `<base_branch>` — what you'll target with the PR
- `<github_url>` or `<gitlab_url>` — repo URL
- `<github_bot_username>` or `<gitlab_bot_username>` — the bot account, used in PR/MR descriptions
- `<assignee>` — Linear profile of who delegated
- `<agent_guidance>` — special instructions (e.g., "keep PR as draft")

Read the context block once at startup. Use it instead of trying to derive these values yourself.

## Related skill

`/dispatch-to-linear` — client-side counterpart. Branch-naming convention (`<bot>/mag-N-<slug>` LOWERCASE) is shared and MUST match Cyrus's expectation. If the dispatcher renames branches, this parser breaks.

`verify-and-ship` (Cyrus skill at `~/.cyrus/cyrus-skills-plugin/skills/verify-and-ship/SKILL.md`) — your final hand-off target. Handles tests, lint, typecheck, changelog, PR creation/update, ship comment.
