# TypeScript conventions

Load this guide for `.ts` and `.tsx` files.

- No `any`, unsafe casts, `@ts-ignore` or `@ts-nocheck`. Decode external
  values from `unknown` and narrow them before use.
- Exported functions declare return types; local helpers may infer them.
- Catch values are `unknown`. Domain errors are typed; the transport owns
  their public representation.
- Keep strict compiler checks. Match unions exhaustively; a missing case
  is an error.
- Use `interface` for object shapes, one field per line. Use `type` for
  unions, intersections and branded identifiers. No `enum`.
- Reuse existing JSON and identifier types; do not create a second copy.
- Use function declarations for top-level exports and arrow functions for
  callbacks. Prefer named exports; framework-required defaults are allowed.
- Use ES modules and `import type`. Order imports: built-in, external,
  internal, relative, then type-only.
- Keep one component per file, with its props type. Components compose
  hooks and wire their results to the view; business behavior has its owner.
- A non-null assertion needs a demonstrated invariant, not a missing check.
