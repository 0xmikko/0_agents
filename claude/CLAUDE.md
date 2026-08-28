# Global Claude Code instructions

This file is the entry point for every Claude Code session.

## Session context

The initiator of each session (Cyrus, a CLI invocation, the VS Code plugin,
my SSH terminal) is responsible for telling you the session's purpose and
constraints in the first message. If the first message includes instructions
about which skills to use or skip, follow them. Without explicit instructions,
treat the session as a normal interactive collaboration where all skills are
available.

## At the start of any task

1. If a project-local CLAUDE.md exists in `$cwd` or any ancestor directory,
   read it. Project rules override global ones for project-specific conflicts.
2. Determine the language(s) the task touches. Read the matching
   `~/.claude/lang/<lang>.md` for each.

## Language routing

Read the matching file for each language the task touches:

- Rust → `~/.claude/lang/rust.md`
- TypeScript / JavaScript / React / Node → `~/.claude/lang/typescript.md`

For multi-language tasks, read all relevant files.

## Always-on principles

### Shared code-production process

For non-trivial planned work, read the laws in
`~/Coding/0_agents/shared/code-production/laws/`: `development-process.md`,
`plan-format.md`, and `git-workflow.md`. Use `planctl`; after either lock,
never edit Plan Markdown or checkboxes directly. Projects expose verification
only through the standard `agent:*` package scripts. A Stage buys
`agent:verify:commit`; a PR Delivery buys `agent:verify:pr` once. Agents never
merge to `staging` or `main`.

For git operations (branching, commits, merges, history) — see
~/.claude/agents/git.md. The summary: never rewrite history.

### TDD

- Define **invariants** (a numbered list of testable statements) before writing
  any code.
- Write a **RED test** that captures each invariant — it must FAIL on current
  code. If it passes immediately, it doesn't capture the invariant; rewrite it.
- Implement the minimum code to make the test GREEN.
- Run the Stage's 1–3 named behavior files before its commit. The complete
  suite runs once at the PR Delivery publication boundary through
  `agent:verify:pr`, then CI repeats it on the published SHA.
- Skill-level escape hatches that bypass RED test (e.g. `/bug` for typos)
  are explicit and require the skill itself to announce them. Never skip
  RED test on your own initiative.

### Code changes

- **Explore before editing.** Don't guess file ownership, architecture, or
  verification requirements. Read relevant files and grep for patterns first.
- **NO FALLBACKS without user confirmation.** Never add fallback logic, default
  behaviors, safety nets, or "just in case" code that wasn't explicitly
  requested. If a value is missing, leave it missing and surface the error.
- When docs and current code differ, **prefer the code** and call out the
  drift to the user.

### Process etiquette

- Don't kill, stop, reuse, or attach to processes you didn't start.
- Don't use shared/main dev ports for E2E or Playwright verification — pick
  isolated ports per worktree.

## Project-local override

If a project's `CLAUDE.md` disagrees with this file on a specific rule, the
project wins for that project. Otherwise this file is the source of truth.

## Boundaries (always)

- Never modify `.github/workflows/`, `infrastructure/`, `.claude/`,
  `~/.claude/`, `~/.cyrus/`, `~/Coding/0_agents/claude/`, or any path
  containing secrets, unless the task explicitly names the file.
- Never edit `CLAUDE.md` or `AGENTS.md` as part of a feature task. They are
  governance documents — changes to them are a separate task initiated by the
  user.
