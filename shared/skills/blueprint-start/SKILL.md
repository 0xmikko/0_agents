---
name: blueprint-start
description: Execute an approved plan when the owner explicitly selected the Blueprint/planctl workflow. Do not impose it on interactive work.
disable-model-invocation: true
---

# Blueprint Start

The owner must have explicitly selected this workflow. Continuing an already
authorized execution does not require selecting it or approving it again.

Call `progress` in the plan's existing checkout. Continue the running Task
from its checkpoint. The approved plan supplies scope and dependency order.

1. Call `start_task` for the running or next eligible Task. For a Delivery
   in another repository, use its configured checkout and declared branch.
2. Reproduce the missing behavior with the Task's RED command, make the
   smallest fix, then run that check GREEN and affected typechecks/tests.
3. Inspect the diff and commit useful completed work locally. Keep hooks enabled.
   Call `complete_task` with its Tasks, commit and result, then `close_stage`.
   Plan results ride the next work commit; final results use a closure commit.
4. Continue eligible work. Use `add_deviation` for a shortfall within scope.
   A scope change needs the owner's word through `amend`.
5. Use `needs_owner` only for a decision the agent cannot resolve inside the
   approved contract. State the concrete choice and consequences. Use
   `resume_task` after the answer. An ordinary repair or retry is not a new
   owner decision.

Use existing checks for the changed behavior and necessary targeted typechecks;
aim for a 20–60 second work loop. Broad checks belong at major integration or
publication boundaries, not each work commit. After a failure, repeat only the
failed or affected checks; reuse successful checks while their inputs are unchanged.
Do not skip necessary verification to meet the time target.

File and export inventories guide implementation; they are not an exhaustive
permission boundary. Adapt necessary callers, internal types and their locations,
helpers, generated declarations, harnesses and tests within the agreed behavior.
Record the reasons and affected files in execution results and continue. Missing
implementation types belong in that record, not an owner amendment to locked SPEC.
Ask only when a concrete decision changes the agreed behavior, compatibility,
constraints or acceptance criteria. Correct an accidental contract mismatch
autonomously. A tool refusal alone is not a new owner decision; diagnose and repair
authorized tooling rather than asking for wording to satisfy its inventory.
Preserve other agents' ownership and explicit protected-path requirements.

Run project agent:* commands directly in their checkout. Avoid shell wrappers
or redirections that prevent reusable command approvals from matching.
If the sandbox refuses a necessary command, retry that command with the tool's
approval mechanism and a narrowly reusable prefix.

Runtime freshness is diagnostic. A different installed commit does not prove
incompatibility. Run the needed operation, diagnose an actual failure, and make
the smallest authorized repair. A stack install also changes hooks and skills;
inspect its actual scope before using it. Do not make it a routine prerequisite.

Execute the whole approved plan, not just the current Delivery. For each
Delivery, finish its Stages, run its complete local gate, and invoke
review-implementation when its contract says `review: required` or the owner
requested it. Approval of that contract is already review authorization; do
not ask for a separate invocation. Review this Delivery's implemented changes,
not future Deliveries. Fix real findings and obtain focused verification of
the fixes from the reviewing role; do not repeat the full review at each commit.

Publish the checked Delivery through `publish_delivery`, confirm CI for the
exact published head, and repair actual failures within the existing scope.
Use `progress` or `gh run list` filtered by branch and head, then `gh run view`
or `gh run watch --exit-status`. A Checks API permission error is not proof
that Actions runs cannot be read; do not hand routine CI observation to the
owner. Preserve failure exit codes and keep publication hooks enabled.

Report a ready PR as progress, then call `start_task` for the next eligible
Task or Delivery. Follow the declared branches, repositories and dependency
order. When the contract permits a green unmerged parent, its child can proceed
from that verified code while keeping the project's PR destination rules.
Do not ask whether to continue after a Stage, review, ready PR or ordinary CI
wait. Completion of one Delivery is not completion of the plan. A status
question asks for a brief update; answer and resume the authorized work.

Stop for a concrete owner decision or an explicit external prerequisite that
cannot be satisfied within the existing authorization; continue independent
eligible work. Return the whole-plan result only when the approved scope is
finished or accurately blocked. Plan approval and green CI do not authorize
protected-branch merge, auto-merge or direct push; those remain the owner's
separate decision.

Delegate only when the owner or applicable instructions authorize it and the
plan provides disjoint writes. Preserve other agents' changes and processes.
