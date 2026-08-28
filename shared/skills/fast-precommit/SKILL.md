---
name: fast-precommit
description: Run pre-commit checks scoped to changed files only. Use before committing in a worktree instead of the full workspace suite, unless the change touches cross-crate code (db schema, core types, shared traits, migrations).
user-invocable: true
disable-model-invocation: false
---

# Fast pre-commit (scoped)

Run checks scoped to what actually changed, not the whole workspace. Use on every per-stage commit inside a worktree. The final end-of-plan verification still runs the full suite.

## Protocol

1. `git diff --name-only HEAD` → classify the change:

   - **Frontend only** (`frontend/**`):
     ```bash
     cd frontend && bun run typecheck && bun run lint && bun run test -- --changed
     ```

   - **Agent only** (`agent/**`):
     ```bash
     cd agent && bun run typecheck && bun run test
     ```

   - **One Rust module/crate** (`backend/src/<mod>/**` only, no schema, no migrations):
     ```bash
     cargo fmt --check -p <crate>
     cargo clippy -p <crate> --all-targets -- -D warnings
     cargo test -p <crate>
     ```

   - **Cross-cutting** — fall back to full workspace:
     - Touches `backend/src/core/`, `backend/src/db/`, `migrations/`, `Cargo.lock`, or ≥3 modules
     - Any public API change
     ```bash
     cargo fmt --all --check
     cargo clippy --workspace --all-targets -- -D warnings
     cargo test --workspace
     ```

2. Codex review pass — SKIP by default. Only invoke when:
   - Diff > 200 lines, OR
   - Touches a public API (`pub fn`, exported types, HTTP/WS/MCP routes), OR
   - User asked for it explicitly

3. If any check fails → fix → re-run only the failed check.

## When NOT to use

- Merging a worktree to staging/main (run full suite)
- Schema or migration changes (always full workspace)
- Refactors spanning ≥3 modules (always full workspace)
- Release/deploy verification

## Rationale

A 5-stage plan × full workspace per stage ≈ 5× `cargo test --workspace`. Scoping per-stage checks to the affected crate cuts this cost without losing coverage — the end-of-plan gate still runs everything once.

## Task

$ARGUMENTS
