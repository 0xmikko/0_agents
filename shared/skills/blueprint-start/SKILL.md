---
name: blueprint-start
description: Execute an approved portable plan through planctl, one Task-scoped TDD loop and one work commit per Stage. Use when implementation starts.
---

# Blueprint Start

Read `../../code-production/laws/development-process.md` and the approved plan
completely. Run `agent-stack check` and `planctl verify <plan>` before editing
product code.

## Delivery loop

1. Work only in the plan's feature worktree/branch. Confirm its PR is open and
   the Plan says `APPROVED`.
2. Run `bun run agent:install` after merging `origin/staging`.
3. Select only ready Stages. Parallelize exactly the Stages whose declared
   writes are disjoint; otherwise serialize. Each child gets the same base,
   Stage text and exact Task IDs, and returns commits/receipts without editing
   the plan.
4. Before each Task's RED, run:

   ```bash
   planctl start-task <plan> --task <TASK_ID>
   ```

5. Run the printed exact test and observe expected RED. Implement the minimum,
   rerun the same command GREEN, then the Stage's 1–3 behavior files.
6. Micro-review scope and duplication. Commit once for the Stage; never bypass
   hooks.
7. Import the typed result after the work commit:

   ```bash
   planctl complete-task <plan> --from <stage-result.json>
   planctl close-stage <plan> --stage <D1-S1>
   ```

8. Continue to the next ready Stage without asking for a routine handoff.
9. The integration Stage merges parallel commits, cleans registered temp roots,
   runs `bun run agent:install`, then `bun run agent:verify:pr` once.
10. Push the exact green head, let CI repeat the gate, mark the PR ready, and
    hand over its Markdown URL plus plan `mdurl`. The owner merges.

If scope changes, use owner-authorized `planctl amend`. Unattended, record a
complete reversible decision and continue. Time overrun and ordinary shortfall
are measurements/Deviations, not reasons to wait overnight.
