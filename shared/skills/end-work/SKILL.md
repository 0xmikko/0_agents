---
name: end-work
description: Close a merged Delivery — the three measures, one experiment in the register, one ledger row, the worktree gone. Use after the owner merged.
---

# End Work

1. Confirm the owner merged: the PR URL, the published head, the merge SHA on
   `origin/staging`. Never merge yourself.
2. The vendored `plan-gate <plan> --closure`: every Task and criterion
   closed, every registered temp root absent. Open boxes under Deviations
   are counted, not closed.
3. Print the three measures of this Delivery, each with its number:
   - planning: corrections about form and substance before approval;
   - execution: dumb questions, stops and gates bought;
   - retro: the status of the previous experiment, `planctl retro-status`.
   Refuse to close while the previous experiment has no status; ask the
   owner for `accepted` or `declined` and write it into the register.
4. Write one new experiment into the register at the end of the process law
   (`## Register of experiments`): the date, the Delivery, the experiment,
   an empty status the owner fills at the next retro.
5. The ledger row, one fixed form and nothing more:
   `| plan | implemented | Merged as #<PR> (<merge SHA>). <N> boxes open under Deviations. Experiment: <one line>. | <current document> | <plan> |`
6. Prove the worktree is clean and its branch merged; remove that worktree
   and only its registered temp roots.
7. Return the PR URL and the ledger row.
