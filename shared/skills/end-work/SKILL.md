---
name: end-work
description: Close a merged Delivery with metrics, PR retro, ledger update and safe worktree/temp cleanup. Use after the owner merges.
---

# End Work

Read `../../code-production/laws/development-process.md` and the completed plan.
The owner merges; this skill records what actually happened.

1. Confirm the PR was merged and record PR URL, merge SHA and published head.
2. Run
   `bun .agents/code-production/runtime/plan-gate.ts <plan> --closure` and
   refuse open Tasks/criteria or invalid receipts.
3. Compare forecast with actual active minutes, elapsed/waits, credits, rework,
   review rounds and full gates bought.
4. Post the compact scorecard/retro to the PR: scope drift, estimate misses,
   parallel critical-path effect, duplicated verification and one small process
   experiment for the next Delivery.
5. Update the plan ledger when the project has one.
6. Confirm registered temp roots are absent. Remove only the explicit inactive
   feature worktree after proving its branch is merged and clean.
7. Return the clickable PR Markdown URL and cleanup outcome.
