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
3. Inspect the diff and create one work commit per Stage. Keep hooks enabled.
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

An additional caller, file, move of an unchanged type or incomplete bookkeeping
does not by itself change the approved behavior. Repair these within the existing
authorization. Ask only for a material change of the agreed outcome, compatibility,
module responsibility or scope; a tool refusal is not a new approval requirement.
Keep plan records accurate through MCP rather than fabricating owner approval.

Run project agent:* commands directly in their checkout. Avoid shell wrappers
or redirections that prevent reusable command approvals from matching.
If the sandbox refuses a necessary command, retry that command with the tool's
approval mechanism and a narrowly reusable prefix.

Runtime freshness is diagnostic. A different installed commit does not prove
incompatibility. Run the needed operation, diagnose an actual failure, and make
the smallest authorized repair. A stack install also changes hooks and skills;
inspect its actual scope before using it. Do not make it a routine prerequisite.

After completing the work, run the project's complete local gate. When final
review is requested, run review-implementation now, before implementation push
and remote CI. Fix real findings and verify affected changes; fixes do not
automatically start another review. Then publish the checked head within the
existing authorization and confirm CI for that head. A PR or green CI is never
a prerequisite for review. Return the PR and plan URLs. The owner merges.

Within existing publication authorization, push the feature branch, create or
update its PR and follow CI to its result; do not hand these steps back to the
owner or ask for the same permission again. Return the PR link when it exists.
Use `progress` for CI; for details use Actions runs selected by repository and
exact PR head, then `gh run view` or `gh run watch --exit-status`. Do not use
`gh pr checks` or `statusCheckRollup` with the fine-grained PAT. Preserve failure
exit codes through logging. A routine CI wait needs no new owner message.

Plan approval, publication and green CI do not authorize protected-branch
merge, auto-merge or direct push. Only a separate explicit owner instruction
authorizes those actions on `staging` or `main`.

Delegate only when the owner or applicable instructions authorize it and the
plan provides disjoint writes. Preserve other agents' changes and processes.
