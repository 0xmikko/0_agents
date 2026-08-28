# Rust conventions

## Verification (every change)

```
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

`-D warnings` is mandatory — clippy warnings are errors. For non-workspace
crates, drop the `--workspace` / `--all` flags accordingly.

## Error handling

- Use `thiserror` for typed domain errors. No raw string errors crossing
  module boundaries.
- Domain layers expose typed errors. The API/transport layer translates them
  to HTTP responses or RPC errors. **Never leak raw DB errors** (sqlx, diesel,
  etc.) to callers.
- `anyhow` is acceptable for binary entry points and orchestration glue, not
  for library APIs.

## Determinism (when ordering or repeatability matters)

For canonicalization, merge logic, hashing, or any code path whose output must
be reproducible:

- Use `BTreeMap` / `IndexMap` instead of `HashMap` when iteration order
  matters. `HashMap` iteration order is non-deterministic.
- Use stable sort with explicit tie-breakers. No random tie-breakers.
- Avoid relying on `HashSet` ordering.
- Same inputs must always produce the same output.

For non-deterministic code (UI state, user-driven flows), `HashMap` is fine.

## Async

- Runtime: tokio. Single global runtime, default work-stealing scheduler.
- Don't call `block_on` inside async contexts — it deadlocks the runtime.
  For sync APIs that must be invoked from async code, use
  `tokio::task::spawn_blocking`. For CPU-bound work, also `spawn_blocking`.
- Prefer `async fn` in trait definitions when the language version permits.
- Bounded channels (`tokio::sync::mpsc::channel(N)`) over unbounded — they
  apply backpressure naturally and surface saturation as errors instead of
  unbounded memory growth.

## Code style

- Public types in library crates should have doc comments describing
  invariants and intended use. Use `///` above the type, not block comments.
- Prefer constructors that validate invariants over public field mutation.
- Match exhaustively. Avoid `_ =>` arms unless the type is genuinely open
  (e.g. an external enum or a `#[non_exhaustive]` upstream type).

### Imports and type paths

- Put `use` declarations at the top of their module, after module docs and
  attributes and before item definitions. Do not add `use` declarations inside
  functions, `impl` blocks, or other executable scopes. A nested module (for
  example, `mod tests`) has its own import block at the top of that module.
- Import types at module scope and refer to them by their short names. Do not
  repeat long absolute paths such as `crate::services::graph::error::ApplicationError`
  in item definitions, trait implementations, function signatures, or bodies.
- In particular, `impl From`, `impl Into`, `impl TryFrom`, and `impl TryInto`
  declarations and their method signatures must use imported short type names.
- When two imported types have the same name, alias one or both explicitly with
  `use path::Type as DescriptiveType;` and use the alias consistently.
- Keep a fully qualified path only when Rust requires it for disambiguation,
  macro hygiene, or another concrete language constraint. Do not use full paths
  merely to avoid adding an import; make any non-obvious exception clear in the
  surrounding code.

```rust
use crate::services::graph::error::ApplicationError;

impl From<ApplicationError> for ApiError {
    fn from(err: ApplicationError) -> Self {
        ApiError::Application(err)
    }
}
```

## Tooling

- `cargo fmt` on save (editor config).
- `cargo clippy -- -D warnings` enforced in CI.
- `cargo-nextest` for fast test runs when the project supports it.
