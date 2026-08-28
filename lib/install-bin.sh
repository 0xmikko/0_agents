#!/usr/bin/env bash
# Install shared local helper scripts into ~/.local/bin.

set -euo pipefail

REPO_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
BIN_SRC="$REPO_DIR/bin"
BIN_DST="$HOME/.local/bin"

[ -d "$BIN_SRC" ] || { echo "ERROR: $BIN_SRC not found"; exit 1; }

install_bin_item() {
  local name="$1"
  local src="$BIN_SRC/$name"
  local dst="$BIN_DST/$name"

  [ -f "$src" ] || return 0
  mkdir -p "$BIN_DST"

  if [ -L "$dst" ]; then
    local current
    current=$(readlink "$dst")
    if [ "$current" = "$src" ]; then
      echo "✓ already linked: ~/.local/bin/$name"
      return
    fi
    echo "  replacing stale symlink ~/.local/bin/$name (was → $current)"
    rm "$dst"
  elif [ -e "$dst" ]; then
    local backup="${dst}.bak.$(date +%s)"
    echo "  backing up existing ~/.local/bin/$name → $(basename "$backup")"
    mv "$dst" "$backup"
  fi

  chmod +x "$src"
  ln -s "$src" "$dst"
  echo "✓ linked: ~/.local/bin/$name → $src"
}

install_bin_item agent-session-name
install_bin_item frogmouth-tuned
install_bin_item markdown-view
install_bin_item planctl
install_bin_item agent-stack

# Backward-compat: keep `plan-view` as a symlink to `markdown-view` so
# existing aliases / muscle memory / older skill references continue to
# work. Safe to remove once nothing invokes `plan-view` directly.
plan_view_dst="$BIN_DST/plan-view"
if [ -L "$plan_view_dst" ] && [ "$(readlink "$plan_view_dst")" = "markdown-view" ]; then
  echo "✓ already linked: ~/.local/bin/plan-view → markdown-view"
else
  if [ -e "$plan_view_dst" ] || [ -L "$plan_view_dst" ]; then
    backup="${plan_view_dst}.bak.$(date +%s)"
    echo "  backing up existing plan-view → $(basename "$backup")"
    mv "$plan_view_dst" "$backup"
  fi
  ln -s markdown-view "$plan_view_dst"
  echo "✓ linked: ~/.local/bin/plan-view → markdown-view (backward-compat)"
fi

echo ""
echo "Done. Verify with:  ls -la \"$BIN_DST\""
