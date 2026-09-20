---
name: cleanup-worktrees
description: Remove the worktrees whose work is on origin/staging or is gone from disk. Shows the plan first, acts on the owner's yes, never touches unpublished commits.
user-invocable: true
disable-model-invocation: true
---

# Cleanup worktrees

1. `git fetch origin --quiet`. Every "is it merged" below is asked against
   `origin/staging`, never a local ref.
2. `git worktree list --porcelain`; for each worktree but the main one read
   the branch, `git status --porcelain`, and the commits in
   `origin/staging..HEAD` with whether each is also on `origin/<branch>`.
3. Classify: prunable (directory gone), merged (every commit reachable from
   `origin/staging` and the tree clean), unpublished (a commit on no
   remote — never removed, whatever its age; offer `git push -u origin
   <branch>` instead), keep (everything else).
4. Print one line per worktree with its class and the proposed action.
   Wait for the owner's yes.
5. Then: `git worktree prune`; `git worktree remove <path>` and
   `git branch -d <branch>` for merged ones — `-d`, never `-D`, git refuses
   what is not merged. Never the main or the staging working directory.

```
/cleanup-worktrees           # the plan only
/cleanup-worktrees --apply   # act after the yes
```

$ARGUMENTS
