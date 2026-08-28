---
doc_type: target
status: approved
derived_from: magnis-process-pr-227
implementation_anchors:
  - global:shared/code-production/runtime/planctl.ts
  - global:shared/code-production/runtime/plan-update.ts
  - global:shared/code-production/runtime/plan-gate.ts
  - global:shared/code-production/templates/hooks/pre-commit
  - global:shared/code-production/templates/github/code-production.yml
---
<!-- DOC-CLASSIFICATION:START -->
> Approved shared process contract; `agent-stack install` supplies enforcement.
<!-- DOC-CLASSIFICATION:END -->

# Plan protocol — agent card

## Ten steps

1. Create the plan in its own worktree; commit its first draft.
2. Settle SPEC: Goal, flows, metrics, reuse, constraints and invariants.
3. Open/update the draft PR; publish the plan with `mdurl`.
4. **HARD STOP 1:** owner approves SPEC; run `planctl approve-spec`.
5. Add PR Deliveries, commit-sized Stages, concrete Tasks, forecasts, writes and RED tests.
6. **HARD STOP 2:** owner approves implementation; run `planctl approve-plan`. Direct plan editing ends.
7. Execute exactly one active PR Delivery. Parallelize only explicitly disjoint Stages.
8. Before RED, call `planctl start-task`; then RED → code → GREEN → micro-review → one work commit → `complete-task`.
9. Integration Stage merges commits, runs affected full gates once and makes the existing PR ready.
10. Hand over a green mergeable PR, Markdown GitHub URL, `mdurl`, actual metrics and zero temp roots. Owner merges.

## Hierarchy

```text
Plan
└── PR Delivery D1       one active branch, PR and publication gate
    ├── Stage D1-S1      one delegable TDD result and work commit
    │   └── Task CPP-001 one frozen, estimable observable story
    └── Stage D1-S2      Integration: join, verify, publish
```

- Child agents never edit the plan; they return a commit and typed receipt. The integrator uses `planctl`; `plan-update` remains its single mutation engine.
- Parallelize only declared disjoint writes from one exact base. Uncertain relations serialize.
- The Markdown file in `docs/plans/` is the sole contract source of truth. JSON files are inputs/receipts; Git-local journals and timers contain hashes/runtime facts, never a plan copy.

## Examples

**Goal**

- Bad: “Make development faster and cheaper.”
- Good: “Use the first pilot Delivery as baseline; record forecast/actual time, waits, credits, rework and gates; hand over one green ready PR with zero unauthorized scope changes.”

- Bad: “PR 1: backend.”
- Good: “D2 Sync runtime is one PR. D2-S1 supervisor and D2-S2 admission are independent commits; D2-S3 integrates and buys the complete project gate once.”

**Task**

- Bad: “Refactor the scheduler.”
- Good: “CPP-014 — assign two ready Stages with disjoint writes to two lanes from one base; extend the existing parser; touch only named files; predict 18 min / 8 credits; refuse overlap.”

- Bad: “Done; tests green.”
- Good: “CPP-014 → `abc1234`; expected RED observed; named test passed; 18 predicted / 21 actual min; usage unavailable because runner omitted tokens; no deviation; temp root absent.”

## Stage format

```markdown
#### Stage D1-S1 — <one observable result>
Owner: <integrator|child>; Profile: <fast|strong>; Depends: <IDs|none>.
Parallel with: <IDs|none>; Writes: `<exact paths>`; Predict: <min>/<credits>.
Temp root: `.tmp/code-production/<plan-slug>/<Stage-ID>`; absent at handoff.

##### Tasks
- [ ] CPP-001 — <observable story>
      Writes: `<exact Task paths>`.
      Predict: <active min> / <credits>.
      How: <procedure and exit>.
      RED: `<deterministic test command>`

##### Acceptance criteria
- [ ] `<command>` exits 0 — <behavior proved>
- [ ] <reviewable outcome>
- [ ] Commit

##### Results
| Task | Commit | UTC start-end | Active/elapsed | Usage | Result/proof |
|---|---|---|---:|---|---|
```

Forecast aggregate work, longest dependency path and external waits separately. Never divide work by agent count and call it wall time. Missing usage is `unavailable`, never zero.

## Profiles

| Profile | Use | Refuse |
|---|---|---|
| `fast` | narrow low-risk Stage, explicit writes, local tests | migrations, security, concurrency, shared contracts, unclear scope |
| `strong` | shared/risky work, integration, review, unattended decisions; no model race | protected merge or hidden decision |

## Verification

| Boundary | Run |
|---|---|
| inner loop | exact RED/GREEN file, optionally one named test |
| Stage commit | 1–3 behavior files, micro-review, mapped hook |
| Delivery publication | merge staging, both installs, affected full gates once, cumulative review |
| CI | relevant complete gates on exact published SHA |
| final review | reuse unchanged exact-head receipts |

A green test counts only after it failed for the expected reason against incomplete behavior.

## Plan writer

```bash
planctl --help
planctl init <plan> --title <title>
planctl set-spec <plan> --from <spec.md>
planctl approve-spec <plan> --owner-word <word>
planctl put-delivery <plan> --from <delivery.json>
planctl put-stage <plan> --from <stage.json>
planctl approve-plan <plan> --owner-word <word>
planctl start-task <plan> --task <Task-ID>
planctl complete-task <plan> --from <stage-result.json>
planctl close-stage <plan> --stage <D1-S1>
planctl add-deviation <plan> --stage <D1-S1> --reason <text>
planctl amend <plan> --owner-word <word> --patch <patch.json>
planctl verify <plan>
planctl verify-staged <plan>
```

`planctl` is the small agent interface; it delegates locks, splices, receipts and
the HEAD/blob-bound journal to `plan-update`. Direct `Edit`, `Write`,
`apply_patch`, search/replace or manual checkbox changes have no journal and are
refused.

`put-stage --help` prints the copyable JSON contract plus good/bad Tasks.
`start-task` re-reads the committed plan or its journal-verified staged Result,
refuses a blocked or closed Task, prints its exact scope and starts a Git-local
timer without changing the plan. `complete-task` consumes that timer and compares the
receipt's paths with both Task writes and the actual work-commit diff.

## Unattended, temp and handoff

- At night, decide instead of waiting: record goal, decision, alternatives, reason, scope, rollback base and verification; commit the smallest reversible change; continue as `owner_review_pending`.
- Each Delivery registers one temp root; each Stage owns a child. Result import and publication refuse leftovers. Remove only registered inactive paths; never scan `/tmp`.
- A shortfall appends to Deviations and work continues. Only irreversible data loss, security damage or destruction of unmerged work stops an unattended run.
- Handoff: `[PR #N — title](GitHub URL)`, plan `mdurl`, exact head, green CI, mergeable state, actual active/elapsed/waits/usage/rework/gates, temp roots absent and explicit gaps.

## Refusals

| Refusal | Legal response |
|---|---|
| stale lock/hash | reload; owner amendment or complete unattended decision |
| second active Delivery | finish or close the current one |
| overlapping/uncertain parallel work | serialize |
| non-ancestral result commit | merge the Stage commit, then import |
| result differs from frozen Task/writes | correct receipt or amend; never rewrite history |
| temp root exists | promote evidence, remove that registered path, retry |
| raw approved-plan edit | discard it and repeat through `planctl` |

## Pilot rule

Change this process only from observed Delivery receipts. Start with this small
contract, run a real PR end to end, and amend the shared stack one measured
problem at a time.
