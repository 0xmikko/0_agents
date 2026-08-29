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

The process has three self-contained entrypoints: `blueprint` plans,
`blueprint-start` executes, and `end-work` closes a merged Delivery. Do not
chain auxiliary process skills or require project-specific framework commands.
Plans change only through `planctl`; projects expose verification only through
the seven Bun `agent:*` scripts. Agents never merge to `staging` or `main`.
