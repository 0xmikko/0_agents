---
name: verify-app
description: Run the project's verification suite (typecheck / lint / test / build) using project-configured commands. Reports a structured PASS/FAIL block. Use before opening a PR or when the user asks to verify.
user-invocable: true
disable-model-invocation: false
---

# Verify App

Run the project's full verification suite and report a structured result.
The skill is generic; the *commands* are provided by the project via
`.claude/temp/env.sh` (or detected from project manifests).

## Setup expected

The project provides command convention via `.claude/temp/env.sh`:

```bash
TYPECHECK_CMD="..."   # may be empty / unset
LINT_CMD="..."        # may be empty / unset
TEST_CMD="..."        # required
BUILD_CMD="..."       # may be empty / unset
```

If `.claude/temp/env.sh` doesn't exist, attempt detection from manifests:

| Manifest | Defaults |
|---|---|
| `package.json` | `bun run typecheck`, `bun run lint`, `bun test`, `bun run build` (substitute `bun` with `npm`/`pnpm`/`yarn` per lockfile) |
| `Cargo.toml` | `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `cargo build` |
| `pyproject.toml` | `mypy .`, `ruff check`, `pytest`, (no build) |
| `go.mod` | `go vet ./...`, (no lint by default), `go test ./...`, `go build ./...` |

If detection fails for any step, mark that step SKIPPED and continue.

## Protocol

```bash
[ -f .claude/temp/env.sh ] && source .claude/temp/env.sh

run_step() {
  local name="$1" cmd="$2"
  if [ -z "$cmd" ]; then
    echo "$name: SKIPPED (no command configured)"
    return 0
  fi
  echo "=== $name ==="
  eval "$cmd"
  echo "${name}_EXIT: $?"
}

run_step TYPECHECK "$TYPECHECK_CMD"
run_step LINT      "$LINT_CMD"
run_step TEST      "$TEST_CMD"
run_step BUILD     "$BUILD_CMD"
```

## Output

```text
SMOKE_TEST (verify-app)
-----------------------
Typecheck: [PASS|FAIL|SKIPPED] (exit code)
Lint:      [PASS|FAIL|SKIPPED] (exit code)
Tests:     [PASS|FAIL] (exit code)
Build:     [PASS|FAIL|SKIPPED] (exit code)
Warnings:  [N from output]
-----------------------
VERDICT: [PASS|FAIL]
```

## Rules

- Do NOT edit source files. This is a verifier, not a fixer.
- Run ALL configured steps even if earlier ones fail. Report all failures,
  not just the first one.
- Do NOT skip a step on the basis that "it would pass". Run it.
- Count warnings from the output where applicable.

## Boundaries

- Don't kill processes you didn't start. If `TEST_CMD` spawns a long-running
  watcher, the project's env.sh is misconfigured — surface that and stop.
- Don't pollute the workspace with temp files outside `.claude/temp/`.
