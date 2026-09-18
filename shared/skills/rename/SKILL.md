---
name: rename
description: Rename a symbol, a type or a field across the repository with the compiler as the only guide. Use for any refactor that changes a name; never grep for the old name.
user-invocable: true
disable-model-invocation: false
---

# Rename

The compiler lists the callers; grep lists comments and strangers. So:

1. Rename the symbol at its one definition. Nothing else yet.
2. Run the project's typecheck (`bun run agent:verify:commit` covers it; a bare
   `tsc --noEmit` in the package is faster). Read the list of errors: that is the
   complete list of places to change.
3. Fix exactly those places, in the order the compiler names them. Run it again
   until it is silent.
4. Then, and only then, search prose for the old name: docs, comments, plan
   text. Change the ones that describe the renamed thing; leave history alone.
5. One commit: `refactor(<scope>): rename X to Y` and why.

Do not rename a second thing in the same pass. Do not "improve" code the
compiler pointed you at. If the compiler names more than fifty places, stop
and tell the owner the count before continuing.
