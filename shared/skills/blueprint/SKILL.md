---
name: blueprint
description: Create an owner-approved implementation plan through the portable planctl two-lock workflow. Use for non-trivial features and changes before implementation.
---

# Blueprint

Build the plan through the deterministic writer; do not hand-author locked
Markdown.

## Read first

Read these files completely:

1. `../../code-production/laws/development-process.md`
2. `../../code-production/laws/plan-format.md`
3. `../../code-production/laws/git-workflow.md`
4. the current project's `AGENTS.md` or `CLAUDE.md`, architecture docs and
   `package.json` agent scripts.

## Phase 1 — SPEC

1. Create a worktree and `feat/<slug>` branch from `origin/staging`.
2. Run `planctl init docs/plans/<slug>.md --title "<title>"` and commit the
   first draft.
3. Explore existing code before choosing architecture. Write Goal, user flows,
   metrics, constraints, reuse map and testable invariants in a temporary SPEC
   input, then run `planctl set-spec <plan> --from <spec.md>`.
4. When SPEC settles, open the draft PR and publish the plan with `mdurl`.
5. Ask one question: whether the owner approves SPEC. Stop here until yes.
6. On yes, run `planctl approve-spec <plan> --owner-word "<owner words>"`.

Bad Goal: “Make development faster.”

Good Goal: “On the first Delivery, reduce full product gates from five to one;
record predicted/actual active time, elapsed time, credits and rework; hand over
one ready green PR with no files outside frozen Task writes.”

## Phase 2 — implementation contract

1. Split the product into sequential PR Deliveries. The current pilot normally
   has one Delivery.
2. Make each Stage one delegable result and one work commit. Declare dependencies,
   symmetric parallel relations and exact non-overlapping writes.
3. Run `planctl put-stage --help`. Supply the documented JSON shape; do not
   invent another Markdown form.
4. Every Task states an observable story, exact writes, active-minutes/credits
   prediction, concrete How and exact RED command through
   `bun run agent:test:<lane> -- <target>`.
5. Include an integration Stage when parallel commits must be joined and the
   complete PR gate bought once.
6. Publish the updated `mdurl`, summarize Delivery critical path versus total
   active work, then ask whether the owner approves implementation. Stop until
   yes.
7. On yes, run `planctl approve-plan <plan> --owner-word "<owner words>"`.

Bad Task: “Refactor scheduler.”

Good Task: “TASK_014 — reject a second active job for the same account by
extending the existing admission guard in the two named files; RED is
`bun run agent:test:backend -- test/scheduler.test.ts -t tst_scheduler_014`;
predict 12 active min / 3 credits.”

After approval, never directly edit the plan or manually flip its boxes. Use
`planctl amend`, `start-task`, `complete-task`, `add-deviation` and
`close-stage`.
