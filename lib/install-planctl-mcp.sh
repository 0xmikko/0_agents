#!/usr/bin/env bash
# Register the planctl MCP server for Codex and Claude Code, once per user.
# One global entry serves every repository: the server takes the repository
# from each plan path. Re-runs add nothing. Absent CLIs are skipped by name.
set -euo pipefail
for arg in "$@"; do
  case "$arg" in
    -h|--help)
      cat <<'EOF'
usage: install-planctl-mcp.sh
Registers the planctl MCP server (stdio, `planctl mcp`) for:
  - Codex:      codex mcp add planctl -- planctl mcp
  - Claude:     claude mcp add -s user planctl -- planctl mcp
A server already reported by `codex mcp get planctl` or `claude mcp get planctl`
is left alone. The `planctl` launcher must be on PATH (lib/install-bin.sh).
EOF
      exit 0
      ;;
    *)
      echo "unknown flag: $arg" >&2
      exit 1
      ;;
  esac
done
say() { printf "\n▶ %s\n" "$*"; }
ok() { printf "  ✓ %s\n" "$*"; }
warn() { printf "  ⚠ %s\n" "$*" >&2; }

if command -v codex >/dev/null 2>&1; then
  say "Codex MCP"
  echo "  checking: codex mcp get planctl"
  if codex mcp get planctl >/dev/null 2>&1; then
    ok "codex MCP 'planctl' already registered"
  else
    echo "  running: codex mcp add planctl -- planctl mcp"
    if codex mcp add planctl -- planctl mcp; then
      ok "registered codex MCP 'planctl'"
    else
      warn "failed to register codex MCP 'planctl'"
    fi
  fi
else
  warn "codex not found; skipping Codex MCP"
fi

if command -v claude >/dev/null 2>&1; then
  say "Claude MCP"
  echo "  checking: claude mcp get planctl"
  if claude mcp get planctl >/dev/null 2>&1; then
    ok "claude MCP 'planctl' already registered"
  else
    echo "  running: claude mcp add -s user planctl -- planctl mcp"
    if claude mcp add -s user planctl -- planctl mcp; then
      ok "registered claude MCP 'planctl' (scope: user)"
    else
      warn "failed to register claude MCP 'planctl'"
    fi
  fi
else
  warn "claude not found; skipping Claude MCP"
fi
