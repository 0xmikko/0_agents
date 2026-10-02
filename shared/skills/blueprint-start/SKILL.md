---
name: blueprint-start
description: Execute an approved plan through planctl MCP with scoped verification and one complete publication gate.
---

# Blueprint Start

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

Run project agent:* commands directly in their checkout. Avoid shell wrappers
or redirections that prevent reusable command approvals from matching.
If the sandbox refuses a necessary command, retry that command with the tool's
approval mechanism and a narrowly reusable prefix.

Runtime freshness is diagnostic. A different installed commit does not prove
incompatibility. Run the needed operation, diagnose an actual failure, and make
the smallest authorized repair. A stack install also changes hooks and skills;
inspect its actual scope before using it. Do not make it a routine prerequisite.

At publication, run the project's complete gate, push the checked head, and
confirm that CI passed for that head. Return the PR and plan URLs. The owner
merges. Review-implementation runs only on request, after the completed work
and its checks are ready; fixes do not automatically start another review.

Delegate only when the owner or applicable instructions authorize it and the
plan provides disjoint writes. Preserve other agents' changes and processes.
