---
name: review-plan
description: Plan review by Codex with a strict iterate-until-APPROVED loop and finding triage. After every fix, re-run Codex; never self-assert. For context-mismatched findings (e.g. security on local-only code), ask the user before applying.
user-invocable: true
disable-model-invocation: true
---

<!-- KEEP-ALIGNED: codex/skills/review-plan/SKILL.md — both tools have a divergent copy of this skill (different project doc references and review tool). When changing this file, sync the twin or document why they intentionally diverge. -->

# Codex Plan Review

Run Codex non-interactively over the active plan, triage its findings, loop
until APPROVED, or escalate to the user when stuck. Codex 0.156 has no MCP
server mode: the reviewer is `codex exec`, run from Bash.

## Rules (do not violate)

- **Re-run Codex after every fix.** Self-assertion ("fixes addressed the
  findings, should be approved now") is NOT review. Only the most recent
  Codex output counts as the verdict.
- **Never apply Codex's fixes blindly.** Triage every finding (see below).
- **Never edit the plan by hand.** A REAL finding is applied through the
  planctl tools: `submit_spec` on a draft, `amend` under the owner's word on
  a locked plan, `put_stage` for the contract.
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

The plan lives in the repository: call `progress` with `root` (the
worktree); it names `docs/plans/<slug>.md`. When the user names another
plan, review that one.

### How to call Codex

Codex reads the plan itself: it runs in a read-only sandbox rooted at the
worktree. Write the prompt to a file in the scratchpad, then run from Bash;
the prompt comes in on stdin and the verdict lands in the file `-o` names.
The stream on stdout is progress only.

```bash
cd <worktree>
codex exec --sandbox read-only -C "$PWD" -o <scratchpad>/review-round-<N>.md < <scratchpad>/review-prompt-<N>.md
```

The prompt names the plan path and asks for exactly this answer: the first
line `APPROVED` or `NEEDS_WORK`, then one finding per line as
`<section or line>: <what is missing or wrong>`. No rewrites, no proposed
text: Codex names the gap, the agent fixes it through the tools.

### What Codex evaluates

Requirements completeness against the owner's request; architecture
feasibility; every flow of The target with its diagram and implementation
map (Owner, Target files, Input / wake, Output / durable state, RED test);
the Target tree (every file with CREATE / MODIFY); Invariants as
`Step N → Verify` behavioral scenarios, not pseudocode; Reuse of existing
mechanisms; the implementation contract's Stages as one commit each with
RED commands.

## Loop

```
round = 1
while round ≤ 3:
  run codex exec over the plan
  if the verdict file starts with APPROVED:
    return "APPROVED — Codex agreed in round N"
  triage findings → REAL / CONTEXT-MISMATCHED / STYLE
  for each REAL: apply the fix through the planctl tools
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
