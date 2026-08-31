---
name: review-implementation
description: Post-implementation review gate. Reuses the exact-head Delivery receipt, launches 3 parallel cop reviews, runs Codex code review, triages findings, and reports a verdict. Does NOT fix.
user-invocable: true
disable-model-invocation: true
effort: high
---

<!-- KEEP-ALIGNED: codex/skills/review-implementation/SKILL.md — both tools have a divergent copy of this skill (different project doc references and review tool). When changing this file, sync the twin or document why they intentionally diverge. -->

# Review Implementation

Post-implementation review gate. Run after the Integration Stage made the
exact head green. Reuse that verification, enforce project rules via 3 cops,
run Codex code review, triage findings and report a structured verdict.

This skill does NOT fix. The caller (e.g. /start-work, /execute) handles
the fix-and-re-review loop.

## Anti-patterns (do not do)

- **Self-assertion:** "I think the cops would approve now" or "fixes
  addressed the findings" instead of actually running the review. NEVER.
  Run cops, run Codex, report what they say.
- **Skipping re-review after fixes (caller's loop):** caller MUST re-call
  /review-implementation after applying fixes; this skill cannot enforce
  that, but report it explicitly when the caller asks for a single round.
- **Blindly forwarding Codex / cop findings:** triage them first; do not
  treat every finding as REAL.
- **Deferring a REAL bug at the round ceiling:** a round number never turns a
  correctness defect into follow-up work. Report NEEDS_WORK until it is fixed.

## Blocking classes and round policy

- **Round 2 caps only NIT/style loops (caller's outer loop).** REAL findings
  have no numeric ceiling: the caller fixes them, refreshes the exact-head gate
  and calls this skill again until APPROVED.
- **Wording-only suggestions are OUT OF SCOPE.** Naming, doc phrasing,
  log message text, comment tone — drop them; do not surface.
- Only these comment classes can block APPROVAL when triaged as REAL:
  - Missing or incorrect tests
  - Incorrect behavior vs plan invariants
  - Security issue
  - Data loss risk
  - Public-API break

## Context

You are reviewing changes made by another agent. There may be an active
plan in the conversation — use it to understand intent.

Read CLAUDE.md and AGENTS.md first for project rules.

## Phase 1: EXACT-HEAD RECEIPT

Do not run product suites here. Require the managed Delivery receipt to name
the exact SHA under review:

```bash
test "$(sed -n '1p' "$(git rev-parse --path-format=absolute --git-path code-production/verify-pr.sha)")" = "$(git rev-parse HEAD)"
```

- Receipt matches HEAD → proceed to Phase 2.
- Receipt missing or stale → STOP and ask the caller to run the Delivery gate.

Any review fix changes HEAD and invalidates the receipt. Review must not hide a
missing publication gate by purchasing a second copy of its suites.

## Phase 2: COP REVIEW

Launch the three cops in parallel via the Task tool:

- coherence-cop  (`~/.claude/agents/coherence-cop.md`)
- coverage-cop   (`~/.claude/agents/coverage-cop.md`)
- simplicity-cop (`~/.claude/agents/simplicity-cop.md`)

Collect their verdicts and finding lists.

## Phase 3: CODEX CODE REVIEW

Call `mcp__codex__codex` with a review prompt covering correctness,
behavior vs plan invariants, security, data integrity, and API stability.

## Phase 4: TRIAGE

For every finding from cops + Codex, classify into one bucket:

- **REAL** — clear gap, bug, or risk in the actual context. Block APPROVAL.
- **CONTEXT-MISMATCHED** — concern doesn't apply given context (e.g.
  security warning on a local-only CLI, "abstract this" on a 5-line
  helper, performance concern on a one-shot script, "add metrics" on a
  prototype). Surface as ASK_USER.
- **STYLE / WORDING** — naming, doc phrasing, log tone. DROP per scope;
  do not surface.

If unsure whether a finding is REAL or CONTEXT-MISMATCHED, default to
CONTEXT-MISMATCHED (ask the user). Better one user question than silently
mis-fixing.

For each ASK_USER, include in the report your reasoning so the user can
decide quickly:

```
ASK_USER: <quote of finding>  [from: <cop name | Codex>]
  Why context-mismatched: <e.g. "the binary runs only on user's local
    machine; no remote attack surface for the security concern raised">
  Options: (a) apply (b) skip with clarification (c) override
```

## Phase 5: FINAL REPORT

Present a consolidated structured verdict:

```
REVIEW VERDICT: [APPROVED | NEEDS_WORK | NEEDS_HUMAN_DECISION]

Delivery receipt: PASS @ <head-sha>

Cops:
  coherence-cop:  [PASS|REJECT] (N findings)
  coverage-cop:   [PASS|REJECT] (N findings)
  simplicity-cop: [PASS|REJECT] (N findings)

Codex: [APPROVED|NEEDS_WORK]

REAL findings (must fix before approval):
  - <finding> — <source>
  ...

ASK_USER findings (context-mismatched; need human decision):
  - <finding> — <source>
    Why context-mismatched: <reasoning>
    Options: (a) apply (b) skip with clarification (c) override
  ...

DROPPED (style/wording, out of scope):
  - <finding> — <source>
  ...
```

VERDICT rules:
- **APPROVED**: no REAL, no ASK_USER. (DROPPED is fine.)
- **NEEDS_WORK**: REAL findings exist; caller must fix.
- **NEEDS_HUMAN_DECISION**: ASK_USER findings exist (regardless of REAL);
  caller must consult user before next round.

Do NOT fix anything. Do NOT return any verdict besides the three above.
No "should be fine now", no "fixes will address" — those are anti-patterns.
