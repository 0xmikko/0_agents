---
name: finish-plan
description: Drive an approved plan to 100% completion without stopping. The relentless-execution enforcer — invoke when an implementation has stalled, was checkpointed mid-flight, or you just want it finished without babysitting. Resumes from the last completed stage and loops to done. Auto-invokes when an approved-plan execution is paused partway.
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools: Bash Read Grep Glob Edit Write Agent
---

# Finish The Plan — relentless execution

## Prime directive

**Finish the plan. All of it. Now.** Stopping partway through an approved plan
to "report a checkpoint", hand back status, flag scope, or ask "continue?" is
the single worst anti-pattern (see memory `feedback_no_stopping_mid_execution`).
A half-done plan is worse than one never started. The operator is NOT a
babysitter and will not verify your progress between stages — that's what the
plan's tests and acceptance gates are for.

You were invoked because someone wants this DONE. So drive it to done.

## The loop (do not exit until ✅)

```
1. LOCATE the active plan: docs/plans/<slug>.md (the one just /start-work'd, or
   the most recently APPROVED). Read its Implementation stages + Acceptance criteria.
2. FIND the resume point: git log --oneline → the last "[Stage N]" commit.
   Resume at Stage N+1 (or finish Stage N if its acceptance gate isn't met).
3. For EACH remaining stage, run the TDD loop to GREEN:
     RED test → minimum implementation → full suite → scoped pre-commit → COMMIT.
   Transition to the next stage AUTOMATICALLY — no pause, no "continue?".
4. When every stage is committed: run the FULL verification + the plan's
   Acceptance criteria (AC-*) + failure matrix. Fix anything red.
5. Only THEN produce ONE report — the completion report. That is the first and
   only time you hand back.
```

## The ONLY legitimate stops

1. A stage **genuinely fails** after honest debugging effort (report the failure
   + what you tried — don't comment out the test, don't fake green).
2. A **true plan ambiguity** that blocks correctness (ask the one precise
   question, then resume).
3. An **explicit user interrupt**.

Nothing else qualifies. In particular these are NOT stops — keep going:
- "This is large / multi-stage / multi-session." Size is not a blocker. Grind.
- "Let me check in / report progress / confirm pace." No. The operator interrupts
  at a commit boundary if they want; you don't solicit it.
- "Context is getting long." Don't stop — the plan doc + per-stage commits are
  durable resume state; keep the working set compact and continue. If truly near
  the limit, finish the current stage + commit so the next turn resumes cleanly.
- "I should flag scope before continuing." You already have the approved plan.
  Execute it.

## Motivation (read this when tempted to stop)

- You committed the plan as commit #1. Every stage on top is a promise. Keep it.
- Momentum compounds; a clean break to "report" throws it away and forces a
  cold restart that costs more than just finishing.
- The acceptance gates are objective. Hit them. Don't outsource judgment of
  "is it done?" to the operator — the plan already defined done.
- Shipping the whole thing green is the job. Half is not a deliverable.

## Mechanics

- Stay in the worktree on the feature branch. Commit per stage (Conventional
  Commits, `[Stage N/M]`). Never `--no-verify`. Never merge.
- Verify with the project's real commands (fmt/clippy/test, bun typecheck/lint/test,
  E2E) — the same ones the plan's acceptance criteria name.
- If a stage's scope is big, decompose WITHIN the stage and keep moving; do not
  promote "big stage" into "stop and check in".
- Use sub-agents for parallel research/verification if it speeds completion —
  but the goal is always: next stage, green, commit, repeat.

## Output

- While running: progress is visible through commits, not prose check-ins.
- At the end: a single completion report — stages done, acceptance criteria met
  (AC-by-AC), tests/gates green, what (if anything) is genuinely blocked, and
  "Do NOT merge — operator merges." That report is the only handback.
