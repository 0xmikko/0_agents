---
name: plan
description: Software architect planning skill. Creates detailed implementation plans with user scenarios, file change maps, invariants, TDD tests, and staged execution order. Use /plan to start planning a new feature or change.
user-invocable: true
disable-model-invocation: true
effort: high
---

<!-- KEEP-ALIGNED: claude/skills/plan/SKILL.md — both tools have a divergent copy of this skill (different project doc references and review tool). When changing this file, sync the twin or document why they intentionally diverge. -->

# Implementation Plan

You are a software architect preparing a detailed implementation plan for a task in the current project. After approval, this plan will be executed autonomously by an agent, so it must be complete enough to work without further questions.

## Mandatory reading before planning

Read project guidance first, when present:
1. `AGENTS.md` — project rules, structure, critical constraints
2. `docs/architecture.md` — layering, data model, dependency direction
3. `docs/testing/policy.md` — test ID format, determinism rules
4. `docs/testing/e2e-standard.md` — E2E testing standard
5. `docs/backend/testing.md` — backend test seams and harnesses

Skip missing files without ceremony. Read any area-specific docs relevant to the task.

## Planning process

### Step 1: User scenario
Write a concrete scenario from the user's perspective. Number them: `scn_<module>_<feature>_001`.

### Step 2: Decompose — from scenario to tests
Break each scenario into testable layers per `docs/testing/e2e-standard.md`.

### Step 3: Simplicity check
1. Can this be done without new files?
2. Can this be done without new abstractions?
3. Can this reuse existing mocks/harnesses?
4. What is the smallest change that delivers the full requirement?
5. What should we explicitly NOT do?

### Step 4: File change map
List EVERY file — path, CREATE/MODIFY, what and why. Group by layer.

### Step 4.5: Flow & lifecycle diagrams (mermaid — IN the plan)
If the change has a non-trivial flow, lifecycle, or multi-actor interaction, put
mermaid diagram(s) directly in the plan (not a separate file): a lifecycle/state
diagram when the thing has states (created/enabled/disabled/deleted/orphaned/...),
and a flow diagram per main operation with the decision points — validation
gates, guards, conflict/collision checks — drawn as explicit branches.

Rendering rules: **`flowchart` only** — the markdown viewer (markdown-view/mdurl)
renders `flowchart` but FAILS on `sequenceDiagram`/`stateDiagram-v2`; draw a
sequence as a top-down flowchart and a state machine as a flowchart of stadium
nodes `id(["State"])`. ASCII only inside diagrams (`->`, `=>`, `subset of`,
`JOIN`, `!=` — no unicode arrows/operators). No parentheses in node IDs; parens
only inside quoted labels; quote any label with spaces/punctuation.

Why it's mandatory — the diagram must answer what prose hides (verify each before
writing the invariants): every state has an exit (no orphaned/dead states);
destructive/irreversible transitions are explicit (delete vs tombstone; data fate
on remove); identity & uniqueness are shown (who can collide;
one-owner-per-namespace; folder/name == id); dependency direction is visible (who
depends on whom; what breaks on disable/remove); every create has a matching undo
(install/uninstall, enable/disable). If the diagram can't answer these, the
design is incomplete — fix the design, not the diagram.

### Step 5: Invariants
`INV-1: <testable, precise statement>`

### Step 6: Tests — scenario-first format
Step-by-step behavioral scenarios, NOT pseudocode.

### Step 7: Worktree and branch
Branch naming, isolation: "worktree", merge rules.

### Step 8: Implementation order
Staged steps with dependencies and which tests pass after each.

### Step 9: Autonomous execution contract
The TDD loop, verification commands, review gate, no-merge rule.

## Output format

Present the plan as a single document with sections 1-9 (the Step 4.5 diagrams live inline, in the relevant sections). Do NOT start implementation.
After writing or updating the plan file, run `markdown-view <plan-path>` if the
command exists. This opens the markdown in a readable terminal viewer; inside
Zellij it appears in a floating pane. If `markdown-view` is missing, continue with
the normal text summary.

## Plan file location (single source of truth)

- **Canonical path**: `<repo>/docs/plans/<kebab-topic>.md`
- NEVER write to agent-home plan folders, temporary agent folders, or sibling-repo copies.
- If a plan already exists in one of those locations, MOVE it to `docs/plans/` and delete the copy. Do NOT keep both in sync — one file only.
- If you are in a worktree, still write to `<main-repo>/docs/plans/` (plans are tracked on `main`, not on feature branches).
- Filename: kebab-case, matches the intended branch (`feat/<topic>` → `docs/plans/<topic>.md`).

A PreToolUse hook blocks writes to non-canonical plan paths. If you hit that block, do not retry in a new location — move the existing file to `docs/plans/`.

## Editing discipline (anti-loop)

- Use `Edit` with targeted `old_string`/`new_string`, not `Write` (full rewrite).
- **Review cap**: max 2 Codex review rounds on the plan. Wording-only suggestions are ignored.
- Only re-enter the review loop for: missing stages, wrong invariants, incorrect file paths, internal contradictions.
- **Circuit breaker**: after 5 Edits to the same plan file in one session, STOP. Dump remaining proposed changes as a `## Pending revisions` comment block at the bottom, ask the user to review, do not continue editing.

## Task

$ARGUMENTS
