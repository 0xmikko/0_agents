# The plan format

One plan is one file, `docs/plans/<slug>.md`, named after its branch: the SPEC,
prose the owner approves first, then the Stages, rendered by planctl and approved
second. The process around it: [development-process.md](development-process.md).

## The SPEC, in this order

The Goal — two or three lines: the owner's measures, today's number, the
target. What will be true; never "measure X", never the problem.

Why now — the problem, its numbers, its `file:line` anchors on a pinned SHA.

The target, as detailed as the task is deep — the process as a flow (a
mermaid diagram, a table of its stages); the design as the screen will look;
Interfaces: every new or changed type as a hand-written TypeScript interface,
one field per line, with the zod schema that decodes into it; Code where the
algorithm is the decision; What changes and what leaves; the Target tree, one
line of purpose per file; Verification; Invariants, each a named test written
red before the Stage that makes it true; Constraints and non-goals; Reuse,
the mechanism the change extends and the search that proved nothing covers
it; Deliveries.

New names — a table: every word the repository and the vocabulary page lack,
with its reason; the pre-approval screen prints the count.

Not verified — what the plan claims without having run it.

## The Stage and the Task

A Delivery is one pull request; when a second agent will build against it,
its first Stage is the interface and its mock. A Stage is one commit; its
description above the Tasks is the commit message: solves, builds, proves.

```markdown
#### Stage D1-S1 — Refuse overlapping Stage writes

- Writes: `src/scheduler/overlap.ts`, `test/scheduler/overlap.test.ts`.

##### Tasks

- [ ] SCH_001 — Refuse overlapping Stage writes in `src/scheduler/overlap.ts`; cover the refusal in `test/scheduler/overlap.test.ts`.
<!-- plan:task-meta:{"writes":["src/scheduler/overlap.ts","test/scheduler/overlap.test.ts"],"how":"…","red":"bun run agent:test:backend -- test/scheduler/overlap.test.ts"} -->

##### Acceptance criteria

- [ ] `bun run agent:test:backend -- test/scheduler/overlap.test.ts` exits 0 — the overlap is refused
- [ ] Commit
```

A Task story is one change in under 200 characters; its writes (files,
directories, globs) are the contract the commit is checked against. A criterion
is a command with its exit code and what the exit proves, or the Commit box; a
measurement only this machine can make is prose with its number.

## What approval freezes

The SPEC's bytes, the Goal, the target tree, the Stage headings and the
criteria. After `approve-plan` the plan changes only through planctl, and
its meaning only through `amend` on the owner's word, one dated Amendments
line; the pre-commit hook refuses a direct edit. Results and Deviations
append; a measured number goes to the result row, never into a criterion.

## The linter

`plan-gate` refuses, before the owner reads: a missing SPEC section; a box
that is not a command with its exit code or the Commit box; a mermaid block
that does not parse; a synonym of a vocabulary term or a plan code in prose; a
sentence over thirty words; a Predict field; an `export interface` or `export
type` a Stage commit adds that the SPEC's Interfaces block does not name. The
judge, `plan-gate --judge`, answers what a linter cannot: is the Goal a goal, does
each Stage read as a commit, are the names existing ones, is the prose plain.

## Forbidden

Opening with the problem. Minutes and credits. DEC-numbered decisions and
criteria that cite other criteria. Tests that assert file layout or a hand-kept
list. `status: approved` written by the agent. Boxes that mirror CI or merge
state. A second copy of an existing mechanism. Vision prose.
