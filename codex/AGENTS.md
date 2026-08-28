# Global Codex instructions

## Language conventions

Before editing or reviewing code, determine which languages the task touches
and read the matching guide:

- Rust: `~/.codex/lang/rust.md`
- TypeScript, JavaScript, React, or Node.js: `~/.codex/lang/typescript.md`

For multi-language changes, read every applicable guide. Project-local
`AGENTS.md` instructions take precedence only for project facts and explicit
conflicts.

## Shared code-production process

For non-trivial planned work, read the laws in
`~/Coding/0_agents/shared/code-production/laws/`:

- `development-process.md` — lifecycle, metrics, parallelism and test cadence
- `plan-format.md` — Plan → PR Delivery → Stage → Task contract
- `git-workflow.md` — worktrees, staging PRs, hooks, CI and handoff

Use `planctl`; after a plan lock, never edit its Markdown or checkboxes
directly. Project verification is exposed only through the seven `agent:*`
scripts in `~/Coding/0_agents/shared/code-production/package-contract.md`.
A Stage buys `agent:verify:commit`; a PR Delivery buys `agent:verify:pr` once.
Agents never merge to `staging` or `main`.
