---
name: end-work
description: Close an owner-merged Delivery with measured results, a compact retro, and safe temporary/worktree cleanup. Use after merge.
---

# End Work

This skill needs only the completed plan, Git, planctl and the PR.

1. Confirm the owner merged the PR. Record its Markdown URL, published head and
   merge SHA; never perform the merge yourself.
2. Run the vendored plan-gate with --closure. Refuse open Tasks, criteria,
   invalid receipts or registered temp leftovers.
3. Compare predicted with actual active time, elapsed time, credits, rework,
   review rounds and complete gates bought. State whether parallelism shortened
   the critical path.
4. Post one compact PR retro: what shipped, scope drift, estimate misses,
   duplicated work/testing and one small process experiment for the next PR.
5. Update the project plan ledger if it has one.
6. Prove the explicit feature worktree is clean and its branch merged, then
   remove that worktree and only its registered temp roots.
7. Return the clickable PR URL and cleanup result.
