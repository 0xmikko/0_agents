# The plan, made with planctl

A plan is one file, `docs/plans/<slug>.md`, named after its branch. The agent
hand-writes one part of it, the SPEC; everything after it planctl writes from
the JSON the agent gives it, and after approval nothing but planctl writes at
all. The rendered Markdown is planctl's output; `start-task` prints what the
agent needs. The process around it: [development-process.md](development-process.md).

## 1. Create — `planctl init <plan> --title "<title>"`, then commit it

## 2. The SPEC — `planctl set-spec <plan> --from spec.md`

`spec.md` is prose in this order. The Goal: two or three lines, the owner's
measures, today's number, the target; what will be true, never "measure X",
never the problem. Why now: the problem, its numbers, its `file:line` anchors
on a pinned SHA. The target, as detailed as the task is deep: the process as
a flow (a mermaid diagram, a table of its stages); the design as the screen
will look; Interfaces, every new or changed type as a hand-written TypeScript
interface, one field per line, with the zod schema that decodes into it; Code
where the algorithm is the decision; What changes and what leaves; the Target
tree, one line of purpose per file; Verification; Invariants, each a named
test written red before the Stage that makes it true; Constraints and
non-goals; Reuse, the mechanism the change extends and the search that proved
nothing covers it; Deliveries. New names: a table of every word the
repository and the vocabulary page lack, with its reason. Not verified: what
the plan claims without having run it.

`plan-gate` (the linter, then the judge) passes before the owner reads. The
owner's first yes: `planctl approve-spec <plan> --owner-word "<their words>"`.

## 3. The Stages — `planctl put-delivery`, `planctl put-stage`

`put-delivery <plan> --from delivery.json`, one Delivery is one pull request:

    {"id":"D1","title":"<the PR title>","branch":"feat/<slug>","depends":[],
     "gate":["backend"],"active":true,"stageGraph":"D1-S1 -> D1-S2",
     "predictedExternalWaitMinutes":0,
     "description":"<the PR text: for people / in the code / proven by / not in this PR>"}

`put-stage <plan> --from stage.json`, one Stage is one commit; its
`description` is the commit message (solves, builds, proves, subject, body):

    {"id":"D1-S1","deliveryId":"D1","title":"<the commit subject>",
     "owner":"agent-1","profile":"strong","depends":[],"parallelWith":[],
     "writes":["src/scheduler/overlap.ts","test/scheduler/overlap.test.ts"],
     "tempRoot":".tmp/code-production/<slug>/D1-S1",   // <slug>: the plan file's name
     "predictedActiveMinutes":0,"predictedCredits":0,"verifyActiveMinutes":0,"verifyCredits":0,
     "description":"What this Stage solves. …\n\nWhat is built. …\n\nHow it is proven. …\n\nCommit. …",
     "tasks":[{"id":"SCH_001","story":"<one change, under 200 characters>",
               "writes":["src/scheduler/overlap.ts","test/scheduler/overlap.test.ts"],
               "predictedActiveMinutes":0,"predictedCredits":0,
               "how":"<the change, one line or steps>",
               "red":"bun run agent:test:backend -- test/scheduler/overlap.test.ts -t tst_sch_001"}],
     "criteria":["`bun run agent:test:backend -- test/scheduler/overlap.test.ts` exits 0 — the overlap is refused",
                 "Commit"]}

Writes are files, directories or globs: the contract the commit is checked
against. Minutes and credits are 0, they are not forecast. A criterion is a
command with its exit code and what the exit proves, or `Commit`; a
measurement only this machine can make is prose with its number. The same id
again replaces the draft; `remove-stage` deletes it. The owner's second yes:
`planctl approve-plan <plan> --owner-word "<their words>"`.

## 4. Working it

`start-task <plan> --task <id>` prints the contract and starts the clock.
After the commit, `complete-task <plan> --from stage-result.json`:

    {"version":1,"plan":"docs/plans/<slug>.md","deliveryId":"D1","stageId":"D1-S1",
     "taskIds":["SCH_001"],"commit":"<sha>","startedAt":"<from start-task>","endedAt":"<UTC>",
     "activeMinutes":11.5,"elapsedMinutes":11.5,"usage":{"kind":"unavailable","reason":"<why>"},
     "paths":["<every file the commit touched>"],"tests":[{"id":"tst_sch_001","command":"<the red command>"}],
     "result":"<what is true now>","deviations":[],"tempRoots":[{"path":"<tempRoot>","state":"absent"}]}

Then `add-deviation --stage --reason` for a shortfall, `approve-stage --stage
--owner-word` and `stage-approved --stage` for the owner's word on a Stage,
`close-stage --stage` when its commands are green, `amend --owner-word --patch
patch.json` (`{"section":"spec"|"implementation","find":"…","replace":"…"}`)
for a change of meaning. Approval freezes the SPEC's bytes, the Goal, the
target tree, the Stage headings and the criteria; the pre-commit hook refuses
a direct edit. A measured number goes to the result row, never into a criterion.

## The linter

`plan-gate` refuses, before the owner reads: a missing SPEC section; a box
that is not a command with its exit code or `Commit`; a mermaid block that
does not parse; a synonym of a vocabulary term or a plan code in prose; a
sentence over thirty words; an `export interface` or `export type` a Stage
commit adds that the SPEC's Interfaces block does not name. The judge,
`plan-gate --judge`, answers what a linter cannot: is the Goal a goal, does
each Stage read as a commit, are the names existing ones, is the prose plain.

## Forbidden

Opening with the problem. Minutes and credits. DEC-numbered decisions and
criteria that cite other criteria. Tests that assert file layout or a hand-kept
list. `status: approved` written by the agent. Boxes that mirror CI or merge
state. A second copy of an existing mechanism. Vision prose.
