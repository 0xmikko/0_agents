---
doc_type: current
status: verified
derived_from: magnis-process-pr-227
implementation_anchors:
  - global:planctl/src/core/plan-gate.ts
  - global:planctl/src/core/plan-update.ts
---

# The plan format

A plan in `docs/plans/` is the single contract source. Author and execute it
through planctl MCP. Tool schemas describe the exact arguments; this page
describes their meaning. The lifecycle is in
[development-process.md](development-process.md).

## SPEC sections

Write the title and SPEC in English. Start with **The Goal** and describe the
observable behavior under **The target**. Include the evidence, constraints,
invariants, reuse, changed files and unresolved questions needed to assess it.
Use the remaining headings returned by the authoring tools when useful.
Diagrams, maps, sentence length and layout are authoring advice; do not remove
necessary detail to satisfy them.

Declare changed exported types in **Interfaces** as valid typed TypeScript.
Explain proposed new names and reuse canonical repository definitions. Name the
owning files, including public contracts reached through another module.
Missing files, invalid declarations, untyped pseudocode and invalid diagrams
remain errors. A probabilistic opinion cannot replace owner approval.

The owner approves the SPEC before implementation decomposition. Submission
does not approve it. A draft can be committed without changing its approval
state; the agent cannot declare its own approval.

## The implementation contract

A Plan contains sequential PR Deliveries. Each Delivery names its branch,
base/dependencies, verification gate, temporary root and description of the
result. One Delivery is one PR; normally only one is active.

For work in another repository, set the Delivery's `repository` name and map
it with `git config code-production.repository.<name> <checkout>`. Its branch,
commits and publication belong to that checkout. Keep related Deliveries in
one plan when they form one approved change.

A Stage is a coherent work commit. Its title names the result; its description
explains the change, reason and proof. It declares owner/profile, dependencies,
write folders, temporary root, Tasks and acceptance criteria. Parallel Stages
require authorized delegation, disjoint writes and an integration owner.

A Task states one concrete change understandable without chat history. Its
metadata declares exact writes, implementation guidance, RED command and
forecast. MCP renders that metadata and reveals it at `start_task`; agents
do not hand-author hidden comments.

Stage forecasts equal Task forecasts plus verification work. Report Delivery
active work, dependency time and external waits separately. Acceptance criteria
name the behavior proven, including meaningful failure cases, rather than only
a test filename. Do not add inventory or typography tests to police prose.

The owner approves this complete contract before implementation. There is no
third approval for an outline, ordinary verification or closure.

## Two locks and one writer

SPEC approval freezes the marked SPEC. Implementation approval freezes the
Delivery/Stage/Task contract. The mutation journal binds changes to the plan
blob and Git HEAD; all plan writes use MCP, including results and amendments.
Direct edits cannot replace journaled approval.

Keep promised behavior, type contracts, criteria and forecasts unchanged during
execution. Results record what happened. Scope changes require an amendment
under the owner's word; an earlier approval does not authorize unrelated work.

The current completion gate checks Stage folders and protected Task paths.
It records additional writes within permitted folders; tests have their own
allowance. A protected path must be declared by the Task. A tooling repair
authorized in chat does not silently rewrite an approved Task: record any
necessary amendment through MCP using that authorization.

## Results and verification

Use `complete_task` and `close_stage` to record commits, measured time, usage,
proof and deviations. Missing measurements are unavailable, never zero.
A closed criterion carries its result commit; that commit must belong to the
owning Delivery's history. GitHub remains authoritative for PR and CI state.

A machinable criterion starts with a command and expected exit code. It must
be valid wherever it is executed. Record machine-specific measurements as
evidence with their environment instead. Receipt-only verification does not
execute criteria; nested gate calls must not recursively run them.

Report blocking findings separately from editorial advice. A gate passing
proves its checked properties, not semantic completeness or the absence of
conceptual duplication. Keep unverified claims explicit.
