---
doc_type: current
status: verified
derived_from: magnis-process-pr-227
implementation_anchors:
  - global:shared/code-production/runtime/plan-gate.ts
  - global:shared/code-production/runtime/plan-update.ts
---

# The plan format

One page of law for every plan in `docs/plans/`. The worked exemplar the
owner shaped sets the tone; `planctl` and the managed hooks enforce mechanics.
The process around plans (cadence, micro-review, the two-mode contract)
lives in [development-process.md](development-process.md).

## Sections, in this order

1. **The goal** — first, always. CONCRETE and unsugared: what gets faster,
   cheaper, smaller or safer, and by how much — numbers wherever they
   exist; a bullet list of measurable outcomes beats a paragraph of vision.
   The goal names its **currency**: deleted lines for a refactor, measured
   time for performance, the thing the user sees for a feature. Every stage
   pays a stated share; its receipt records the measured payment (a number,
   a benchmark table, a screenshot attached to the PR).
2. **The target** — how it looks when done: a mermaid flowchart that
   underlines the one architectural decision (never a walk of how a signal
   travels), the target file tree with per-file purpose, the interfaces in
   TypeScript rather than prose. Unknown facts are `<placeholders>` a
   Stage 0 pins — never guessed.
3. **Today, measured against that** — the distance, measured on a pinned
   base SHA: line counts, file:line anchors, the one deciding fact. Past
   tense once fixed. Includes the **Reuse map**: what existing code the
   change extends, and the greps proving nothing existing covers the need.
   A second copy of an existing mechanism means the plan is wrong.
4. **Invariants** — plain one-pass statements; each is a named test,
   written RED before the stage that makes it true.
5. **Implementation** — sequential PR Deliveries, each containing Stages:

   ```markdown
   ### PR Delivery D1 — <one coherent PR result>

   #### Stage D1-S1 — <one commit-sized result>

   Temp root: `.tmp/code-production/<plan-slug>/<Stage-ID>` — the Stage owns
   this child and its receipt must prove it absent.

   A stage that legitimately splits into parallel same-shaped units (one
   agent per controller, one commit per capability) declares it in the
   heading — `#### Stage D1-S1 (fan-out: 9) — <name>` — and the scorecard's
   commit arithmetic divides by the declared units.

   <Context, at most two paragraphs: what this stage solves and why now,
   with the stage's own target number in the text. Meaning over volume.>

   #### Tasks

   - [ ] TASK_001 — <observable result, never "refactor/fix/improve X">
         Writes: `<exact Task paths>`.
         Predict: <active minutes> / <credits>.
         How: <concrete procedure using an existing owner>.
         RED: `<deterministic behavior-test command>`

   #### Acceptance criteria

   - [ ] `command` exits 0        ← machinable: the backticked span IS the command
   - [ ] <the outcome, not just mechanics: speed reached, code shrunk>
   - [ ] Commit

   #### Results

   - <what was measured>: **<the number>**, against <the target>. <How it
     was taken, in one sentence.>

   A criterion carries its asserted RESULT in its own line: the number
   reached, the behavior proven, the thing now absent. A bare "test file
   exits 0" is not a criterion — name what the test proves.
   (Judge-validated in the Stage 11 tournament.)
   ```

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

   Read in order, the stages tell the plan's whole story without the
   details. A stage is a coherent unit (typically 10-20 related changes),
   not a micro-edit.
6. **Amendments** — owner-approved plan changes, one dated line each,
   written before the edit they license.
7. **Deviations** — agent-recorded shortfalls: stage, target vs reached,
   the decision taken; written the moment they happen.
8. **Execution contract** — a short pointer: the law is
   `development-process.md`; note only what this plan overrides or scopes
   (its affected suites, its scoped-test command).
9. **The pre-approval screen** — the LAST block before the owner is asked
   "Утверждаешь?", and the one the owner actually reads (adopted from the
   closed-PR retro, 2026-08-21: every steering intervention across three
   branches was one of these three categories). Three parts, no jargon:
   - the FILE TREE this plan produces, one line of responsibility per
     file;
   - the acceptance STORIES in human language ("after the merge the owner
     opens the trigger list and sees the next run time" — not a test id);
   - what is deliberately NOT verified and why ("Playwright not run — no
     UI touched").
   Seen once here, corrections land before the run instead of steering it.

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
  stage close, the pre-push lane, `/review-implementation`, the `/end-work`
  closure. (The CI plan-gate job checks receipts only, `--no-exec`: a thin
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
