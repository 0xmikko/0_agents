---
name: start-work
description: Mandatory protocol when starting implementation after a plan is approved. Enforces worktree creation, staging health check, TDD loop, and commit discipline. Auto-invokes when transitioning from planning to coding.
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools: Bash(git *) Bash(cargo *) Bash(cd * && bun *) Read Grep Glob Agent
---

# Start Work: Plan-to-Implementation Protocol

You are transitioning from an approved plan to implementation. Follow this protocol exactly. Skipping steps causes merge conflicts, broken staging, and wasted time.

## STOP — Pre-flight Check

Before writing any code, answer these questions:

1. **Is there an approved plan in context?** Resolve via Step 0 below. If none — stop, go back to `/spec` or `/plan`.
2. **Have I settled the tree I am leaving?** See Step 0.5. A new worktree makes the old one invisible.
3. **Am I in a worktree?** If not — create one (Step 1 below). NEVER implement in the main working tree.
4. **Is staging green?** If not — fix staging first. No work starts on a broken staging.

## Step 0: Locate the approved plan

Two resolution paths, in order — no other heuristics:

1. **Explicit argument** — `/start-work <plan-path>`. Use it directly after verifying the file exists and `Status: APPROVED`.
2. **Conversation context** — look at the current conversation. Is there a single specific plan the operator just discussed (finished `/spec` for it, opened it in `markdown-view`, asked a question about it)? If yes — propose it and CONFIRM: `"Starting work on docs/plans/<X>.md. Correct? (yes / no — name the plan you mean)"`. Only proceed on yes.

If neither path is clear — STOP and ask the operator in natural language:
```
Which plan should I implement? Examples:
  - "the dashboard one"
  - "docs/plans/x-api-migration.md"
  - "the spec we just discussed"
```
Then resolve their answer, confirm the match before proceeding. The operator's words are the source of truth; never silently fall back to a filesystem heuristic.

If the resolved plan does not have `Status: APPROVED` — STOP, ask the operator: route to `/spec` / `/review-plan` first, or override explicitly.

Extract from the chosen plan:
- `slug` — filename without `.md` (used as worktree directory + branch suffix)
- `title` — first H1 (used in commit messages and PR title later)

## Step 0.5: Settle the tree you are leaving

Starting a new worktree is the moment work goes missing. The previous tree keeps
its uncommitted files and its unpushed commits, and nothing in the new tree ever
mentions them again. Before creating anything:

```bash
git status --porcelain                          # must be empty, or explained
git log --oneline origin/staging..HEAD          # commits that exist only here
git log --oneline "origin/$(git branch --show-current)..HEAD" 2>/dev/null
```

- Uncommitted changes → commit them on the branch they belong to.
- Untracked plans, scripts, fixtures → commit them; a file in no commit exists on one disk only.
- Commits not on `origin` → `git push -u origin <branch>`.

In magnis-app a PreToolUse hook enforces this and refuses the `git worktree add`
outright. If you genuinely mean to park the work, say so in your message to the
operator and use the documented escape — never work around it by copying files.

## Step 1: Create Worktree with the plan as first commit

MANDATORY for all feature work. NEVER implement in the main working tree.

### Worktree location, branch naming, and the plan-commit

- **Worktree directory**: `.worktrees/<slug>/` inside the repo root (slug from Step 0).
- **Branch name**: `feat/<slug>` — derived from the plan slug, no random hashes. (For dispatched-to-Linear work this is `<bot>/mag-N-<slug>` instead — that's `/dispatch-to-linear`'s territory; for local /start-work, just `feat/<slug>`.)
- **One agent = one worktree = one branch.** No sharing.
- **The plan is the first commit on the branch.** This way the plan + implementation arrive together in the eventual PR; staging never carries "planned but not implemented" docs.

Branch off `origin/staging`, never the local `staging` ref. The local one is
routinely stale (measured in magnis-app on 2026-08-04: 110 commits behind), so a
worktree based on it starts from a base that exists nowhere else, and every
"is this merged?" check answers from the wrong history.

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
SLUG="<slug-from-step-0>"
BRANCH="feat/$SLUG"
WT_PATH="$REPO_ROOT/.worktrees/$SLUG"

git fetch origin --quiet
mkdir -p "$REPO_ROOT/.worktrees"
git worktree add -b "$BRANCH" "$WT_PATH" origin/staging

cd "$WT_PATH"

# `git worktree add` built a CLEAN tree from origin/staging — an untracked plan
# sitting in the main tree did NOT follow it. Move it in.
PLAN="docs/plans/$SLUG.md"
if [ ! -f "$PLAN" ]; then
  if [ -f "$REPO_ROOT/$PLAN" ]; then
    mv "$REPO_ROOT/$PLAN" "$PLAN"     # only while untracked at the source
  else
    echo "ERROR: $PLAN found in neither tree — locate it before implementing"
    exit 1
  fi
fi
git add "$PLAN"
git commit -m "plan($SLUG): approved spec"

# Publish now, not at the end. From here the work exists off this disk.
git push -u origin "$BRANCH"
```

That `mv` is the single exception to the no-moving-files-between-trees rule: the
plan document only, only while it is untracked in the main tree, only here.
Everything else moves by `git merge`.

**Examples of GOOD branch names**: `feat/dashboard-frontend`, `feat/email-send-fix`, `feat/trigger-gate-mock`.
**Examples of BAD names**: `feat/work`, `task/123`, `.worktrees/worktree-agent-a03de810`.

The `.worktrees/` directory is in `.gitignore` — worktrees are local-only.

If you are already in a worktree (check: `git rev-parse --show-toplevel` differs from main repo root), skip to Step 2 — but verify the plan-commit is already at the head of your branch's history. If not, add it now before any implementation work.

## Step 2: Verify Staging is Green (tiered)

Classify the task before running anything:

- **Trivial** (one file, <50 lines, no new deps): skip preflight entirely. Pre-commit will catch issues.
- **Standard** (one module, one crate, or UI-only): run `cargo check --workspace` + the affected crate's tests only (or `cd frontend && bun run typecheck` for UI-only).
- **Large** (multi-crate, schema, migration, or plan has ≥3 stages): full suite below.

Full suite (Large only):
```bash
# Backend
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace

# Frontend
cd frontend && bun run typecheck && bun run lint && bun run test

# Agent
cd agent && bun run typecheck && bun run test
```

If unsure of classification, treat as Standard. The goal is proving the base compiles and the area you're touching is green — not re-proving the whole repo. If ANY check that you run fails, fix it first.

## Step 3: TDD Loop (for each plan stage)

For each stage in the approved plan, follow this exact loop:

```
1. Write RED test (must FAIL on current code)
   - If the test passes immediately, it doesn't capture the requirement. Rewrite it.

2. Implement the minimum code to make the test GREEN

3. Run full test suite — no regressions

4. Run `/fast-precommit` — scoped to changed files, not the whole workspace.
   - Frontend-only → bun typecheck + lint + test --changed
   - One crate → cargo test -p <crate>
   - Cross-crate / schema / migrations → full workspace fallback
   - Codex review pass only on diffs >200 lines or public-API changes

5. Commit
   - If pre-commit hook fails → fix → commit again
   - NEVER use --no-verify

6. Move to next stage
```

## Step 4: Commit Message Format

Conventional Commits. Include stage number and plan summary.

```
feat(module): description of what this stage implements [Stage N/M]

## Plan: <plan title>
Stage 1: <done marker> <description>
Stage 2: <done marker> <description> (THIS COMMIT)
Stage 3: <description>
...

## Changes in this stage
- <bullet list of what changed>
```

## Step 5: After All Stages Complete

1. Run full verification one more time (backend + frontend + agent) — this is the single full-suite gate for the whole plan.
2. Run `/review-implementation` — self-review gate, SINGLE PASS
   - Round 1: fix blocking items only (missing tests, wrong behavior, security, data loss, public-API break)
   - If still REJECT: one more round, same filter
   - Wording/naming/doc-phrasing comments are OUT OF SCOPE — ignore them or file as follow-up
   - Do NOT loop past round 2
3. **Publish.** `git push` the branch. A finished branch that lives only on this
   disk is indistinguishable from lost work — nobody can see it, review it, or
   recover it.
4. Report completion to user with summary, naming the branch and its remote.
5. **Do NOT merge.** User merges worktree to staging via `git merge`.

## Step 6: Verify it actually landed

A merged PR is not proof. Stacked PRs land into each other's heads and quietly
miss `staging` — in magnis-app on 2026-08-04, PR #70 was green and MERGED while
all 8 of its commits were verifiably absent from `origin/staging`.

After the operator merges:

```bash
git fetch origin --quiet
git merge-base --is-ancestor <branch-tip-sha> origin/staging \
  && echo "landed" || echo "NOT IN STAGING — the merge did not deliver it"
```

If a PR targets anything other than `staging`, say so explicitly when you open
it, and re-run this check after the whole chain has merged.

## Absolute Prohibitions

- NEVER create a new worktree while the current one has uncommitted changes or unpushed commits. Settle it first (Step 0.5).
- NEVER branch off the local `staging` ref. Fetch and branch off `origin/staging`.
- NEVER leave a finished branch unpushed.
- NEVER pick a plan by mtime. Use Step 0 — explicit path, conversation context, or ask the operator.
- NEVER skip the plan-commit on the new branch. The plan must be the first commit; implementation stages stack on top.
- NEVER work in the main tree. If you catch yourself editing files outside a worktree — STOP.
- NEVER merge to staging or main. Only the user does this.
- NEVER use `cp` or `git checkout <branch> -- <files>` to move code between trees.
- NEVER use `--no-verify` to skip pre-commit hooks.
- NEVER skip the RED test phase. The test must fail before you implement.
- NEVER add fallbacks, defaults, or "just in case" code not in the approved plan.
- NEVER stop partway through. Deliver 100% of the plan or explain what blocked you.
- NEVER pause between stages to ask "continue or review?". Stage transitions are AUTOMATIC — start the next stage immediately after the current stage's commit. Stop only on (1) stage failure, (2) plan ambiguity, (3) explicit user interrupt. Each commit is a natural pause point — the user interrupts there if they want.

## If Something Goes Wrong

- Pre-commit hook fails → read the error, fix the issue, commit again
- Test fails unexpectedly → investigate root cause, don't comment out the test
- Staging was broken → fix staging first, then continue feature work
- Plan is ambiguous → ask the user, don't guess

## Task

$ARGUMENTS
