# Rust conventions

Load this guide for `.rs` files.

- Domain errors are typed. Transport code translates them for callers;
  database error details stay inside their owning layer.
- Match exhaustively. Use a wildcard only for an explicitly open type.
- Validate invariants in constructors. Document public types and their
  invariants with `///` comments.
- When order affects output, use an ordered collection and a stable sort
  with explicit tie-breakers. Never depend on hash iteration order.
- Put imports at the top of their module, including a nested test module.
  Use imported short names in signatures, bodies and conversion traits.
- Alias colliding imported names explicitly. Keep a fully qualified path
  only when required for disambiguation or macro hygiene.
- Handle missing values and errors explicitly. A panic or substituted value
  needs an invariant or an explicit requirement.
