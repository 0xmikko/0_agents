---
name: bug
description: A reported bug becomes a red test, then a fix, then that file and the Stage's files green. Auto-invokes when the user describes a bug.
user-invocable: true
disable-model-invocation: false
---

# Bug

1. Trace the path that produces the behavior; name the cause in two
   sentences.
2. Write the test that asserts the correct behavior — unit when the bug is
   in logic, browser when it is only in rendering — and run it. It must fail
   on the current code; a test that passes did not catch the bug. Show the
   name, what it checks and the failure.
3. The smallest fix. Run that file, then the Stage's named files if a Stage
   is open. Never the full suite by hand: the pre-push hook runs it once.
4. Say how to see the fix by hand. One commit, `fix(<scope>): …`, the why.

Escape hatch, announced: a three-line typo, wrong constant or off-by-one
with obvious intent may skip the test, only with the line
`Skipping red test: <reason>` before the fix. The owner can object.

ARGUMENTS: $ARGUMENTS
