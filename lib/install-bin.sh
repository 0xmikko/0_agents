#!/usr/bin/env bash
# Install shared local helper scripts into ~/.local/bin.

set -euo pipefail

REPO_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
BIN_SRC="$REPO_DIR/bin"
BIN_DST="${HOME}/.local/bin"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dest)
      [[ $# -ge 2 ]] || { echo "ERROR: --dest requires an absolute path" >&2; exit 2; }
      BIN_DST="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: install-bin.sh [--dest <absolute-directory>]"
      exit 0
      ;;
    *) echo "ERROR: unknown flag: $1" >&2; exit 2 ;;
  esac
done

[[ "$BIN_DST" = /* ]] || { echo "ERROR: --dest must be absolute" >&2; exit 2; }

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
install_bin_item planctl
install_bin_item planctld
install_bin_item planctl-server
install_bin_item agent-stack

# markdown-view is retired: mdurl is the single markdown-viewing command
# (terminal panes hid mermaid; the rendered page shows it). Remove the old
# symlinks on machines that still carry them.
for retired in markdown-view plan-view; do
  retired_dst="$BIN_DST/$retired"
  if [ -L "$retired_dst" ] || [ -e "$retired_dst" ]; then
    rm "$retired_dst"
    echo "✓ removed retired bin: ~/.local/bin/$retired (use mdurl)"
  fi
done

echo ""
echo "Done. Verify with:  ls -la \"$BIN_DST\""
