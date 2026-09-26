#!/usr/bin/env bash
# Register the planctl MCP server for Codex and Claude Code, once per user,
# and approve every tool of the server for both, so no call asks.
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
Then every tool of the server is approved, once, the way each agent stores
"Always allow" itself:
  - Codex:      [mcp_servers.planctl.tools.<tool>] approval_mode = "approve" in ~/.codex/config.toml
  - Claude:     mcp__planctl in permissions.allow of ~/.claude/settings.json
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
TOOLS="$(bun "$(cd "$(dirname "$0")/.." && pwd)/planctl/src/cli/main.ts" mcp --tools)"

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
  CODEX_CONFIG="$HOME/.codex/config.toml"
  if [ -f "$CODEX_CONFIG" ]; then
    approved=0
    for tool in $TOOLS; do
      if ! grep -qxF "[mcp_servers.planctl.tools.$tool]" "$CODEX_CONFIG"; then
        printf '\n[mcp_servers.planctl.tools.%s]\napproval_mode = "approve"\n' "$tool" >> "$CODEX_CONFIG"
        approved=$((approved + 1))
      fi
    done
    ok "codex approves every planctl tool ($approved newly written in $CODEX_CONFIG)"
  else
    warn "$CODEX_CONFIG not found; codex tool approvals not written"
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
  CLAUDE_SETTINGS="$HOME/.claude/settings.json" bun -e '
    const fs = require("node:fs");
    const path = process.env.CLAUDE_SETTINGS;
    const settings = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : {};
    const permissions = settings.permissions ?? (settings.permissions = {});
    const allow = permissions.allow ?? (permissions.allow = []);
    if (allow.includes("mcp__planctl")) { console.log("  ✓ claude already allows mcp__planctl in " + path); process.exit(0); }
    allow.push("mcp__planctl");
    fs.mkdirSync(require("node:path").dirname(path), { recursive: true });
    fs.writeFileSync(path, JSON.stringify(settings, null, 2) + "\n");
    console.log("  ✓ claude allows mcp__planctl, written to " + path);
  '
else
  warn "claude not found; skipping Claude MCP"
fi
