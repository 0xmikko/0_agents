# Git and GitHub workflow

These rules are shared across repositories. `agent-stack install` supplies the
portable hooks and PR workflow; the consumer's `package.json` supplies only
the commands they call.

## Branches and worktrees

- All work enters through a PR into `staging`; never open a feature PR into
  `main`.
- All changes happen on `feat|fix|refactor|chore/<topic>` in a dedicated
  `.worktrees/<topic>` worktree created from `origin/staging`.
- One agent = one branch = one worktree. A parallel Stage agent works from the
  exact base named by the integrator and returns a commit plus typed receipt.
- Refresh a feature branch with `git merge origin/staging`. Use merge commits;
  never rebase, squash during development or rewrite published history.
- Never move work between trees with `cp` or `git checkout <branch> -- <path>`.
  Merge the commit so ownership and history remain visible.
- Agents never merge or push directly to `staging` or `main`; the owner merges.

## Plan and PR continuity

The plan is born in its own feature worktree and committed from its first line.
Once SPEC settles, open the draft PR immediately and keep the same branch/PR
through its Delivery. Publish the plan with `mdurl` for owner review.

A PR stays draft while product work or the full publication gate is incomplete.
Only the integration Stage marks it ready, after the exact head is locally
green. Before every push, confirm the PR for that branch is still open; a push
to a merged PR branch produces no useful CI result, so a tail needs a new PR.

Deliveries are sequential by default. Parallelize Stages inside the active
Delivery, then merge their commits into its single tree before publication.

## Commits

- Conventional Commit subject; body explains WHY and identifies the Stage.
- One work commit per Stage. Plan checkbox/result updates ride the next work
  commit; final bookkeeping may use one explicit closure commit.
- Never use `--no-verify`, change `core.hooksPath` to escape a failure or amend
  published commits.
- A commit that unexpectedly changes another Stage's files is invalid even if
  its tests pass.

## Verification levels

| Boundary | Command |
|---|---|
| Task inner loop | exact `bun run agent:test:<lane> -- <file> [-t <ID>]` |
| Stage commit | `agent:verify:docs` + `agent:verify:commit` from the managed hook |
| Delivery pre-push | `.githooks/pre-push`: `agent:verify:docs` + `agent:verify:pr`, then an exact-HEAD receipt |
| Draft PR CI | process/docs contract only |
| Ready PR CI | process/docs + `agent:verify:pr` on the published SHA |
| Final review | reuse exact-head receipts; rerun only after SHA changes |

The complete gate is intentionally bought once per Delivery locally and once
by CI. It is not run after each edit, Task or Stage.

## Managed enforcement

- `pre-commit` permits free `SPEC_DRAFT` writing, freezes locked plan bytes,
  requires a `planctl` journal for mutations, then runs commit-level scripts.
- `post-commit` consumes the spent plan mutation transaction.
- `pre-push` rejects tracked uncommitted changes, verifies plan locks and runs
  the complete project gate. A successful Git-local HEAD receipt makes the
  actual push reuse that result; any new commit invalidates it.
- `.github/workflows/code-production.yml` rejects PR bases other than
  `staging`, runs cheap control-plane checks on drafts, and runs the product
  gate on ready PRs.
- `agent-stack check` rejects missing package scripts, a stale vendored runtime,
  modified managed files or a worktree whose hooks path is not `.githooks`.

An installer refuses to overwrite an unmanaged hook/workflow. Integrate the
existing behavior deliberately, then mark the combined file as managed; never
silently discard repository policy.

## Handoff

The publication result is a green, mergeable PR with this primary link:

```markdown
[PR #123 — observable Delivery title](https://github.com/owner/repo/pull/123)
```

Also report the plan `mdurl`, published head SHA, CI receipts and remaining
gaps. A raw URL, branch name or “pushed” is not a completed Delivery.
