---
name: blueprint
description: Turn a rough product idea into an owner-approved, executable plan with one PR Delivery and commit-sized Stages. Use before non-trivial implementation.
---

# Blueprint

Produce one plan at docs/plans/<slug>.md. This skill is repository-agnostic:
project commands come only from package.json scripts named agent:*, and all
plan mutations go through planctl.

## SPEC

1. Create feat/<slug> from origin/staging in its own worktree. Run:

       planctl init docs/plans/<slug>.md --title "<title>"

   Commit the plan immediately.
2. Explore existing code before proposing new mechanisms. Agree on the Goal,
   user flows, success metrics, constraints, reuse and testable invariants.
3. Write the SPEC with:

       planctl set-spec <plan> --from <spec.md>

4. Open the draft PR when the SPEC is coherent and publish the plan with mdurl.
5. Ask whether the owner approves the SPEC. This is a hard stop.
6. After an explicit yes, run planctl approve-spec with the owner's words.

Bad Goal: “Make development faster.”

Good Goal: “Deliver one ready PR while measuring predicted versus actual active
time, elapsed time and credits; run the complete product gate once locally and
once on the published CI SHA.”

## Implementation contract

1. One Delivery is one PR. Each Stage is one delegable result and one work
   commit. Do not parallelize multiple Deliveries by default.
2. A Task names the observable problem, exact writes, and a concrete method
   that repeats every exact path with the behavior changed there. It also
   names one exact RED command and predicted active minutes/credits. RED uses:

       bun run agent:test:<backend|frontend|e2e> -- <exact-target>

3. Independent Stages may run in parallel only when their writes do not
   overlap. Declare dependencies and integration order.
4. Add Stages through planctl put-stage using its --help JSON format. Do not
   hand-author implementation Markdown.
5. Check that every Goal, flow and invariant is covered; each Task is
   independently executable; estimates and the critical path are explicit.
6. Publish the updated mdurl and ask whether the owner approves the complete
   plan. This is the second hard stop.
7. After an explicit yes, run planctl approve-plan with the owner's words.

Bad Task: “Extend the existing parser in the named files.”

Good Task: “D1-S2-T1 — src/scheduler/admission.ts currently admits a second
active job for the same account; change src/scheduler/admission.ts to return
the conflict and add the RED case to test/scheduler/admission.test.ts; RED is
bun run agent:test:backend -- test/scheduler/admission.test.ts -t
tst_scheduler_014; estimate 12 active min / 3 credits.”

After approval, never edit the plan or checkboxes directly. Use planctl amend,
start-task, complete-task, add-deviation and close-stage.
