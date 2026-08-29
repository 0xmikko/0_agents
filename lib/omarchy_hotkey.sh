#!/usr/bin/env bash
# Install the Omarchy/Hyprland equivalent of the macOS Hammerspoon hotkey.
# Alt+Shift+3 selects a region, uploads it, copies the remote path, and
# shows a desktop notification.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCREENSHOT_SCRIPT="$SCRIPT_DIR/screenshot-upload.sh"
BINDINGS_FILE="$HOME/.config/hypr/bindings.lua"
BEGIN_MARKER="-- BEGIN 0_agents screenshot upload"
END_MARKER="-- END 0_agents screenshot upload"

command -v omarchy >/dev/null 2>&1 || {
  echo "omarchy is not installed; skipping screenshot hotkey" >&2
  exit 1
}

[ -x "$SCREENSHOT_SCRIPT" ] || {
  echo "screenshot-upload.sh not found or not executable: $SCREENSHOT_SCRIPT" >&2
  exit 1
}

mkdir -p "$(dirname "$BINDINGS_FILE")"
touch "$BINDINGS_FILE"

updated_file=$(mktemp)
trap 'rm -f "$updated_file"' EXIT

# Remove an earlier managed block, then append the current version. This also
# removes the former Super+Shift+3 unbind and restores Omarchy's default action.
awk -v begin="$BEGIN_MARKER" -v end="$END_MARKER" '
  $0 == begin { managed = 1; next }
  $0 == end   { managed = 0; next }
  !managed    { print }
' "$BINDINGS_FILE" >"$updated_file"

{
  printf '\n%s\n' "$BEGIN_MARKER"
  printf 'hl.unbind("SUPER + SHIFT + 3")\n'
  printf 'o.bind("SUPER + SHIFT + 3", "Move window to workspace 3", hl.dsp.window.move({ workspace = "3" }))\n'
  printf 'o.bind("ALT + SHIFT + 3", "Screenshot and upload", "%s")\n' "$SCREENSHOT_SCRIPT"
  printf '%s\n' "$END_MARKER"
} >>"$updated_file"

if cmp -s "$updated_file" "$BINDINGS_FILE"; then
  echo "✓ Omarchy screenshot upload hotkey already installed"
else
  cp "$BINDINGS_FILE" "$BINDINGS_FILE.bak.$(date +%s)"
  mv "$updated_file" "$BINDINGS_FILE"
  echo "✓ installed Alt+Shift+3 screenshot upload hotkey"
fi

if command -v hyprctl >/dev/null 2>&1 && [ -n "${HYPRLAND_INSTANCE_SIGNATURE:-}" ]; then
  hyprctl reload >/dev/null
  errors=$(hyprctl configerrors 2>/dev/null || true)
  if [ -n "$errors" ]; then
    printf 'Hyprland configuration errors:\n%s\n' "$errors" >&2
    exit 1
  fi
  echo "✓ Hyprland reloaded without configuration errors"
fi
