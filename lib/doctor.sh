#!/usr/bin/env bash
# Read-only diagnostics for an agent host.
# Reports what's installed, what's symlinked correctly, what's drifted.
# Does NOT change anything.
#
# Run anytime to verify the host is healthy; useful after `update.sh`,
# after a fresh setup, or when something feels off.
#
# Exit code:
#   0  — all checks passed
#   1  — one or more soft failures (something drifted; manual fix expected)
#   2  — script error (bash bug, missing repo, etc.)
#
# Usage:
#   doctor.sh                  # full report
#   doctor.sh --quiet          # only print failures
#   doctor.sh --server         # also check server-only artifacts (settings.json,
#                                cyrus systemd unit, tunnel)

set -euo pipefail

QUIET=0
SERVER_MODE=0
for arg in "$@"; do
  case "$arg" in
    --quiet)  QUIET=1 ;;
    --server) SERVER_MODE=1 ;;
    -h|--help)
      sed -n '2,/^set -euo/p' "$0" | grep '^#' | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

REPO_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
FAILS=0
PASSES=0

ok()   { [ "$QUIET" -eq 1 ] || printf '✓ %s\n' "$*"; PASSES=$((PASSES+1)); }
fail() { printf '✗ %s\n' "$*" >&2; FAILS=$((FAILS+1)); }
info() { [ "$QUIET" -eq 1 ] || printf '· %s\n' "$*"; }
sect() { [ "$QUIET" -eq 1 ] || printf '\n──── %s ─────────────────────────\n' "$*"; }

# ─── 1. Required CLIs ──────────────────────────────────────────────────────
sect "CLIs"
for c in node npm git curl bash; do
  if command -v "$c" >/dev/null; then
    ok "$c: $(command -v "$c")"
  else
    fail "$c not on PATH"
  fi
done
if command -v claude >/dev/null; then
  ok "claude: $(claude --version 2>/dev/null | head -1)"
else
  fail "claude (Claude Code) not installed — run install-runtimes.sh"
fi
if command -v codex >/dev/null; then
  ok "codex: $(codex --version 2>/dev/null | head -1)"
else
  fail "codex not installed — run install-runtimes.sh"
fi
if command -v markdown-view >/dev/null; then
  ok "markdown-view: $(command -v markdown-view)"
else
  fail "markdown-view not on PATH — run install-bin.sh"
fi
if command -v plan-view >/dev/null; then
  ok "plan-view (backward-compat): $(readlink "$(command -v plan-view)" 2>/dev/null || command -v plan-view)"
else
  info "plan-view symlink absent (non-blocking)"
fi
if command -v nvim >/dev/null; then
  ok "nvim: $(nvim --version | head -1 | awk '{print $2}')"
else
  info "nvim absent — run install-lazyvim.sh if you want LazyVim"
fi

# ─── 2. ~/.claude symlinks ─────────────────────────────────────────────────
sect "Claude config (~/.claude/)"
for item in CLAUDE.md agents skills lang; do
  expected="$REPO_DIR/claude/$item"
  [ "$item" = "lang" ] && expected="$REPO_DIR/shared/lang"
  dst="$HOME/.claude/$item"
  if [ -L "$dst" ]; then
    target="$(readlink "$dst")"
    if [ "$target" = "$expected" ]; then
      ok "~/.claude/$item → $expected"
    else
      fail "~/.claude/$item points at $target, expected $expected"
    fi
  else
    fail "~/.claude/$item is not a symlink (or missing) — run install.sh"
  fi
done

# ─── 3. ~/.codex symlinks (per-skill) ───────────────────────────────────────
sect "Codex config (~/.codex/)"
for item in AGENTS.md agents lang; do
  expected="$REPO_DIR/codex/$item"
  [ "$item" = "lang" ] && expected="$REPO_DIR/shared/lang"
  dst="$HOME/.codex/$item"
  if [ -L "$dst" ]; then
    target="$(readlink "$dst")"
    if [ "$target" = "$expected" ]; then
      ok "~/.codex/$item → $expected"
    else
      fail "~/.codex/$item points at $target, expected $expected"
    fi
  else
    fail "~/.codex/$item is not a symlink (or missing) — run install.sh"
  fi
done
if [ -d "$HOME/.codex/skills" ]; then
  ok "~/.codex/skills exists"
  # Spot-check that the most-used shared skills are symlinked
  for skill in start-work mdurl bug fast-precommit; do
    src="$REPO_DIR/codex/skills/$skill"
    dst="$HOME/.codex/skills/$skill"
    if [ -L "$dst" ]; then
      target="$(readlink "$dst")"
      if [ "$target" = "$src" ]; then
        ok "~/.codex/skills/$skill → $src"
      else
        fail "~/.codex/skills/$skill points at $target, expected $src"
      fi
    elif [ -e "$dst" ]; then
      info "~/.codex/skills/$skill exists but is not a symlink (operator override?)"
    else
      fail "~/.codex/skills/$skill missing — run install.sh"
    fi
  done
else
  fail "~/.codex/skills missing — run install.sh"
fi
if [ -f "$HOME/.codex/config.toml" ]; then
  ok "~/.codex/config.toml present"
else
  fail "~/.codex/config.toml missing — run install-codex-config.sh"
fi

# ─── 4. ~/.local/bin helpers ────────────────────────────────────────────────
sect "~/.local/bin"
for bin in markdown-view frogmouth-tuned agent-session-name; do
  dst="$HOME/.local/bin/$bin"
  src="$REPO_DIR/bin/$bin"
  if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then
    ok "~/.local/bin/$bin → $src"
  elif [ -e "$dst" ]; then
    info "~/.local/bin/$bin exists but isn't a symlink to repo (operator override?)"
  else
    fail "~/.local/bin/$bin missing — run install-bin.sh"
  fi
done

# ─── 5. MCP registrations ───────────────────────────────────────────────────
sect "MCP servers"
if command -v claude >/dev/null; then
  if claude mcp list 2>/dev/null | grep -q '^codex:'; then
    ok "claude → codex MCP registered"
  else
    fail "claude → codex MCP not registered — run install.sh"
  fi
  if claude mcp list 2>/dev/null | grep -qi 'linear'; then
    ok "claude → linear MCP registered"
  else
    fail "claude → linear MCP not registered — run install-linear-mcp.sh"
  fi
fi
if command -v codex >/dev/null; then
  if codex mcp list 2>/dev/null | grep -qi 'linear'; then
    ok "codex → linear MCP registered"
  else
    fail "codex → linear MCP not registered — run install-linear-mcp.sh"
  fi
fi

# ─── 6. Subscription tokens (presence only — does NOT verify validity) ──────
sect "Subscription tokens (presence)"
[ -f "$HOME/.claude/.credentials.json" ] && ok "claude .credentials.json present" \
  || fail "claude .credentials.json missing — run 'claude' then '/login'"
[ -f "$HOME/.codex/auth.json" ] && ok "codex auth.json present" \
  || fail "codex auth.json missing — run 'codex login'"

# ─── 7. LazyVim (best-effort) ───────────────────────────────────────────────
sect "LazyVim"
if [ -f "$HOME/.config/nvim/lua/config/lazy.lua" ]; then
  ok "LazyVim starter at ~/.config/nvim"
else
  info "LazyVim not installed (run install-lazyvim.sh if you want nvim)"
fi

# ─── 8. Server-only checks ─────────────────────────────────────────────────
if [ "$SERVER_MODE" -eq 1 ]; then
  sect "Server profile (--server)"
  expected="$REPO_DIR/server/claude/settings.json"
  dst="$HOME/.claude/settings.json"
  if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$expected" ]; then
    ok "~/.claude/settings.json → $expected (wide-permission profile)"
  else
    fail "~/.claude/settings.json not symlinked to server profile — run install.sh --server"
  fi

  expected="$REPO_DIR/server/codex/config.toml"
  dst="$HOME/.codex/config.toml"
  if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$expected" ]; then
    ok "~/.codex/config.toml → $expected (server workspace-write profile)"
  else
    info "~/.codex/config.toml is not the server profile (may be intentional on a non-Cyrus host)"
  fi

  if command -v cyrus >/dev/null; then
    ok "cyrus CLI installed"
    if systemctl --user --quiet is-active cyrus.service 2>/dev/null; then
      ok "cyrus.service active"
    else
      info "cyrus.service not active (run 'systemctl --user start cyrus.service' if expected)"
    fi
    if systemctl --user list-units --type=service 2>/dev/null | grep -q 'cloudflared-.*\.service.*active'; then
      ok "cloudflared tunnel service active"
    else
      info "no active cloudflared tunnel service (set up via setup-cyrus.sh)"
    fi
  else
    info "cyrus not installed (run setup-cyrus.sh on a server that should host it)"
  fi
fi

# ─── Summary ────────────────────────────────────────────────────────────────
sect "Summary"
total=$((PASSES + FAILS))
printf 'passed: %d / %d\n' "$PASSES" "$total"
if [ "$FAILS" -gt 0 ]; then
  printf 'failed: %d   ← see ✗ lines above\n' "$FAILS"
  exit 1
fi
printf 'all checks passed.\n'
