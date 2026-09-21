---
name: blueprint
description: Write one plan the owner approves twice — the SPEC, then the Stages — with planctl as the only pen. Use before any non-trivial change.
---

# Blueprint

A change that is one commit is not a plan: `/bug`, a red test, a fix, a pull
request. The plan is `docs/plans/<slug>.md` on `feat/<slug>`, born in its own
worktree from fresh `origin/staging`, next to the list of open PRs into
staging that touch the same files. `planctl init <plan> --title "…"` creates
it; from then on planctl is the only pen.

## The SPEC

Read the code first: the names, the mechanisms, the tests that exist. Then
write the SPEC in prose, in the skeleton of `account-sync-state`:

- The Goal: two or three lines — the owner's measures, today's number and the
  target. Never "measure X"; a Goal is what will be true.
- Why now: the problem with its numbers and its `file:line` anchors.
- The target, as detailed as the task is deep: the process as a flow (a
  diagram and a table of its stages), the design as the screen will look,
  Interfaces in TypeScript, Code where the algorithm is the decision, What
  changes and what leaves, Target tree, Verification, Invariants,
  Constraints and non-goals, Reuse, Deliveries.
- Not verified: what the plan claims without having run it.

Names come from the repository, or from the project's vocabulary page where
one exists. A new name is declared in a New names table with its reason.
Every new or changed type is TypeScript: a hand-written interface, one field
per line, a zod schema decoding into it — never a sentence, never "as
elsewhere". Sizes are printed, not capped: depth sets the size.

`planctl set-spec <plan> --from <spec.md>`, then the pre-approval screen:
SPEC lines, Stages, the longest Stage, the New names count, next to the
medians of the plans approved in one round (150 to 300 SPEC lines). The
plan-gate linter and judge have passed before the owner reads. Open the
draft PR, publish with mdurl, ask. Hard stop. An owner question is answered
in the chat; the plan changes only when the owner says "внеси". At most
three review rounds, fixing only what the plan cannot run without.
`planctl approve-spec` with the owner's words.

## The Stages

One Delivery is one PR; Stage 0 of a Delivery is the interface and its mock,
committed first, so a second agent can build against it. A Stage is a commit
a reviewer reads in one sitting, green after it: two Stages one commit
message would cover are one; a Stage with a second "What is built"
paragraph, writes of two owners or more than three Tasks is two. A Task
story names one change in under 200 characters. No minutes, no credits.
`planctl put-delivery` and `planctl put-stage` from their `--help` JSON;
never hand-write Stage Markdown. Check that every Goal line, flow and
invariant has a Stage; the screen prints each Stage's writes and Tasks
counts; publish and ask again. Hard stop. `planctl approve-plan` with the
owner's words. After that the plan changes only through `amend`,
`start-task`, `complete-task`, `add-deviation`, `approve-stage`, `close-stage`.
