---
name: spec
description: End-to-end task specification and planning workflow. Takes raw dictation or rough ideas, builds a spec through discussion, then auto-generates a reviewed plan. Replaces manual /dictate + /plan + /review-plan chain.
user-invocable: true
disable-model-invocation: true
effort: high
---

<!-- KEEP-ALIGNED: codex/skills/spec/SKILL.md — both tools have a divergent copy of this skill (different project doc references and review tool). When changing this file, sync the twin or document why they intentionally diverge. -->

# Spec-to-Plan Pipeline

You are guiding a task from raw idea to approved implementation plan. Everything lives in **one file** that grows through phases. You MUST follow the phases in order and NEVER skip ahead.

## File location

Create the plan file at the start: `docs/plans/<descriptive-slug>.md`
Use a short, descriptive slug derived from the task (e.g. `trigger-gate-mock.md`, `email-thread-view.md`).

Enter plan mode with this file immediately.

---

## Phase 1: IDEA

**Goal:** Turn raw input into a clean English task statement.

1. Take `$ARGUMENTS` — this may be Russian dictation, mixed Ru/En text, bullet points, or rough English.
2. Clean up: replace transliterated tech terms (ревью->review, коммит->commit, смержить->merge, бранч->branch, фича->feature, etc.), fix grammar, structure the text.
3. Write the result into the file as:

```markdown
# <Task title>

Status: SPEC

## Task

<Clean English task description>
```

4. Show the cleaned task to the user. Ask: "Задача сформулирована правильно?"
5. If the user corrects — update and re-confirm. Once confirmed — move to Phase 2.

---

## Phase 2: SPEC

**Goal:** Through discussion, build a complete specification that removes all ambiguity before planning begins.

### What to do

- Ask clarifying questions about business logic, requirements, edge cases.
- Research the codebase: read relevant files, grep for existing patterns, understand current state.
- **Think about architecture**: if this task involves architectural choices that could create ambiguity later (new abstractions, module boundaries, data flow changes, API contracts) — raise these questions explicitly. Not every task needs architecture decisions, but you MUST consider whether this one does.
- After each discussion round, update the `## Spec` section in the file with new decisions.

### What NOT to do

- Do NOT run cops, codex reviews, or any automated checks.
- Do NOT write implementation details, file maps, or test specs — that belongs in the plan.
- Do NOT limit the number of discussion rounds. Complex tasks need deep analysis.

### Spec section structure

Update the file to include:

```markdown
## Spec

### Decisions
- DEC-1: <decision about business logic, behavior, or architecture>
- DEC-2: ...

### Constraints
- CON-1: <what we explicitly will NOT do>
- CON-2: ...

### Open questions
- (empty when spec is approved — all questions must be resolved)
```

Decisions should cover:
- **Business logic**: what happens when X, what the user sees, expected behavior
- **Architecture** (when relevant): which layer owns this, data flow direction, new vs existing abstractions, module boundaries
- **Edge cases**: error states, empty states, concurrent access, migration

### Transition to Phase 3

When you believe the spec is complete:
1. Verify `### Open questions` is empty.
2. Show the full spec to the user.
3. Ask: "Спека готова. Утверждаешь?"
4. **ONLY proceed to Phase 3 after explicit user approval.** No exceptions.

---

## Phase 3: PLAN

**Goal:** Write a complete implementation plan based on the approved spec. This phase is automatic — no user interaction needed until Phase 5.

### Mandatory reading before planning

Read these files (skip if already read during Phase 2):
1. `CLAUDE.md` — project rules, structure, critical constraints
2. `AGENTS.md` — verification and traceability contract
3. `docs/testing/e2e-standard.md` — E2E testing standard
4. `docs/testing/policy.md` — test ID format, determinism rules
5. `docs/backend/testing.md` — mock runtimes, E2E patterns
6. `docs/architecture.md` — layering, data model, dependency direction

Read any area-specific docs relevant to the task.

### Plan sections

Append to the same file:

```markdown
## Plan

### User scenarios
scn_<module>_<feature>_001: <concrete scenario from user perspective>

### Simplicity check
1. Can this be done without new files?
2. Can this be done without new abstractions?
3. Can this reuse existing mocks/harnesses?
4. What is the smallest change that delivers the full requirement?
5. What should we explicitly NOT do?

### File change map
| File | Action | What and why |
|------|--------|-------------|
| ... | CREATE/MODIFY | ... |

### Diagrams
Mermaid diagram(s) inline: a flowchart per main flow + a lifecycle/state flowchart when there are states. **`flowchart` ONLY** (the viewer fails on sequenceDiagram/stateDiagram); ASCII only (`->`, `=>`, no unicode); parens only inside quoted labels. The diagram MUST show: every state's exit, destructive/irreversible transitions (delete vs tombstone), identity/uniqueness & collision points, dependency direction (what breaks on disable/remove), and create/undo pairs with data fate. If it can't, the design is incomplete.

### Invariants
- INV-1: <testable, precise statement>
- INV-2: ...

### Tests
Step-by-step behavioral scenarios (NOT pseudocode):
- Test name, invariant it validates, setup, act, assert

### Implementation stages
Stage 1: <description> — tests that pass after: [...]
Stage 2: ...

### Execution contract
- TDD loop: RED test -> GREEN implementation -> full suite -> commit
- Worktree: isolation: "worktree", branch: feat/<topic>
- Verification: cargo fmt, clippy, cargo test, bun typecheck, bun lint
- Merge: NEVER — user merges to staging
```

Update the status at the top of the file to `Status: REVIEW`.

### Proceed immediately to Phase 4.

---

## Phase 4: REVIEW

**Goal:** Automated review of the complete document (spec + plan together).

1. Copy the plan file to `.claude/temp/spec.md` (Codex needs files in tracked paths).
2. Call `mcp__codex__codex` to review. Prompt should ask to evaluate:
   - Does the plan fully cover the spec decisions?
   - Are invariants testable and complete?
   - Is the file change map exhaustive?
   - Are test scenarios behavioral (not pseudocode)?
   - Is the simplicity check honest?
3. If Codex returns issues:
   - Fix them in the plan file.
   - Re-run review.
   - Repeat until APPROVED.
4. Update status to `Status: APPROVED`.

### Proceed immediately to Phase 5.

---

## Phase 5: PRESENT

**Goal:** Show the approved plan to the user.

1. Publish the approved plan with `mdurl <plan-path>` and give the user the
   returned URL (renders in the browser, mermaid included).
2. Present a summary:
   - Task (1-2 sentences)
   - Key decisions from spec
   - Number of stages, files affected, tests planned
3. Say: "План утвержден Codex. Начинаем? (`/start-work`)"

---

## Resuming an interrupted session

If the user invokes `/spec` with no arguments or with a reference to an existing plan:
1. Find the most recent `docs/plans/*.md` file (or the one referenced).
2. Read its `Status:` line.
3. Resume from the corresponding phase.

## Task

$ARGUMENTS
