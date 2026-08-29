#!/usr/bin/env bash
# Bootstrap a fresh Mac as an agent client.
#
# Idempotent — re-runs detect what's already in place and only update
# what's missing. Safe to use as the standard "bring this Mac up to
# current 0_agents baseline" command.
#
# What this installs (in order, all helpers live in lib/):
#   0. Sanity checks (running as user, Homebrew + git present)
#   1. lib/install.sh              (claude+codex symlinks; NOT --server on a client)
#   2. lib/install-bin.sh          (~/.local/bin/frogmouth-tuned, ...)
#   3. lib/install-codex-config.sh (Codex config.toml render)
#   4. lib/install-runtimes.sh     (claude native binary + codex npm CLI)
#   5. lib/install-linear-mcp.sh   (Linear MCP register)
#   6. lib/install-lazyvim.sh      (LazyVim — operator wants to learn nvim on Mac too)
#   7. lib/macos_hotkey.sh         (Hammerspoon + Cmd-Shift-3 screenshot upload)
#   8. lib/install-completions.sh  (zsh completions for zellij/gh/bun/codex/...)
#   9. Subscription logins (interactive: claude /login, codex login)
#  10. Manual hints (Tailscale, etc.)
#
# Does NOT do:
#   - Homebrew install (you do that yourself: https://brew.sh)
#   - Tailscale install/login (manual: brew install --cask tailscale)
#   - GitHub SSH key (manual: ssh-keygen + paste pubkey to GitHub)
#
# Usage:
#   install-client-mac.sh                 # full bootstrap
#   install-client-mac.sh --no-runtimes   # skip claude/codex install
#   install-client-mac.sh --no-lazyvim    # skip LazyVim install
#   install-client-mac.sh --no-hotkey     # skip Hammerspoon screenshot hotkey
#   install-client-mac.sh --no-logins     # skip interactive subscription logins

set -euo pipefail

DO_RUNTIMES=1
DO_LAZYVIM=1
DO_HOTKEY=1
DO_LOGINS=1
for arg in "$@"; do
  case "$arg" in
    --no-runtimes) DO_RUNTIMES=0 ;;
    --no-lazyvim)  DO_LAZYVIM=0 ;;
    --no-hotkey)   DO_HOTKEY=0 ;;
    --no-logins)   DO_LOGINS=0 ;;
    -h|--help)
      sed -n '2,/^set -euo/p' "$0" | grep '^#' | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

REPO_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

say()   { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
warn()  { printf "\n\033[1;33m⚠ %s\033[0m\n" "$*"; }
ok()    { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }
err()   { printf "\n\033[1;31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

# ─── 0. Sanity ──────────────────────────────────────────────────────────────
say "Sanity checks"
[[ "$(id -u)" -ne 0 ]] || err "Do NOT run as root."
[[ "$(uname -s)" == "Darwin" ]] || err "This script is macOS-only. On Linux use install-server-linux.sh."

for c in bash curl git ssh; do
  command -v "$c" >/dev/null || err "$c is missing. Install via your package manager and rerun."
done

if ! command -v brew >/dev/null; then
  err "Homebrew is required. Install it from https://brew.sh, then rerun."
fi
ok "running as $(whoami) on macOS, brew $(brew --version | head -1 | awk '{print $2}')"

# ─── 1. install.sh (config symlinks) ────────────────────────────────────────
say "Installing agent config (claude + codex symlinks)"
bash "$REPO_DIR/lib/install.sh"

# ─── 2. install-bin.sh ──────────────────────────────────────────────────────
say "Installing ~/.local/bin helpers"
bash "$REPO_DIR/lib/install-bin.sh"

# ─── 3. install-codex-config.sh ────────────────────────────────────────────────────
say "Rendering Codex config.toml"
bash "$REPO_DIR/lib/install-codex-config.sh"

# ─── 4. install-runtimes.sh (claude-code + codex npm CLIs) ──────────────────
if [[ "$DO_RUNTIMES" -eq 1 ]]; then
  if ! command -v node >/dev/null; then
    say "Installing Node via Homebrew"
    brew install node
  fi
  say "Installing agent runtimes"
  bash "$REPO_DIR/lib/install-runtimes.sh"
else
  warn "skipping runtimes install (--no-runtimes)"
fi

# ─── 5. install-linear-mcp.sh ───────────────────────────────────────────────
say "Registering Linear MCP"
bash "$REPO_DIR/lib/install-linear-mcp.sh" || warn "install-linear-mcp.sh exited non-zero (continuing)"

# ─── 6. install-lazyvim.sh ──────────────────────────────────────────────────
if [[ "$DO_LAZYVIM" -eq 1 ]]; then
  say "Installing LazyVim"
  bash "$REPO_DIR/lib/install-lazyvim.sh"
else
  warn "skipping LazyVim install (--no-lazyvim)"
fi

# ─── 7. macos_hotkey.sh (Hammerspoon screenshot hotkey) ─────────────────────
if [[ "$DO_HOTKEY" -eq 1 ]]; then
  if [[ -x "$REPO_DIR/lib/macos_hotkey.sh" ]]; then
    say "Installing Hammerspoon + Cmd-Shift-3 screenshot hotkey"
    bash "$REPO_DIR/lib/macos_hotkey.sh" \
      || warn "macos_hotkey.sh exited non-zero (you may need to grant Hammerspoon Accessibility access in System Settings)"
  fi
else
  warn "skipping screenshot hotkey (--no-hotkey)"
fi

# ─── 8. install-completions.sh (zsh completions) ────────────────────────────
if [[ -x "$REPO_DIR/lib/install-completions.sh" ]]; then
  say "Installing zsh completions"
  bash "$REPO_DIR/lib/install-completions.sh"
fi

# ─── 9. Subscription logins ─────────────────────────────────────────────────
if [[ "$DO_LOGINS" -eq 0 ]]; then
  warn "skipping subscription logins (--no-logins). Run manually:"
  echo "    claude         # then /login"
  echo "    codex login"
else
  say "Claude Code subscription login"
  if [[ -f "$HOME/.claude/.credentials.json" ]]; then
    ok "claude-code already authenticated ($HOME/.claude/.credentials.json present)"
  else
    echo "  Running 'claude setup-token' — open the printed URL, sign in, paste back."
    claude setup-token \
      || warn "setup-token failed; finish manually: run 'claude' then '/login'"
  fi

  say "Codex subscription login"
  if [[ -f "$HOME/.codex/auth.json" ]]; then
    ok "codex already authenticated ($HOME/.codex/auth.json present)"
  else
    codex login \
      || warn "codex login exited non-zero — retry with 'codex login'"
  fi
fi

# ─── 10. Manual hints ───────────────────────────────────────────────────────
say "Done."
cat <<EOF
  Repo            : $REPO_DIR @ $(cd "$REPO_DIR" && git rev-parse --short HEAD)
  Node            : $(node --version 2>/dev/null || echo 'NOT INSTALLED — brew install node')
  claude-code     : $(claude --version 2>/dev/null | head -1 || echo 'NOT INSTALLED')
  codex           : $(codex --version 2>/dev/null | head -1 || echo 'NOT INSTALLED')

  Symlinks installed:
    ~/.claude/{CLAUDE.md, agents, skills, lang}
    ~/.codex/{skills/*, agents, lang}
    ~/.codex/config.toml
    ~/.config/zellij/config.kdl (defaults + Russian-layout mirror binds)
    ~/.local/bin/{frogmouth-tuned, agent-session-name}

  ~/.claude/settings.json was NOT installed (Mac uses its own settings).
  Server-side wide-permission profile is at $REPO_DIR/server/claude/settings.json
  if you want to crib from it.

  Manual steps you may still need:
    - Tailscale  : brew install --cask tailscale  &&  open Tailscale app, log in
    - GitHub SSH : ssh-keygen -t ed25519 -C "\$(whoami)@\$(hostname)"
                   gh auth login   (or paste pubkey at https://github.com/settings/keys)
    - Grant Hammerspoon Accessibility access if Cmd-Shift-3 doesn't work:
      System Settings → Privacy & Security → Accessibility → enable Hammerspoon

  To re-apply latest 0_agents changes anytime:
    bash $REPO_DIR/update.sh
EOF
