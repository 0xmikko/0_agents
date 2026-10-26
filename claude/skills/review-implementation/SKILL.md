---
name: review-implementation
description: Final review of an implemented Delivery after its complete local gate, automatically when the approved contract requires it or on an explicit owner request. One full cop/Codex pass; executor fixes findings and continues publication.
user-invocable: true
disable-model-invocation: false
effort: high
---

<!-- KEEP-ALIGNED: codex/skills/review-implementation/SKILL.md — both tools have a divergent copy of this skill (different project doc references and review tool). When changing this file, sync the twin or document why they intentionally diverge. -->

# Review Implementation

Run when the approved Delivery contract requires review, or when the owner
explicitly requests one. Approving a contract with `review: required` already
authorizes this work; never ask for another invocation or approval word.
Otherwise do not introduce an optional review on your own.

Review the implemented Delivery after its complete local gate. Later planned
Deliveries are not missing work in this review. Run one full pass by the three
cops and Codex, not a pass after every Stage or commit. The review role reports;
the executor fixes real defects and continues through publication and CI.

Keep the review and verification gates intact. Save the actual report in the
task checkout's Git-local review record (`git rev-parse --git-path
code-production/review.md`), or pass its actual path as `reviewPath`. Detailed
revision identifiers belong there, not in replies to the owner. Completion of review is a workflow step,
not a reason to ask whether authorized execution should continue.

## Anti-patterns (do not do)

- **Self-assertion:** "I think the cops would approve now" or "fixes
  addressed the findings" instead of actually running the review. NEVER.
  Run cops, run Codex, report what they say.
- **Repeated review:** never invoke this skill after each Stage, commit or
  review fix. One final invocation contains one pass by each reviewer.
- **Blindly forwarding Codex / cop findings:** triage them first; do not
  treat every finding as REAL.

## Stop conditions (hard)

- **Wording-only suggestions are OUT OF SCOPE.** Naming, doc phrasing,
  log message text, comment tone — drop them; do not surface.
- Only these comment classes can block APPROVAL when triaged as REAL:
  - Missing or incorrect tests
  - Incorrect behavior vs plan invariants
  - Security issue
  - Data loss risk
  - Public-API break
  - Demonstrated duplicate mechanism or responsibility/dependency violation
    against the project's architecture; a principle or style preference alone
    does not establish a defect

## Context

You are reviewing changes made by another agent. There may be an active
plan in the conversation — use it to understand intent.

Read CLAUDE.md and AGENTS.md first for project rules.
Read the project's reuse map when supplied. Before starting, briefly state the
reviewed scope and the checks being reused or run. Keep all reviewers on the
same plan/diff and relevant callers; report unrelated existing debt separately.

## Phase 1: LOCAL VERIFICATION

Use the managed Delivery receipt for the complete local gate on the exact
SHA under review:

```bash
test "$(sed -n '1p' "$(git rev-parse --path-format=absolute --git-path code-production/verify-pr.sha)")" = "$(git rev-parse HEAD)"
```

- Receipt matches HEAD → proceed to Phase 2. A PR and remote CI are not prerequisites.
- Receipt missing or stale → the caller runs the required local Delivery gate,
  resolves failures and resumes this requested review without asking the owner
  to authorize routine verification or invoke the review again.
- Do not push, create a PR or wait for CI to make a review runnable. Any observed
  CI failure is evidence to investigate locally, not an entry condition.

The initial receipt proves checks for the head it names; it does not cover
later fixes. Record its actual head separately from affected verification for
the corrected head. Before publication, satisfy the existing gate's tracked-input
and receipt requirements; never label old evidence as covering new inputs.
A bookkeeping-only head change does not itself require another full gate or
review round. Verify real fixes with typecheck and tests covering changed files. The order is complete local gate,
review, fixes and affected verification, authorized implementation push, then
remote CI. Keep publication hooks enabled and reuse valid local evidence.

## Phase 2: COP REVIEW

Launch the three cops in parallel via the Task tool:

- dry-solid-cop  (`~/.claude/agents/dry-solid-cop.md`)
- coverage-cop   (`~/.claude/agents/coverage-cop.md`)
- simplicity-cop (`~/.claude/agents/simplicity-cop.md`)

Collect their verdicts and finding lists.
DRY/SOLID takes the architecture/reuse slot; do not also run coherence-cop.
Reuse the completed gate. Reviewers inspect its evidence rather than rerunning
the full suite; focused repros are for unresolved concrete findings only.
Start the Codex correctness review alongside the cops on the same inputs.
When running in Codex, perform that local review while the three agents work.
Record elapsed time for verification and each review role separately; keep
progress updates brief.

## Phase 3: CODEX CODE REVIEW

Use an available Codex review surface: the connected MCP, the installed Codex
CLI or an existing Codex session. When running in Codex, review locally.
Cover correctness, behavior vs plan invariants, security, data integrity and
API stability. A disconnected MCP does not require owner intervention when
another Codex surface is available. If none is available, report that precise
missing review; never claim it ran or change permissions.
Collect the pass started alongside the cops; do not start a second pass here.

## Phase 4: TRIAGE

For every finding from cops and Codex, inspect the actual code and approved
Delivery and classify it:

- **REAL** — a demonstrated implementation defect or missing required test.
  The executor fixes it within the approved scope and verifies the change.
- **NEEDS_EVIDENCE** — the claim is not established. Inspect callers or gather
  the specific scoped test/log evidence. Missing evidence does not itself
  create an owner decision or authorize APPROVED.
- **CONTEXT-MISMATCHED** — the concern does not apply. Drop it with the
  concrete reason in the private report; do not ask the owner to reject an
  irrelevant suggestion.
- **OWNER_DECISION** — a concrete choice changes agreed behavior, compatibility,
  constraints, acceptance criteria or permissions not already granted. Surface
  this as ASK_USER with the actual choice and its consequences.
- **STYLE / WORDING** — drop per scope.

Uncertainty alone goes to NEEDS_EVIDENCE. Only a demonstrated OWNER_DECISION
requires a new owner answer. Do not blindly forward reviewer opinions.

When real findings are fixed, an existing reviewing agent checks those fixes
and the affected verification evidence and updates the actual report for the
resulting head. This is focused closure of the same review, not another full
round by all cops. Never invent APPROVED or reuse a report for unverified code.
The executor then continues publication and eligible work without another word.

## Phase 5: FINAL REPORT

Present a consolidated structured verdict:

```
REVIEW VERDICT: [APPROVED | NEEDS_WORK | NEEDS_HUMAN_DECISION]

Reviewed-Head: <actual-reviewed-head>
Initial Delivery gate: PASS @ <head-it-verified>
Fix verification: <affected-check evidence for the reviewed head, or no fixes>
Publication gate: <actual receipt state; caller must satisfy it before publishing>

Cops:
  dry-solid-cop:  [PASS|REJECT|NEEDS_EVIDENCE] (N findings)
  coverage-cop:   [PASS|REJECT] (N findings)
  simplicity-cop: [PASS|REJECT] (N findings)

Codex: [APPROVED|NEEDS_WORK]

REAL findings (must fix before approval):
  - <finding> — <source>
  ...

NEEDS_EVIDENCE findings (executor gathers evidence):
  - <specific missing evidence> — <next check>

ASK_USER findings (concrete owner decisions only):
  - <finding> — <source>
    Why existing approval cannot resolve the choice: <reasoning>
    Options and consequences: <the actual owner choices>
  ...

DROPPED (style/wording, out of scope):
  - <finding> — <source>
  ...
```

VERDICT rules:
- **APPROVED**: no REAL, no NEEDS_EVIDENCE, no ASK_USER. (DROPPED is fine.)
- **NEEDS_WORK**: REAL findings or missing required evidence remain; the caller fixes or gathers evidence autonomously.
- **NEEDS_HUMAN_DECISION**: a concrete OWNER_DECISION remains; ask only about that choice and continue independent authorized work.

The reviewing role does not change product code. This restriction does not
stop the executor: it fixes REAL findings, supplies evidence for focused
closure, publishes and continues eligible work. Do not return a verdict
outside the three above.
No "should be fine now", no "fixes will address" — those are anti-patterns.
