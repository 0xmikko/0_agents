---
doc_type: current
status: verified
derived_from: magnis-process-pr-227
implementation_anchors:
  - global:planctl/src/core/plan-gate.ts
  - global:planctl/src/core/plan-update.ts
---

# The plan format

One page of law for every plan in `docs/plans/`. The worked exemplar the
owner shaped sets the tone; `planctl` and the managed hooks enforce mechanics.
The process around plans (cadence, micro-review, the two-mode contract)
lives in [development-process.md](development-process.md).

## Sections, in this order

The SPEC is the part the owner reads. Eight sections, these headings, this
order; `planctl` reports every missing or empty one at once. No size limit:
the best plans ran to two thousand lines. What the SPEC never carries is
history: it says what WILL be, and the past appears only as one sentence
"now X" where X is being fixed.

1. **The Goal** — first, always. One to four numbered outcomes the owner
   will see when the work is done. Each outcome names its measure: a
   number, a count, a time, or the exact observable state before and after.
   It promises only what the request asks: no vision, no how, no extra
   scope. Plain English, one sentence per outcome.
2. **Why now** — at most ten lines, dated: what is broken today and what it
   costs. Not a history.
3. **The target** — how it looks when done: a mermaid flowchart that
   underlines the one architectural decision, and the **Interfaces** in
   TypeScript rather than prose — every exported type the plan changes is
   declared here, because completion refuses a changed exported type the
   SPEC does not name.
4. **Target tree** — every file the plan creates or modifies, one line of
   purpose each.
5. **Invariants** — plain one-pass statements; each names the test that
   proves it.
6. **Reuse** — what existing code the change extends. A second copy of an
   existing mechanism means the plan is wrong.
7. **New names** — a name/reason table for every word the repository does
   not already use.
8. **Not verified** — what this plan does not prove and why, measured facts
   apart from inferred ones.

Amendments and Deviations are Execution log lines `planctl` writes under the
owner's word or the agent's decision; nobody hand-authors them.

## The implementation contract

Sequential PR Deliveries, each containing Stages. `planctl` renders this owner-view shape; the hidden comment is abbreviated
   below and agents never hand-author it:

   ```markdown
   ### PR Delivery D1 — <one coherent PR result>

   Branch: `feat/scheduler-overlap`; Depends: none; Gate: backend.

   Stage graph: `D1-S1 -> D1-S2`.

   Forecast: <active minutes and credits summed over the Stages> across <n>
   Stages; longest dependency path <minutes along `depends`>; external waits
   <`predictedExternalWaitMinutes`: owner reviews, CI runs, other people>.
   Derived by planctl on every put-stage, frozen by approve-plan, compared
   with the Stage Results in the scorecard.

   What changed for people. <The Delivery `description`: the pull request
   text as of the merge — what changed for people, what changed in the code,
   how it was proven, what is not in this PR. Paragraphs. A Delivery without
   it is refused.>

   #### Stage D1-S1 — Reject overlapping scheduler work

   Owner: agent-1; Profile: fast; Depends: none; Parallel with: none.
   Writes: `src/scheduler/parse-lanes.ts`, `test/scheduler/parse-lanes.test.ts`.
   Temp root: `.tmp/code-production/scheduler-overlap/D1-S1` (must be absent at handoff).
   Predict: 12 active min / 3 credits.
   Of which verification: 2 active min / 1 credits.

   feat(scheduler): reject overlapping Stage writes

   <The Stage `description` is the future commit message of the finished
   Stage, written before the work: the subject line first, then what was
   done for which Goal outcome and why this way, then how it is proven.
   Past tense, as the agent will report it. Paragraphs; meaning over
   volume. A Stage without it is refused; start-task prints it.>

   ##### Tasks

   - [ ] D1-S1-T1 — Reject overlapping Stage writes in `src/scheduler/parse-lanes.ts` and cover the refusal in `test/scheduler/parse-lanes.test.ts`. (10 min)
   <!-- plan:task-meta:<hidden writes, credits, How and RED> -->

   ##### Acceptance criteria

   - [ ] `<scoped command>` exits 0 — overlap is rejected
   - [ ] Commit

   ##### Results
   | Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
   |---|---|---|---:|---|---|
   ```

   The Task is exactly two source lines: one rendered story with its active-time
   forecast, then one hidden `plan:task-meta` comment containing exact writes,
   credits, How and RED. `planctl start-task` prints that hidden contract to the
   executor. Legacy five-line Tasks remain readable but are never generated.

   A Task story is one concrete change, no more than 200 characters. Stage
   writes are folders (`dir/`); Task writes are the files inside them. The
   commit is checked against both: a file inside the Stage folders but
   beyond the Task writes is named in the result row, not refused; a test
   may live anywhere; a file outside the Stage folders refuses; a protected
   path (`.github/`, `.githooks/`, `.claude/`, `.agents/`, `.codex/`,
   `CLAUDE.md`, `AGENTS.md`) refuses unless the Task names it. Split
   independent actions instead of hiding them in a rename map or branch
   history.

   ```markdown
   Bad:  D1-S2-T1 — Finish the colleague's half-landed Verify rewire in the named files.
   Good: D1-S2-T1 — Restore `creditOperationMarket` in `src/onchain/market/credit/index.ts`. (8 min)
   ```

   The Stage metadata is visible once; it is not copied into every Task. The
   Stage title names the commit result, not branch history. A Task must make
   sense without its hidden How, another Task, chat or a colleague's branch.
   “New files”, “rename map” and “as discussed” are unresolved references and
   are rejected.

   Stage forecast is derived, never guessed independently:
   `Stage = sum(Tasks) + verification`, for both active minutes and credits.
   The Task minutes stay beside each story; the verification share and total
   stay in the Stage block.

   A criterion carries its asserted RESULT in its own line: the number
   reached, the behavior proven, the thing now absent. A bare "test file
   exits 0" is not a criterion — name what the test proves.
   (Judge-validated in the Stage 11 tournament.)

   Each Stage registers `.tmp/code-production/<plan-slug>/<Stage-ID>` as its
   temp child; its receipt proves the child absent. A legitimate fan-out names
   its unit count and produces one commit per unit.

   **A measured result is written to `#### Results`, never into the text
   of a task or a criterion** (owner ruling, 2026-08-24). The task says
   what to reach; the Results block says what was reached. Writing the
   number back into the task rewrites the agreement to describe its own
   outcome — and it is refused anyway, because appending to a criterion is
   not one of the four free deltas. A criterion that instructs "append the
   measured number to this line" is unreachable by construction, which is
   the specimen this rule comes from.

   A stage that touches TIME, PARSING, or CONCURRENCY names its
   adversarial cases in these criteria BEFORE code: the malformed input
   and its refusal, the double tick and its single run. In the closed-PR
   retro (2026-08-21) seven of nine review blockers on the triggers
   branch were exactly this class, found after the code instead of in
   ten minutes of planning.

   Read in order, Stage titles and Task stories tell the plan's whole story
   without exposing execution metadata. A Stage is a coherent commit, not a
   bucket for unrelated cleanup.
## The owner screen

Every `planctl` write republishes the plan and returns its URL with a
three-line reply the agent shows the owner verbatim: the plan URL, the
revision and state, the check counts. The owner reads the SPEC in its own
order: the Goal, Why now and the diagram first. No separate publish step,
no pre-approval summary rewritten by hand: the plan itself is the screen,
and a correction lands as an amendment under the owner's word.

## Two locks and one writer

HARD STOP 1 freezes the marked SPEC region. HARD STOP 2 freezes the concrete
Delivery/Stage/Task graph. After either lock all agent operations use
`planctl`; it delegates the actual targeted mutation to the single
`plan-update.ts` engine. Direct edits have no HEAD/blob-bound journal and fail
pre-commit. Task text, criteria and forecasts stay immutable; Results and
execution events append.

Each Task predicts active minutes and credits. A Delivery reports aggregate
active work, longest dependency path and external waits separately. Actuals
append later and never rewrite the forecast.

Before approval, the planner traces each acceptance story across service and
module boundaries. Every public contract that must change appears in the
owning file's Task writes. An implementation that necessarily needs an
unlisted owning file proves the decomposition incomplete; it does not license
the executor to edit first and ask later.

Before RED, the executor runs `planctl start-task`. It re-reads the committed
Markdown Task or a journal-verified staged Result from the prior Stage,
refuses blocked/closed work and starts a Git-local timer without copying or
changing the plan. After the work commit, `complete-task` proves the receipt
paths equal both frozen Task writes and the commit diff (excluding the
journal-proved plan bookkeeping that rides that commit), then consumes that
timer. The Markdown file remains the only contract source of truth.

## Mechanics plan-gate enforces

- A closed box is `- [x] <text> — <short-sha>`; the receipt sits at the END
  of the item (last line of a wrapped item) and must be an ancestor of HEAD.
- A machinable criterion opens the item with its command: `` `cmd` exits N ``.
  Prose quoting the form is not executed. Beware `rg -c`: it prints nothing
  and exits 1 on zero matches — write `` `rg -q …` exits 1 ``.
- A machinable criterion must hold in EVERY environment that re-runs it —
  Stage close, the Integration pre-push lane and the `/end-work` closure.
  Final review reuses their exact-head receipt. (The CI plan-gate job checks
  receipts only, `--no-exec`: a thin
  runner cannot host the stack, and a false red teaches people to ignore
  the gate.) An environment-specific measurement (this machine's branch
  fleet, local hardware timings) is recorded as prose with its number and
  where it was taken, never as a command the re-runs will fail.
- A blank line before EVERY list — the renderer fuses lists into paragraphs
  without it.
- Mermaid labels containing `|`, `(`, `)` or `:` are QUOTED
  (`A["open | password | Google"]`), and line breaks inside a label are
  `<br/>`, never `\n` — unquoted specials render as a parse bomb in the
  owner's viewer (two plans hit it on 2026-08-20).
- `--start` refuses work on a plan that is not owner-approved or carries
  lines the owner has not answered.
- **A criterion that invokes the gate again does not recurse**: every
  criterion runs with `PLAN_GATE_NESTED=1`, and a run that sees it verifies
  receipts without executing anything. Running the gate WITHOUT `--no-exec`
  therefore executes every command a plan names — on 2026-08-24 that reached
  roughly eighty new processes a second, twice, because the flag was being
  written and never read. `--no-exec` is the safe default for anyone who only
  wants the receipts checked.

## What an approved plan freezes

Approval turns four things into a contract with the owner: **the Goal, the
target file tree, the stage headings, and the acceptance-criterion text**.
A commit that changes any of them needs an Amendments line added by THAT
SAME COMMIT — an Amendment already present from an earlier change licenses
nothing, because one owner decision is not a standing permit.

A criterion that wraps across lines is one sentence and is frozen as one,
read with the same continuation grammar the item parser uses. Taking only
its first line left the assertion itself editable: the specimen was this
repository's own "a clean merge runs nothing", which a commit could flip
to its opposite unopposed. Unindented prose that merely follows the list
is not a continuation and stays free.

The rule reaches a plan whose status line says APPROVED and then says who
approved it and when. Requiring the word to END the line left six plans
outside the freeze entirely — not a weaker contract, none at all, goal and
criteria included — measured with the predicate itself over `docs/plans`:
18 before, 24 after.

A plan arriving through a MERGE is inherited, not authored: it is judged
against what git itself would produce from the two sides, asked directly
with `git merge-tree`. If that merge conflicts in the plan there is nothing
to inherit, so whatever is staged for it is a human's resolution and is
judged as authored — and the conflict is read per FILE, since a conflict
elsewhere says nothing about a plan that merged cleanly.

Two narrower forms were tried first and both were wrong in ways worth
remembering. Comparing against the other side's COPY matched only
byte-for-byte, so a clean merge in which both sides had touched the plan was
refused as authored work. Rebuilding the three-way merge by hand then needed
a new special case per review round — rename detection in one direction,
then the other, then absent blobs for a one-sided add — all of which git
already does.

The new planctl format hashes the entire marked SPEC, including nested
headings. The older heading-only freeze remains only for inherited legacy
plans that predate those markers.

The four deltas that need nobody's word, since none of them changes what
was agreed: the checkbox character, a receipt appended at the item's end, a
measured number corrected to what the world now says, and a Deviations
line. Everything outside those four sections — the stage prose, the reuse
map, the measurements section — stays the agent's to write, because
freezing it would make every clarification cost the owner's attention and
a rule that expensive gets routed around.

The managed pre-commit hook calls `plan-gate --freeze` on every
staged plan, so the refusal arrives while the commit can still be fixed
for free. Two limits are accepted rather than engineered away: a commit
made with the hook silenced is not caught afterwards, and a weakened
THRESHOLD dressed as a corrected measurement passes the machine — that
one is a reviewer's finding, and the reviewer sees the diff either way.

A plan cannot be created already APPROVED: approval is the owner's act on
something they read, so the draft is committed first. Deleting a plan is
outside this rule — an authorized purge has no postimage to carry an
Amendment in, and the ledger records purged plans instead.

A DRAFT is the agent's to shape, deliberately: a rule protecting plans
before approval would leave nothing writable, which is the owner's ruling
of 2026-08-24 in their own words — «иначе агент не сможет ничего написать».
The contract begins when the owner says it does.

The shape this rule answers is `ee92a86eb`, where 244 lines of a plan's
body — Goal rewritten, target tree replaced, criteria reworded to match
what was built — moved inside a commit whose subject was about code, and
every gate passed it green. Read that commit precisely: its plan was still
a DRAFT at the time, approval landed about an hour later, so this rule
would not have refused it and is not claimed to. What it demonstrates is
the leak — a contract edited silently, under a subject that never mentions
it — and that leak is exactly what the rule refuses once the plan is the
owner's.

## Forbidden

- Opening with the problem: the goal comes first; the problem is measured
  distance and comes after the target.
- DEC-numbered decision lists; criteria referencing other criteria or
  documents ("decision 11 is accepted").
- Tests asserting file-structure layout — an acceptance command checks that
  once; a permanent test for it is banned.
- Inventory pin tests — a suite test asserting a hand-kept list (dependency
  baseline, file roster, registry snapshot). The plan may carry a ONE-SHOT
  verification script run at acceptance; the suite may not inherit it
  (owner ruling 2026-08-21 — an AI-SDK branch had to edit a logging test's
  package list to add its own dependencies).
- Self-declared approval: `status: approved` is the owner's word only.
- Unscoped time estimates that omit profile, dependency path and waits. Vision prose. Sugar.
- Boxes that mirror state an external system holds authoritatively — CI
  status, PR or merge state. GitHub is the record; flipping such a box
  costs a commit plus a full CI run to assert yesterday's truth twice.

## Known gaps and unresolved decisions

- The judged half of plan quality (goal concreteness for an agent, stages
  that tell the story) has no complete mechanical check. `planctl` rejects
  low-information Tasks, but examples plus owner review still judge meaning.
- `plan-gate` reads receipts and machinable criteria only; prose criteria
  are verified by the reviewer, not the machine.
