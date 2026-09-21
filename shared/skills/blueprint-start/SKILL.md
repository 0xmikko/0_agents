---
name: blueprint-start
description: Work an approved plan Stage by Stage — red, green, three reviewers, one commit, the owner's word — and deliver one PR. Use when the plan is APPROVED.
---

# Blueprint Start

## Start

In the plan's worktree: `git merge origin/staging` (never rewrite history),
`bun run agent:install`, a compiler dry run, then the project's own
post-merge checklist from its CLAUDE.md (for Magnis: build the SDK, grep raw
SQL for renamed columns, `uniq -d` the migration numbers, re-pin docs in the
commit that moves an anchor). If the project has a browser suite, run it
once now for its baseline. `planctl verify <plan>` must exit 0. A pull
request exists from the first commit, no later than a day after the
Delivery starts.

## Each Stage

1. `planctl start-task <plan> --task <TASK>` prints the contract: the story,
   the writes, the RED command.
2. Write the test; run the RED command; it fails on missing behavior, not on
   syntax or environment. Then the smallest change that makes it green.
3. Run the Stage's one to three named test files. Nothing wider.
4. The three reviewers on the diff: coherence (reuse, layers), coverage (the
   state graph, one detailed test per flow), simplicity (no abstraction for
   a case that does not exist). Fix a real finding; drop style. Codex only
   on request or over 200 lines, two rounds at most.
5. One commit, Conventional, its body the why. Then
   `planctl complete-task <plan> --from <stage-result.json>`.
6. `planctl close-stage <plan> --stage <STAGE>` when its commands are green.
   A Stage whose criteria include `stage-approved` ends the turn: five lines
   of what it produced, then `waiting for: the word`.

Three tiers. Free — do it, planctl records the difference in the result row:
add a test, add a file the compiler names, touch a file beyond the writes
but inside the target tree in the same commit. Recorded — one
`planctl add-deviation` line and on: a file outside the target tree, a
deleted test, a criterion that became unreachable. Refused by planctl: a
file another Stage or plan declares in its writes; the owner of that code
changes it and you adapt to its API. The owner's word, and only here: the
goal and its measure, removing a promised file, the meaning of a criterion,
scope beyond the Delivery. Unattended: the smallest reversible decision, a
Deviations line, continue. Never idle on a question.

## Deliver

The complete gate runs once, in the pre-push hook. Push when someone needs
the new state; CI checks the published SHA. A real CI failure is fixed
locally with its exact command, then one push. Flip the PR to ready; the
owner merges. "Done" is said with its proof in the same message: the PR
URL, the probe, the CI run by SHA.
