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
2. Write the owner view for reading, not as an execution dump:
   - a Stage is only its title, one Result sentence and one Route line; no
     narrative paragraph or file dump;
   - a Task names one concrete change and its exact primary file;
   - a Task is at most 180 characters/two rendered lines and owns no more than
     three write paths;
   - split independent actions; never point to “the named files”, “the map
     above”, chat history or a colleague's branch.
3. Supply exact writes, one RED command, predicted active minutes/credits,
   owner/profile and temp root in the `put-stage` JSON. `planctl` stores this
   execution metadata once; do not repeat it in Stage prose or Task prose. RED
   uses:

       bun run agent:test:<backend|frontend|e2e> -- <exact-target>

4. Trace each acceptance story through public calls before approval. If one
   service must call a new method on another service, include the method's
   owning file in a Task's writes. Missing required scope invalidates the
   decomposition.
5. Independent Stages may run in parallel only when their writes do not
   overlap. Declare dependencies and integration order.
6. Add Stages through planctl put-stage using its --help JSON format. Do not
   hand-author implementation Markdown.
7. Check that every Goal, flow and invariant is covered; each Task is
   independently executable; estimates and the critical path are explicit.
8. Publish the updated mdurl and ask whether the owner approves the complete
   plan. This is the second hard stop.
9. After an explicit yes, run planctl approve-plan with the owner's words.

Bad Stage: “Finish the colleague's branch: build fixes and Verify rewire.”

Good Stage: “Restore the preview build after the Verify rename.”

Bad Task: “Apply the rename map in the named files.”

Good Task: D1-S2-T1 — Restore the missing `creditOperationMarket` export in
`src/onchain/market/credit/index.ts`.

Good Task: D1-S2-T2 — Replace generic `Error` in `prepareResult` in
`src/prepare/result.ts` with canonical `SDKError`.

After approval, never edit the plan or checkboxes directly. Use planctl amend,
start-task, complete-task, add-deviation and close-stage.
