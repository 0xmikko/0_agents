---
name: review-plan
description: Plan review via Codex with strict iterate-until-APPROVED loop and finding triage. After every fix, re-run Codex; never self-assert. For context-mismatched findings (e.g. security on local-only code), ask the user before applying.
user-invocable: true
disable-model-invocation: true
---

<!-- KEEP-ALIGNED: codex/skills/review-plan/SKILL.md — both tools have a divergent copy of this skill (different project doc references and review tool). When changing this file, sync the twin or document why they intentionally diverge. -->

# MCP Plan Review

Call `mcp__codex__codex` to review the active plan, triage findings, loop
until APPROVED, or escalate to the user when stuck.

## Rules (do not violate)

- **Re-run Codex after every fix.** Self-assertion ("fixes addressed the
  findings, should be approved now") is NOT review. Only the most recent
  Codex output counts as the verdict.
- **Never apply Codex's fixes blindly.** Triage every finding (see below).
- **Never exit on NEEDS_WORK.** The loop continues until APPROVED, or
  until the iteration cap forces a human decision.
- **Iteration cap: 3 Codex rounds.** If after round 3 Codex still returns
  NEEDS_WORK, STOP and escalate to the user.

## Triage — every Codex finding goes into one of three buckets

- **REAL** — clear gap, bug, or risk in the plan. APPLY the fix.
- **CONTEXT-MISMATCHED** — Codex's concern doesn't apply given the actual
  context (e.g. security warning for a CLI that runs only on the user's
  local machine, performance concern on a one-shot script, "abstract this"
  on a 5-line helper). ASK THE USER before applying. Do not assume Codex
  is always right; do not silently skip either.
- **STYLE / WORDING** — naming, phrasing, doc tone, comment style. IGNORE;
  do not re-enter the loop for these.

For each CONTEXT-MISMATCHED finding, present to the user:

```
Codex flagged: <quote of the finding>
Looks context-mismatched because: <agent's reasoning, e.g. "the plan
  describes a CLI that runs only locally; no network surface to attack">
Options:
  a) apply fix anyway
  b) skip; add a one-line clarification to the plan so the next round
     doesn't re-raise (e.g. "Note: this binary is local-only, no remote
     attack surface — security review of <area> not applicable")
  c) skip silently (override; risk: Codex may flag again next round)
How to proceed?
```

Wait for the user's answer per finding before continuing.

## Mechanics

### How to find the plan

1. If plan mode is active — the path is in the system prompt
   (e.g. `/Users/mikko/.claude/plans/<name>.md`).
2. Otherwise — find the most recently modified `.md` in `/Users/mikko/.claude/plans/`.

### How to call Codex

Plan files live in user home (`~/.claude/plans/`), NOT in the repo. Codex
runs in a sandbox rooted at the repo and CANNOT read files outside it.

**Therefore:** Read the plan file with the Read tool, then pass its CONTENT
directly in the Codex prompt. Do NOT copy files. Do NOT create temp files.
Just read → paste into prompt.

### What Codex evaluates

Requirements completeness; architecture feasibility; file change map (every
file listed with CREATE / MODIFY); test specification quality (step-by-step
`Step N → Verify` behavioral scenarios, NOT pseudocode); test strategy;
file count justification.

## Loop

```
round = 1
while round ≤ 3:
  pass plan content to mcp__codex__codex
  if output starts with APPROVED:
    return "APPROVED — Codex agreed in round N"
  triage findings → REAL / CONTEXT-MISMATCHED / STYLE
  for each REAL: apply fix to plan
  for each CONTEXT-MISMATCHED: ask user, follow their decision
  ignore STYLE
  round += 1

return "NEEDS_HUMAN_DECISION — 3 Codex rounds exhausted.
  Remaining: <list>
  Asking the user how to proceed."
```

## Output (enum — return one only)

- `APPROVED — Codex agreed in round N`
- `NEEDS_HUMAN_DECISION — <reason>` (3-round cap hit, or user override
  mid-loop, or all remaining findings are CONTEXT-MISMATCHED)

Never return "fixes applied, should be approved" or "concerns are addressed"
without re-running Codex.
