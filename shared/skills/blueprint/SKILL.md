---
name: blueprint
description: Author an executable plan through planctl MCP, with owner approval of SPEC and then implementation. Use before non-trivial implementation.
---

# Blueprint

Work in the existing task checkout. Use planctl MCP for plan state and the
tool schemas for arguments. Project package.json agent:* scripts define checks.

1. Call `progress` with the root. Continue its plan when one exists;
   otherwise call `init`. Create a feature worktree only when isolation is
   needed. Commit a draft when useful; it remains SPEC_DRAFT until approved.
2. Inspect the existing implementation and canonical types. Write the Goal,
   behavior, evidence, reuse, constraints and acceptance cases in English.
   Declare changed types in Interfaces and justify proposed new names.
3. Send the complete SPEC through `submit_spec` with the returned revision
   and the owner's request. Preserve concrete findings and discussion.
   Fix blocking errors; assess advice against the task.
4. Show the published SPEC and ask for its approval. After the owner's yes,
   call `approve_spec` with their actual approval.
5. Use `put_delivery` for each PR and `put_stage` for each useful commit.
   Tasks name concrete changes, their writes, How and a scoped RED command.
   Include the files that own changed contracts. Derive estimates from the work.
   A Delivery in another repository names that repository; its checkout is
   configured with `code-production.repository.<name>`. Keep one shared plan.
6. Check that the implementation covers the Goal and acceptance cases.
   Show the complete contract and ask for approval. After the owner's yes,
   call `approve_plan` and commit the plan.

These are the two planning approvals. Approval is never inferred from a request
to investigate or revise a draft. Reviews run when the owner requests them.
Use `amend` under the owner's word for changes to an approved contract.
Existing approvals and task limits continue across interruptions and compaction.
