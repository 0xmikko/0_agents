---
name: cleanup-worktrees
description: Prune stale git worktrees. Removes worktrees whose branch is merged to the integration branch OR whose on-disk directory is gone OR whose HEAD is older than 14 days. Safe — never touches active branches or ones with uncommitted work.
user-invocable: true
disable-model-invocation: true
---

# Cleanup worktrees

Clean stale worktrees from the current repository. This is a two-step skill:
first produce a dry-run plan, then act only after explicit approval.

## Protocol

0. `git fetch origin --quiet` first. Every "is it merged?" question below is
   asked against the REMOTE integration branch (`origin/staging`), never the
   local ref — a stale local baseline makes unmerged work look merged.
1. Run `git worktree list --porcelain` and parse.
2. For each worktree other than the main one:
   - Get branch, HEAD SHA, last-commit age, locked status.
   - Compute two facts that decide everything:
     - `git status --porcelain` — uncommitted work
     - commits in `origin/staging..HEAD`, and whether they also exist on
       `origin/<branch>` — i.e. what lives only on this disk
   - Classify:
     - **prunable**: directory missing on disk (`git worktree prune` will drop it)
     - **merged**: every commit is reachable from `origin/staging` AND working tree is clean
     - **stale**: last commit older than 14 days AND no uncommitted changes AND
       every commit is at least published to `origin/<branch>` AND is named
       `worktree-agent-*` (auto-generated)
     - **unpublished**: has commits on no remote — never a removal candidate,
       whatever its age
     - **keep**: everything else — active work
3. Show the user the plan (one line per worktree, classification, proposed action).
   For every **unpublished** worktree show the commit count and subjects, and
   offer `git push -u origin <branch>` as the action instead of removal.
4. Wait for approval.
5. On approval:
   - `git worktree prune` for missing dirs
   - `git worktree remove <path>` for merged/stale, then `git branch -d <branch>`
   - For locked worktrees with auto-generated names: `git worktree unlock <path>` first, then remove

## Safety rules

- NEVER touch the main or integration working directories.
- NEVER remove a worktree with uncommitted changes — report it and skip.
- NEVER remove a worktree whose branch has commits that are on no remote. That
  the branch survives `git branch -d` is luck, not protection — the operator
  still loses the only path back to that work. Offer to push it instead.
- NEVER `branch -D` (force) — use `-d` and let git refuse if unmerged.
- Show the plan FIRST, act only after user says yes.

## Usage

```
/cleanup-worktrees           # dry-run — show plan, do not touch
/cleanup-worktrees --apply   # perform the pruning after confirmation
```

## Task

$ARGUMENTS
