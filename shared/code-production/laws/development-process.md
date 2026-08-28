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
  -> draft PR + mdurl
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
- A **Stage** is one delegable TDD result and one work commit.
- A **Task** is one frozen, estimable observable story inside a Stage.

Only one Delivery is active by default. This keeps base relationships and CI
receipts obvious. Stages inside it may run in parallel when the plan names
disjoint writes, one exact base and an integration owner. Uncertain overlap
serializes.

## Planning quality

A Task must say what changes, where, why and how success is observed. It names
exact writes, a concrete procedure, a deterministic RED command, predicted
active minutes and predicted credits.

- Bad: “Refactor the scheduler.”
- Good: “TASK_014 — assign two ready Stages with disjoint writes from one base;
  extend the existing scheduler parser; touch only the two named files; refuse
  an overlapping write set; predict 18 active min / 8 credits.”

A Stage forecast is at least the sum of its Tasks. A Delivery reports aggregate
active work, the longest dependency path and external waits separately.

## One source of truth and two locks

The canonical `docs/plans/<slug>.md` is the only plan copy. JSON files are
temporary command inputs or typed execution receipts. Git-local journals store
hashes and timers, never a second plan.

While status is `SPEC_DRAFT`, the agent may freely edit SPEC prose. After SPEC
approval, and especially after `APPROVED`, all mutations go through `planctl`.
The pre-commit hook refuses direct checkbox changes, rewritten Tasks, criteria,
forecasts or results without the HEAD/blob-bound mutation journal.

Scope changes require the owner's word through `planctl amend`. At night the
agent does not wait: it records alternatives, goal preservation, rollback base
and verification, commits the smallest reversible choice as
`owner_review_pending`, and continues. Ordinary shortfalls go to Deviations.

## Execution cadence

For each Task:

1. Run `planctl start-task <plan> --task <ID>`; read the printed frozen scope.
2. Write the named behavior test and show RED for the expected reason.
3. Implement the minimum change and show GREEN with the same narrow command.
4. Run only the 1–3 behavior files named by the Stage.
5. Micro-review the diff for scope, duplication and missing behavior.
6. Create the Stage work commit; hooks run `agent:verify:docs` and
   `agent:verify:commit`. Never bypass them.
7. Import a typed receipt with `planctl complete-task`; the runtime compares
   its paths with frozen Task writes and the actual commit diff.
8. Continue automatically to the next ready Stage.

At the PR Delivery boundary, the integration Stage joins the Stage commits,
refreshes dependencies with `agent:install`, then invokes `.githooks/pre-push`.
After a clean exact-head gate passes, the hook stores a Git-local SHA receipt;
the following `git push` reuses it instead of running the suite twice. CI
independently repeats the complete gate on the published ready-PR SHA. Final
review reuses unchanged receipts instead of buying the same suite again.

A green test is evidence only after the same test was observed RED against the
incomplete behavior.

## Failure and unattended behavior

- Hook or test failure: fix the cause and rerun the failed scope.
- Task scope no longer matches reality: owner amendment; at night use a
  complete reversible unattended decision and continue.
- Predicted time exceeded: record actuals; do not stop merely because an
  estimate was wrong.
- Unrelated file appears in the diff: remove it from the Stage or amend scope.
- Existing base failure: record its exact command/SHA; fix it only when it
  blocks the Delivery and the plan authorizes the change.
- Stop unattended work only for irreversible data loss, security damage or
  destruction of unmerged work.

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
