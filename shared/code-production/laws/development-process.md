# Development process

This is the shared production system for all repositories. Project documents
describe architecture; they do not redefine this lifecycle. The compact agent
card is [plan-protocol.md](plan-protocol.md), the exact document contract is
[plan-format.md](plan-format.md), and project commands implement
[the package API](../package-contract.md).

## Production goal

Produce mergeable code predictably: high quality, low cost and short wall
time. Optimize measured work, not activity. Every Delivery records:

- predicted and actual active minutes;
- elapsed time and external wait time;
- credits/tokens when the runner exposes them, otherwise `unavailable`;
- rework commits and review rounds;
- verification gates bought;
- unauthorized scope changes and temp leftovers.

Parallel work reduces wall time only when dependency paths and write ownership
permit it. Never divide total work by agent count and call that a forecast.

## Lifecycle

```text
idea
  -> plan worktree + first draft commit
  -> SPEC discussion (goal, flows, metrics, constraints, invariants, reuse)
  -> mdurl
  -> owner SPEC approval / lock
  -> Deliveries, Stages, Tasks, estimates and RED commands
  -> owner implementation approval / lock
  -> one active PR Delivery
       -> independent Stage agents may run in parallel
       -> one work commit per Stage
       -> integration Stage joins commits and buys the full gate once
  -> ready, green, mergeable PR + GitHub Markdown URL + mdurl
  -> owner merge
  -> scorecard, retro and registered temp cleanup
```

There are exactly two planning stops. The owner approves the SPEC before
implementation decomposition, then approves the concrete Delivery/Stage/Task
contract before code. Review rounds run only on the owner's word.

## Hierarchy and publication

- A **Plan** may contain sequential PR Deliveries.
- A **PR Delivery** is one branch, one PR and one full publication gate.
- A **Stage** is one delegable, observable TDD result and one work commit.
- A **Task** is one atomic code change inside a Stage, written so the owner and
  executor understand it without chat history.

Only one Delivery is active by default. This keeps base relationships and CI
receipts obvious. Stages inside it may run in parallel when the plan names
disjoint writes, one exact base and an integration owner. Uncertain overlap
serializes.

## Planning quality

The owner view is a review interface, not an execution log.

- A Stage is its result-oriented title followed by the single compact metadata
  block rendered by `planctl`: owner/profile, routing, Stage writes, temp root,
  total forecast and verification share. It has no free-form execution story.
  The title never says “finish the colleague's branch”, “half-landed” or
  “remaining work”.
- A Task story names one concrete change in at most 200 characters; its
  rendered line ends with the predicted active minutes when minutes were given.
- A Task's writes are files, directories or globs, as many as the change
  needs; a commit that touches files beyond them is recorded, not refused.
  Split a Task only when its story joins independent changes.
- A Task stands alone. “Existing”, “new”, “named files”, “the map above” and
  similar pointers are invalid unless the same sentence resolves them to an
  exact symbol or path.
- Exact writes, credits, How and RED are frozen in the hidden metadata line
  immediately after the Task. `planctl start-task` reveals them; the plan does
  not repeat them as visible Task prose.

Bad Stage: “Finish the colleague's branch: build fixes and Verify rewire.”

Good Stage: “Restore the preview build after the Verify rename.”

Bad Task: “Apply the rename map in the named files.”

Good Task: “Replace generic `Error` in `src/prepare/result.ts` with canonical
`SDKError` and cover it in `test/prepare/result.test.ts`. (12 min)”

Before approval, follow every acceptance story through its public calls. Every
file that must gain or change a public contract is a Task write, even when the
call originates in another Stage file. A missing owning file makes the plan
incomplete. After approval, amend before editing while the owner is available;
unattended work uses the reversible decision protocol below.

A Stage forecast equals the sum of its Task forecasts plus an explicit
verification share, for both active minutes and credits. A Delivery reports
aggregate active work, the longest dependency path and external waits
separately.

## One source of truth and two locks

The canonical `docs/plans/<slug>.md` is the only plan copy. JSON files are
temporary command inputs or typed execution receipts. Git-local journals store
hashes and timers, never a second plan.

The reusable implementation lives in the dedicated `planctl/` Bun package;
its commands run from that package working directory. `agent-stack` vendors
only the lightweight CLI/core bytes to stable consumer runtime paths, so NestJS
service dependencies never become part of a consumer repository contract.

While status is `SPEC_DRAFT`, the agent may freely edit SPEC prose. After SPEC
approval, and especially after `APPROVED`, all mutations go through `planctl`.
The pre-commit hook refuses direct checkbox changes, rewritten Tasks, criteria,
forecasts or results without the HEAD/blob-bound mutation journal.

Scope changes require the owner's word through `planctl amend`.
Continue within the owner's current task and explicit limits. Resolve missing
implementation details there with the smallest reversible decision and record it.
A Deviation does not authorize extra work. If those limits prevent completion,
report the conflict instead of expanding the task.
Ordinary shortfalls go to Deviations.

## Execution cadence

For each Task:

1. Run `planctl start-task <plan> --task <ID>`; read the printed frozen scope.
2. Write the named behavior test and show RED for the expected reason.
3. Implement the minimum change and show GREEN with the same narrow command.
4. Run typecheck and only tests covering the changed files. Never run a full
   suite for an individual Stage or commit.
5. Inspect the diff for scope, duplication and missing behavior; do not call
   cops or review-implementation for an individual Stage or commit.
6. Create the Stage work commit; hooks run `agent:verify:docs` and
   `agent:verify:commit`. Never bypass them.
7. Import a typed receipt with `planctl complete-task`; the runtime compares
   its paths with frozen Task writes and the actual commit diff.
8. Continue automatically to the next ready Stage.

An owner-response wait is runtime state, not prose. Immediately before asking a
question that blocks an active Task, record one safe-line reason with
`planctl needs-owner <plan> --task <ID> --reason <text>`. After the response,
clear it atomically with `planctl resume-task <plan> --task <ID>` before work
continues; `start-task` also clears an existing marker. Transcripts, question
marks and terminal turns never create an owner obligation.

At the PR Delivery boundary, the integration Stage joins the Stage commits,
refreshes dependencies with `agent:install`, then invokes `.githooks/pre-push`.
After a clean exact-head gate passes, the hook stores a Git-local SHA receipt;
the following `git push` reuses it instead of running the suite twice. CI
independently repeats the complete gate on the published ready-PR SHA. Final
review reuses unchanged receipts instead of buying the same suite again.
review-implementation runs only at the user's request, once at the end of the
entire implemented plan, when local checks and CI are green and the PR is
ready to merge. Fix its findings with typecheck and tests covering changed
files; do not repeat the review after fixes or a new SHA.

After a check fails, rerun that check. Reuse passing checks unless subsequent
changes affect what they verified; do not repeat an aggregate command merely
to rerun one failed step. Publication hooks still apply.

A green test is evidence only after the same test was observed RED against the
incomplete behavior.

## Failure and unattended behavior

- Hook or test failure: fix the cause and rerun the failed scope.
- Task scope no longer matches reality: owner-authorized amendment.
- Predicted time exceeded: record actuals; do not stop merely because an
  estimate was wrong.
- Unrelated file appears in the diff: remove it from the Stage or amend scope.
- Existing base failure: record its exact command/SHA; fix it only when it
  blocks the Delivery and the plan authorizes the change.
- Unattended work stays within the owner's current task and explicit limits.

## Temp-root hygiene

Each Delivery registers one temp root and each parallel Stage owns a child.
Before a Stage hands off, it deletes obsolete artifacts from that child. Before
publication, every registered temp path must be absent. Remove only explicit,
inactive registered paths; never sweep broad `/tmp`, home or workspace roots.

## Handoff and scorecard

The agent hands over a ready, mergeable PR, not “some commits.” The final
message contains:

- `[PR #N — title](GitHub URL)` as a clickable Markdown URL;
- plan `mdurl`;
- exact head SHA and green CI state;
- predicted versus actual active/elapsed/wait time and usage;
- tests and review receipts reused from that SHA;
- deviations, rework and unverified gaps;
- registered temp roots confirmed absent.

After the owner merges, record the scorecard and a short retro: what changed in
scope, where estimates missed, which gate duplicated work, whether parallelism
reduced the critical path, and the smallest process change to test next.
