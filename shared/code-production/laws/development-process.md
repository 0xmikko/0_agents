# The development process

One process for every repository that installed the stack: how work moves
from an idea to a merged pull request, and what needs whose word. The plan is
made as [plan-format.md](plan-format.md) says; a project's commands are
[the package contract](../package-contract.md).

## The lifecycle

A worktree on `feat/<slug>` from fresh `origin/staging`; the plan's first
draft committed; the SPEC written; the draft PR opened and the plan published
with mdurl. The owner approves the SPEC: `planctl approve-spec`. Deliveries,
Stages and Tasks are added through planctl; the owner approves the plan:
`planctl approve-plan`. From here the plan changes only through planctl. One
Delivery at a time, Stage by Stage, one commit each, a pull request from the
first commit. The complete gate once, in the pre-push hook; CI repeats it on
the published SHA; the agent flips the PR to ready; the owner merges.
`/end-work` closes it: the three measures, the register, the ledger row.
Two approvals and no third; review rounds only on the owner's word, three at
most, fixing only what the plan cannot run without.

## Sizes

Sizes are printed, not capped: depth sets the size. The pre-approval screen
shows the SPEC's lines, the number of Stages, the longest Stage and each
Stage's writes and Tasks counts, next to the medians of the plans the owner
approved in one round, 150 to 300 lines of SPEC. A Task story is under 200
characters. Minutes and credits are not forecast; the result row records
what the clock and the runner said.

A Stage is a commit a reviewer reads in one sitting, and the tree is green
after it. Two Stages one commit message would cover are one Stage. A Stage
whose description needs a second "What is built" paragraph, whose writes
have two owners, or which has more than three Tasks, is two. A change that
is one commit is not a plan: it is `/bug`, a red test, a fix, a pull request.

## The Stage

`planctl start-task` prints the contract: the story, the writes, the RED
command. The test first, red for the missing behavior; the smallest change
that turns it green; the Stage's one to three named test files and nothing
wider; the three reviewers on the diff; one Conventional commit whose body
is the why; `planctl complete-task` with the Stage result file; `close-stage`
when its commands are green. A Stage whose criteria include `stage-approved`
ends the agent's turn: five lines of what it produced, `waiting for: the word`.

## Three tiers

Free — the agent does it and planctl records the difference in the result
row: add a test, add a file the compiler names, touch a file beyond the
writes but inside the Delivery's target tree in the same commit, close a
Stage whose commands are green.

Recorded — one Deviations line, and on: a file outside the target tree, a
deleted test, a criterion that became unreachable.

Refused by planctl — a file another Stage or another plan declares in its
writes: the owner of that code changes it, and the caller adapts to its API.

Above the tiers, the owner's word and only here: the goal and its measure,
removing a promised file from the tree, the meaning of a criterion, scope
beyond the Delivery. Asked and answered in the chat; the plan changes when
the owner says so, through `planctl amend`.

## Git

One branch, one worktree, created from `origin/staging` and refreshed with
`git merge origin/staging`; merge commits only, history never rewritten, the
hooks never silenced. One commit per Stage, no wip. Code moves between trees
only by merge, never `cp` or `git checkout <branch> -- <path>`. The agent
never pushes to `staging` or `main`. Every git command an agent runs or
hands the owner names its tree: `git -C <absolute path>`.

## Verification

Inside a Stage, the named files. Once per Delivery, the complete gate: the
pre-push hook runs `agent:verify:docs` and `agent:verify:pr` on the exact head
and stores the hook's record, so the push that follows does not run the suite
twice; CI runs the same gate on the published SHA. A review reuses the record
of an unchanged head. Only the project's `agent:*` scripts, ever.

## Unattended, and the handoff

A shortfall is a Deviations line and the work continues; a question the plan
cannot answer gets the smallest reversible decision, recorded, and the work
continues. Only irreversible data loss, security damage or the destruction of
unmerged work stops a run. Time overrun stops nothing. "Done" is said with
its proof in the same message: the pull request as a Markdown link, the
plan's mdurl, the head SHA and its CI run, what was not verified and why. A
branch name or "pushed" is not a handoff. A Delivery's temp root,
`.tmp/code-production/<plan>/`, is absent before publication.

## Register of experiments

`/end-work` writes one row per merged Delivery; the owner accepts or declines
the previous row before the next Delivery closes.

| Date | Delivery | Experiment | Status |
|---|---|---|---|
