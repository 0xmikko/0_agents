---
name: blueprint
description: Author a plan through planctl MCP only when the owner explicitly requests Blueprint or this planning workflow. Never propose or start it automatically.
disable-model-invocation: true
---

# Blueprint

Use this workflow only at the owner's explicit request. Ordinary interactive
research, documentation and implementation stay interactive; do not ask the
owner to select a mode. Follow the existing document standard in the project's
`docs/plan-format.md` (shared source: `shared/code-production/laws/plan-format.md`).

Work in the existing task checkout. Use planctl MCP for plan state and the
tool schemas for arguments. Project package.json agent:* scripts define checks.

1. Call `progress` with the root. Continue its plan when one exists;
   otherwise call `init`. Create a feature worktree only when isolation is
   needed. Commit a draft when useful; it remains SPEC_DRAFT until approved.
2. Read `vocabulary` and use `check_content` for one flow with its adjacent
   interfaces and example. Jev advice is bounded and does not establish approval.
   Trace the behavior through existing callers, types and tests. Discuss one
   coherent flow at a time and retain the decisions and evidence.
   Write the SPEC in English: The Goal states the observable outcome; The target
   describes the finished system, not the migration from today's code.
   Explain triggers, operations, owning modules, data, results and failure paths.
   Include readable diagrams, owning files, reuse and meaningful acceptance cases.
   Declare changed typed Interfaces and justify new names against the canonical
   vocabulary. Preserve existing wire names. Do not add a Why now section.
3. Send the complete SPEC through `submit_spec` with the returned revision
   and the owner's request. Preserve concrete findings and discussion.
   Fix blocking errors; assess advice against the task.
4. Show the published SPEC and ask for its approval. After the owner's yes,
   call `approve_spec` with their actual approval and the displayed `expectedRevision`.
   Agreement with one paragraph does not approve the whole SPEC.
5. Use `put_delivery` and `put_stage` one-to-one: one Stage ends in one PR.
   A Stage may contain several local work commits. Keep older approved plans intact.
   Tasks name concrete changes, their writes, How and a scoped RED command.
   Include the files that own changed contracts. Derive estimates from the work.
   A Delivery in another repository names that repository; its checkout is
   configured with `code-production.repository.<name>`. Keep one shared plan.
6. Check that the implementation covers the Goal and acceptance cases.
   Show the complete contract and ask for approval. After the owner's yes,
   call `approve_plan` with its displayed `expectedRevision` and commit the plan.

These are the two planning approvals. Approval is never inferred from a request
to investigate or revise a draft. Reviews run when the owner requests them.
Use `amend` under the owner's word for changes to an approved contract.
Existing approvals and task limits continue across interruptions and compaction.
