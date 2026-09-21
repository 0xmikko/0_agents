---
name: review-plan
description: Codex self-review of implementation plans with a strict iterate-until-APPROVED loop and finding triage. Use after writing a plan. Review directly in the current Codex turn; do not call codex_mcp, a Codex CLI reviewer, or a subagent.
---

<!-- INTENTIONAL DIVERGENCE: this Codex skill performs a direct self-review. The Claude twin may use a different review surface. -->

# Plan Review

Review the active plan yourself, triage findings, loop until APPROVED, or
escalate to the user when stuck.

## Rules (do not violate)

- **Re-run review after every fix.** Re-read the complete updated plan and
  perform a fresh pass against every review criterion. A claim that fixes
  "should" be enough is not a review.
- **Review directly.** Do not call `mcp__codex__codex`, `codex_mcp`, a Codex
  CLI reviewer, or a subagent. The current Codex instance is the reviewer.
- **Never apply review findings blindly.** Triage every finding (see below).
- **Never exit on NEEDS_WORK.** The loop continues until APPROVED, or
  until the iteration cap forces a human decision.
- **Iteration cap: 3 review rounds.** If after round 3 the review still returns
  NEEDS_WORK, STOP and escalate to the user.

## Triage — every finding goes into one of three buckets

- **REAL** — clear gap, bug, or risk in the plan. APPLY the fix.
- **CONTEXT-MISMATCHED** — the concern doesn't apply given the actual
  context (e.g. security warning for a CLI that runs only on the user's
  local machine, performance concern on a one-shot script, "abstract this"
  on a 5-line helper). ASK THE USER before applying. Do not assume review
  is always right; do not silently skip either.
- **STYLE / WORDING** — naming, phrasing, doc tone, comment style. IGNORE;
  do not re-enter the loop for these.

For each CONTEXT-MISMATCHED finding, present to the user:

```
Review flagged: <quote of the finding>
Looks context-mismatched because: <agent's reasoning, e.g. "the plan
  describes a CLI that runs only locally; no network surface to attack">
Options:
  a) apply fix anyway
  b) skip; add a one-line clarification to the plan so the next round
     doesn't re-raise (e.g. "Note: this binary is local-only, no remote
     attack surface — security review of <area> not applicable")
  c) skip silently (override; risk: review may flag again next round)
How to proceed?
```

Wait for the user's answer per finding before continuing.

## Mechanics

### How to find the plan

1. If plan mode is active, use the active plan path from the conversation.
2. Otherwise, use a plan path named in the conversation.
3. Otherwise, find the most recently modified `docs/plans/*.md` file.

### How to run review

Read the entire plan file directly. Inspect the referenced requirements,
architecture docs, and code paths needed to validate its claims. Do not send
the plan to another model or review service.

### What review evaluates

Requirements completeness; architecture feasibility; file change map (every
file listed with CREATE / MODIFY); test specification quality (step-by-step
`Step N → Verify` behavioral scenarios, NOT pseudocode); test strategy;
file count justification.

## Loop

```
round = 1
while round ≤ 3:
  re-read the full current plan and relevant evidence
  review every criterion from scratch
  if no substantive findings remain:
    return "APPROVED — Codex self-review passed in round N"
  triage findings → REAL / CONTEXT-MISMATCHED / STYLE
  for each REAL: apply fix to plan
  for each CONTEXT-MISMATCHED: ask user, follow their decision
  ignore STYLE
  round += 1

return "NEEDS_HUMAN_DECISION — 3 review rounds exhausted.
  Remaining: <list>
  Asking the user how to proceed."
```

## Output (enum — return one only)

- `APPROVED — Codex self-review passed in round N`
- `NEEDS_HUMAN_DECISION — <reason>` (3-round cap hit, or user override
  mid-loop, or all remaining findings are CONTEXT-MISMATCHED)

Never return "fixes applied, should be approved" or "concerns are addressed"
without re-running review.
