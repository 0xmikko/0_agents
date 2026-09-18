# Working here

Where you are and what you can do now is printed at session start by planctl. If it is
missing, run `bun .agents/code-production/runtime/planctl.ts focus` before anything else.
Two modes and no third: /blueprint plans, /blueprint-start works by an approved plan.

IMPORTANT: little code that is understood and explained beats much code. One name per
thing, the name the repository already uses: find it before you write one. A word that
exists nowhere in the repository is declared with its reason or does not appear. No
synonyms, no plan codes (D1-S4, INV-12) in prose.

DRY and SOLID, here: one mechanism per job, extend it, never copy it; one class per file,
one reason to change; depend on interfaces the caller owns; a function does one thing and
is named for it. A second copy of anything is a defect and the reviewers reject it.

Not more engineering than the test needs. No abstraction, generic, interface, option or
new file for a case that does not exist yet: two users or none. The simplest change that
makes the red test green, then stop.

Mistakes this model keeps making here, so do not:
- Claims from structure. Check the artifact: run it, open it, `git show origin/staging:<path>`.
- Fallbacks, defaults, "just in case". A missing value is an error.
- Tests green from birth. Red first; prove a green-from-birth test by mutating the source.
- Stopping at a tool refusal. Record one line and continue; a stop ends with "waiting for: X".
- Refactoring by grep. Rename at the definition, run the compiler, fix exactly what it
  names; grep finds comments and strangers, the compiler finds the callers. /rename is the procedure.

Verify only with the project's `agent:*` scripts; never compose framework commands.
Language guide by file: `.ts`/`.tsx` → typescript.md, `.rs` → rust.md.
Never edit workflows, infrastructure, `.claude/`, secrets, CLAUDE.md or AGENTS.md unless
the task names the file. Never kill or reuse a process you did not start.
The owner is on a Claude subscription: no API key, ever.
