---
name: quick-fix
description: Lightweight protocol for small, low-risk changes (typos, copy edits, one-line fixes, dependency bumps with no API change). Bypasses the full blueprint delivery workflow. User must invoke explicitly — never auto-invoke.
user-invocable: true
disable-model-invocation: true
---

# Quick fix

For small, low-risk changes where the full blueprint delivery workflow is pure overhead.

## Scope

Use ONLY when ALL of these hold:
- One file edited
- ≤10 lines changed
- No new logic, no new abstractions
- No public API change
- No schema/migration change

Typical cases: typo, copy edit, wrong constant, bumping a patch-version dep, fixing a comment or log string.

## Protocol

1. **Worktree**: always work in a worktree, never in the main tree.
   - If currently in the main working tree, create one (same rule as blueprint-start).
   - If already in a worktree, stay there.
2. **Edit** the file directly.
3. **Run only the directly affected test file**, not the workspace. If there is no existing test for the changed code and the change is cosmetic, no test run is required.
4. **Commit** with `fix:` or `chore:` prefix.
5. Done. No full blueprint, Delivery review, or multi-Stage execution.

## Escape hatch back to blueprint

If during the edit you discover:
- The change grows beyond one file or adds logic
- You need a new helper or abstraction
- The test file doesn't exist and the change is not cosmetic

→ STOP. Revert, create an approved plan with blueprint, then execute it with blueprint-start.

## Task

$ARGUMENTS
