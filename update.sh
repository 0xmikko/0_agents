#!/usr/bin/env bash
# Update everything 0_agents manages on this host.
# Idempotent: re-runs every component installer; each one detects what's
# already in place and only changes what's missing or out of date.
#
# Sequence (all installers live in lib/):
#   1. git pull --ff-only          (fast-forward; aborts on diverged history)
#   2. lib/install.sh              (claude+codex symlinks, +server flag passthrough)
#   3. lib/install-bin.sh          (~/.local/bin/agent-session-name, ...)
#   4. lib/install-codex-config.sh (codex/config.toml render)
#   5. lib/install-runtimes.sh     (claude native binary + codex npm — upgrade)
#   6. mdurl shared skill check    (Claude/Codex use repo symlinks from shared/skills)
#   7. lib/install-linear-mcp.sh   (Linear MCP register; OAuth login skipped)
#   8. lib/install-lazyvim.sh      (only if --with-lazyvim or detected nvim use)
#   9. lib/install-completions.sh  (zsh completions for zellij/gh/bun/codex/...)
#  10. lib/omarchy_hotkey.sh       (auto-detected Omarchy desktop only)
#
# Per-step failures DO stop the run (set -e). Intentional skips via flags.
#
# Usage:
#   update.sh                     # full update for current host
#   update.sh --server            # apply server-only settings (server hosts)
#   update.sh --no-pull           # skip git pull (run installers on current HEAD)
#   update.sh --no-runtimes       # skip claude/codex npm upgrade
#   update.sh --with-lazyvim      # also run install-lazyvim.sh
#   update.sh --skip <name>       # skip a specific step (repeatable):
#                                   git, install, bin, codex-config, runtimes,
#                                   mdurl-skill, linear-mcp, lazyvim, completions,
#                                   omarchy-hotkey

set -euo pipefail

SERVER_MODE=0
DO_PULL=1
DO_RUNTIMES=1
DO_LAZYVIM=0
SKIPS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server)        SERVER_MODE=1; shift ;;
    --no-pull)       DO_PULL=0; shift ;;
    --no-runtimes)   DO_RUNTIMES=0; shift ;;
    --with-lazyvim)  DO_LAZYVIM=1; shift ;;
    --skip)          SKIPS+=("$2"); shift 2 ;;
    -h|--help)
      sed -n '2,/^set -euo/p' "$0" | grep '^#' | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

REPO_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

say()      { printf '\n──── %s ─────────────────────────────────────────\n' "$*"; }
ok()       { printf '✓ %s\n' "$*"; }
warn()     { printf '⚠ %s\n' "$*" >&2; }
fail()     { printf '✗ %s\n' "$*" >&2; exit 1; }
should_skip() {
  local name="$1"
  for s in "${SKIPS[@]}"; do
    [ "$s" = "$name" ] && return 0
  done
  return 1
}

# ─── 1. git pull ─────────────────────────────────────────────────────────
if should_skip git || [ "$DO_PULL" -eq 0 ]; then
  ok "skipping git pull"
else
  say "git pull"
  cd "$REPO_DIR"
  before="$(git rev-parse HEAD)"
  if git pull --ff-only 2>&1 | tail -3; then
    after="$(git rev-parse HEAD)"
    if [ "$before" = "$after" ]; then
      ok "already up to date ($after)"
    else
      ok "updated $before → $after"
      git --no-pager log --oneline "$before..$after" | head -10
    fi
  else
    fail "git pull failed; resolve manually"
  fi
fi

# ─── 2. install.sh (config symlinks) ─────────────────────────────────────
if should_skip install; then
  ok "skipping install.sh"
else
  say "install.sh$([ $SERVER_MODE -eq 1 ] && echo ' --server')"
  if [ "$SERVER_MODE" -eq 1 ]; then
    bash "$REPO_DIR/lib/install.sh" --server
  else
    # Pass empty stdin so install.sh's interactive Linux-server prompt is bypassed.
    bash "$REPO_DIR/lib/install.sh" </dev/null
  fi
fi

# ─── 3. install-bin.sh ───────────────────────────────────────────────────
if should_skip bin; then
  ok "skipping install-bin.sh"
else
  say "install-bin.sh"
  bash "$REPO_DIR/lib/install-bin.sh"
fi

# ─── 4. install-codex-config.sh ─────────────────────────────────────────────────
if should_skip codex-config; then
  ok "skipping install-codex-config.sh"
else
  say "install-codex-config.sh"
  bash "$REPO_DIR/lib/install-codex-config.sh"
fi

# ─── 5. install-runtimes.sh ──────────────────────────────────────────────
if should_skip runtimes || [ "$DO_RUNTIMES" -eq 0 ]; then
  ok "skipping install-runtimes.sh"
else
  say "install-runtimes.sh"
  bash "$REPO_DIR/lib/install-runtimes.sh"
fi

# ─── 6. mdurl shared skill check ────────────────────────────────────────
# mdurl is a shared skill at shared/skills/mdurl. claude/skills/mdurl and
# codex/skills/mdurl are repo symlinks to that shared skill, and install.sh
# publishes those symlinks into ~/.claude and ~/.codex.
if should_skip mdurl-skill; then
  ok "skipping mdurl shared skill check"
else
  say "mdurl shared skill"
  [ -f "$REPO_DIR/shared/skills/mdurl/SKILL.md" ] || fail "missing shared mdurl skill"
  [ -L "$REPO_DIR/claude/skills/mdurl" ] || fail "claude/skills/mdurl must be a symlink"
  [ -L "$REPO_DIR/codex/skills/mdurl" ] || fail "codex/skills/mdurl must be a symlink"
  ok "mdurl skill is shared and linked for Claude/Codex"
fi

# ─── 7. install-linear-mcp.sh ────────────────────────────────────────────
if should_skip linear-mcp; then
  ok "skipping install-linear-mcp.sh"
else
  say "install-linear-mcp.sh"
  # The script handles already-registered case as ✓; OAuth login is interactive
  # and a no-op when token is fresh, so safe to re-run.
  bash "$REPO_DIR/lib/install-linear-mcp.sh" || warn "install-linear-mcp.sh exited non-zero (continuing)"
fi

# ─── 8. install-lazyvim.sh (opt-in) ──────────────────────────────────────
if should_skip lazyvim; then
  ok "skipping install-lazyvim.sh"
elif [ "$DO_LAZYVIM" -eq 1 ]; then
  say "install-lazyvim.sh"
  bash "$REPO_DIR/lib/install-lazyvim.sh"
elif [ -f "$HOME/.config/nvim/lua/config/lazy.lua" ]; then
  # Already-installed LazyVim — keep it current (idempotent run).
  say "install-lazyvim.sh (auto-detected existing LazyVim)"
  bash "$REPO_DIR/lib/install-lazyvim.sh"
else
  ok "skipping install-lazyvim.sh (no LazyVim detected; pass --with-lazyvim to install)"
fi

# ─── 9. install-completions.sh ───────────────────────────────────────────
if should_skip completions; then
  ok "skipping install-completions.sh"
else
  say "install-completions.sh"
  bash "$REPO_DIR/lib/install-completions.sh"
fi

# ─── 10. omarchy_hotkey.sh (auto-detected) ──────────────────────────────
if should_skip omarchy-hotkey; then
  ok "skipping omarchy_hotkey.sh"
elif command -v omarchy >/dev/null 2>&1; then
  say "omarchy_hotkey.sh"
  bash "$REPO_DIR/lib/omarchy_hotkey.sh"
else
  ok "skipping omarchy_hotkey.sh (Omarchy not detected)"
fi

cat <<EOF

──── done ───────────────────────────────────────────────
host: $(hostname) ($(uname -s))
mode: $([ $SERVER_MODE -eq 1 ] && echo 'server' || echo 'client')
repo: $REPO_DIR @ $(cd "$REPO_DIR" && git rev-parse --short HEAD)

Next checks (manual):
  - claude mcp list      (codex + linear should appear)
  - codex mcp list       (linear should appear)
  - mdurl -l             (should list your documents)
  - claude --version / codex --version
EOF
