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
2. Give each Stage a result-oriented title, never branch history. Supply its
   owner/profile, dependencies, parallel set, writes and temp root in the
   `put-stage` JSON; `planctl` renders that compact Stage block once.
3. A Task story names one concrete change and every write path (full path or
   basename), fits 200 characters and owns at most four writes. Split
   independent changes. Never point to “the new files”, “the rename map”, “as
   discussed”, chat history or a colleague's branch.
4. Supply exact writes, one RED command, predicted active minutes/credits and
   How in the Task JSON. The rendered Task is the story with `(N min)` plus one
   hidden metadata line; `start-task` reveals the full contract. RED uses:

       bun run agent:test:<backend|frontend|e2e> -- <exact-target>

5. Derive each Stage forecast exactly: Task sum plus an explicit verification
   share, for both active minutes and credits.
6. Trace each acceptance story through public calls before approval. If one
   service must call a new method on another service, include the method's
   owning file in a Task's writes. Missing required scope invalidates the
   decomposition.
7. Independent Stages may run in parallel only when their writes do not
   overlap. Declare dependencies and integration order.
8. Add Stages through planctl put-stage using its --help JSON format. Do not
   hand-author implementation Markdown.
9. Check that every Goal, flow and invariant is covered; each Task is
   independently executable; estimates and the critical path are explicit.
10. Publish the updated mdurl and ask whether the owner approves the complete
   plan. This is the second hard stop.
11. After an explicit yes, run planctl approve-plan with the owner's words.

Bad Stage: “Finish the colleague's branch: build fixes and Verify rewire.”

Good Stage: “Restore the preview build after the Verify rename.”

Bad Task: “Apply the rename map in the named files.”

Good Task story: Restore `creditOperationMarket` in
`src/onchain/market/credit/index.ts`.

Good Task story: Replace generic `Error` in `src/prepare/result.ts` with
`SDKError`; cover it in `test/prepare/result.test.ts`.

After approval, never edit the plan or checkboxes directly. Use planctl amend,
start-task, complete-task, add-deviation and close-stage.
