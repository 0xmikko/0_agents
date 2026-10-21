---
name: end-work
description: Report an owner-merged Delivery and clean only its verified disposable worktree and temporary files.
---

# End Work

1. Call `progress` and verify that the owner merged the Delivery.
2. Report what shipped, the PR URL, measured results from the plan and
   `planctl stats --since <plan date>`, and material gaps. Do not invent
   unavailable cost or timing data.
3. Update an existing project ledger when the task requires it. Post a PR
   comment only when the owner requested one.
4. Remove only the task's clean, fully merged worktree and its registered
   temporary files when cleanup is authorized. Preserve unpublished work.

Do not create another plan, experiment register or approval merely to close
completed work. The owner performs merges.
