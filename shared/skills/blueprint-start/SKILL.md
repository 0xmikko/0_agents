---
name: blueprint-start
description: Execute an approved plan Stage by Stage with TDD, scoped commits, optional disjoint parallel agents, and one complete gate per PR. Use when implementation begins.
---

# Blueprint Start

This skill is self-contained and repository-agnostic. The approved Markdown
plan defines scope; planctl owns its state; package.json scripts named agent:*
own all project-specific commands.

## Start

1. Work in the plan's existing feature worktree. Confirm the PR is open and the
   plan is APPROVED. Run agent-stack check and planctl verify <plan>.
2. Merge origin/staging into the feature branch without rewriting history,
   then run bun run agent:install.
3. Select only dependency-ready Stages. Different agents may implement Stages
   in parallel only when the plan declares disjoint writes. Each returns one
   commit and a typed result; child agents never edit the plan.

## Stage loop

1. Run planctl start-task <plan> --task <TASK_ID> and follow the printed frozen
   scope.
2. Add the named behavior test and run the exact agent:test command. Observe
   RED for missing behavior, not syntax, dependencies or environment.
3. Implement the minimum change, rerun the same command GREEN, then run only
   the Stage's 1–3 named behavior-test files.
4. Review the diff for exact declared writes, reuse, duplication and accidental
   fallbacks. Remove the registered .tmp/code-production/... Stage root.
5. Create one conventional work commit for the Stage. Never bypass hooks;
   agent:verify:commit belongs to the managed pre-commit hook.
6. Import the result:

       planctl complete-task <plan> --from <stage-result.json>
       planctl close-stage <plan> --stage <STAGE_ID>

   Checkbox/result changes ride the next work commit; the last ones use one
   closure commit.
7. Continue automatically to the next ready Stage.

If a Task cannot continue without an owner response, run
`planctl needs-owner <plan> --task <TASK_ID> --reason <one-safe-line>`
immediately before asking. Do not infer an owner obligation from transcript
punctuation or a terminal turn. After the owner answers, run
`planctl resume-task <plan> --task <TASK_ID>` before continuing; a fresh
`start-task` also clears the marker.

The integrator merges returned Stage commits into the Delivery tree and records
their results. Never copy files between worktrees and never let child agents
invent or mutate Tasks.

If scope changes while the owner is available, use owner-authorized planctl
amend. Unattended at night, make the smallest reversible decision, record a
Deviation, commit it and continue. Time overrun alone is not a reason to stop.

## Deliver

1. Run bun run agent:install, then .githooks/pre-push once. Do not compose
   framework commands or invoke another package manager directly.
2. Push the exact green head. The push reuses its local receipt; CI independently
   verifies the published SHA.
3. Fix a real CI failure locally with its exact command before one new push.
   When green, mark the PR ready.
4. Return the PR as a Markdown URL plus the plan mdurl. The owner merges.
