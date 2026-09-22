---
name: bug
description: TDD bug-fix protocol. When the user reports a bug or describes unexpected behavior, this skill enforces the red-test-first workflow — reproduce with a failing test, then fix. Auto-invokes when user describes bugs.
user-invocable: true
disable-model-invocation: false
---

# Bug Report -> Red Test -> Fix

The user found a bug during manual testing. Follow the TDD bug-fix protocol strictly.

## Input

The user describes the bug they found. There may be a screenshot attached.

## Protocol

### Phase 1: Understand the bug
1. Read the user's description and screenshot carefully
2. Trace the code path that causes the bug
3. Identify the root cause — explain it to the user in 2-3 sentences

### Phase 2: Red test (MUST FAIL on current code)
1. Write a unit test (or e2e test if UI-only) that reproduces the exact bug
2. The test MUST assert the CORRECT behavior (what SHOULD happen)
3. Run the test — it MUST FAIL. If it passes, the test doesn't capture the bug. Rewrite it.
4. Show the user: test name, what it checks, and the failure output

**Do NOT proceed to Phase 3 until the test fails.**

### Phase 3: Fix
1. Fix the code to make the test pass
2. Run the test — it MUST PASS
3. Run typecheck and only tests covering the changed files. Never run the
   full suite for an individual fix or commit; it belongs to publication.
   Rerun a failed check; repeat a passed check only if subsequent changes
   affect what it verified.
4. Explain the fix in 2-3 sentences

### Phase 4: Verify
1. Tell the user how to manually verify the fix
2. If the user confirms it works -> done
3. If the user finds another issue -> go back to Phase 1

## Rules
- NEVER skip Phase 2 (red test). The test must fail before you fix anything.
- NEVER write a test that passes on broken code — that's a useless test.
- Keep tests focused: one test per bug, testing the exact scenario the user described.
- Prefer unit tests over e2e when the bug is in logic (not rendering).
- **Escape hatch**: if the fix is ≤3 lines AND the bug is a pure typo, wrong constant, or off-by-one with obvious intent, you MAY skip Phase 2 ONLY IF you state explicitly: `Skipping red test: <reason>`. The user can then object. Default is still red-test-first.

ARGUMENTS: $ARGUMENTS
