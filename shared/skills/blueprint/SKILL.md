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
2. Read `vocabulary` and inspect only the code needed for one coherent flow.
   Explain what happens, then show its complete final TypeScript data and API
   types beside that explanation. Explain significant fields and relevant
   operations or failures so the owner can reason about the types and flow.
   Use `check_content` on that piece and show a useful fragment early; expand
   the plan in short iterations, retaining decisions and evidence. Jev advice
   is bounded and does not establish approval. Fragment checks add no approval
   stops. A question about a field or implementation is discussion, not an
   instruction to change the plan or approval of a contract.
   Write in English. The Goal states the outcome; Target shows only the finished
   system. Use hand-written field lists, not database declarations, verbal
   patches or Partial/Omit/Pick that hide the changed fields. Cite unchanged
   canonical contracts and preserve existing wire names. Explain necessary
   technical names where they arise. Use a concrete example when useful.
   Keep file inventories and migration steps in the implementation sections.
   Use diagrams when they clarify the flow; avoid fixed maps, repeated prose
   and compliance narration. A wording correction keeps the agreed design and
   focuses on the affected passage, rather than restarting architecture research.
   Declare changed types and justify proposed new names. Do not add Why now.
3. Send the complete SPEC through `submit_spec` with the returned revision
   and the owner's request. Preserve concrete findings and discussion.
   Fix blocking errors; assess advice against the task. When writing feedback
   identifies unreadable prose or an incomplete target, rewrite that passage
   before presenting it. Preserve the agreed behavior and required detail.
4. Show the published SPEC and ask for its approval. After the owner's yes,
   call `approve_spec` with their actual approval and the displayed `expectedRevision`.
   Agreement with one paragraph does not approve the whole SPEC.
5. Use `put_delivery` and `put_stage` one-to-one: one Stage ends in one PR.
   A Stage may contain several local work commits. Keep older approved plans intact.
   Tasks name concrete changes, their writes, How and a scoped RED command.
   Include the files that own changed contracts. Derive estimates from the work.
   A Delivery in another repository names that repository; its checkout is
   configured with `code-production.repository.<name>`. Keep one shared plan.
   Set the Delivery's `review` to `required` when the owner requests final review;
   otherwise leave it unset. Do not invent a new approval step.
6. Check that the implementation covers the Goal and acceptance cases.
   Show the complete contract and ask for approval. After the owner's yes,
   call `approve_plan` with its displayed `expectedRevision` and commit the plan.

These are the two planning approvals. Approval is never inferred from a request
to investigate or revise a draft. Reviews run when the owner requests them.
Use `amend` under the owner's word for changes to an approved contract.
Existing approvals and task limits continue across interruptions and compaction.
