#!/usr/bin/env bash
# Validate and install one explicit planctl machine/server role.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROLE=""
CONFIG_PATH=""
UNIT_DIR="${XDG_CONFIG_HOME:-${HOME}/.config}/systemd/user"
BIN_DIR="${HOME}/.local/bin"
SYSTEMCTL_BIN="systemctl"

usage() {
  echo "Usage: setup-planctl.sh --role <machine|server> --config <absolute.toml> [--unit-dir <absolute-dir>] [--bin-dir <absolute-dir>] [--systemctl <command>]"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --role|--config|--unit-dir|--bin-dir|--systemctl)
      [[ $# -ge 2 ]] || { echo "planctl setup: $1 requires a value" >&2; exit 2; }
      case "$1" in
        --role) ROLE="$2" ;;
        --config) CONFIG_PATH="$2" ;;
        --unit-dir) UNIT_DIR="$2" ;;
        --bin-dir) BIN_DIR="$2" ;;
        --systemctl) SYSTEMCTL_BIN="$2" ;;
      esac
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "planctl setup: unknown flag $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ "$ROLE" = "machine" || "$ROLE" = "server" ]] || { echo "planctl setup: --role must be machine or server" >&2; exit 2; }
[[ "$CONFIG_PATH" = /* ]] || { echo "planctl setup: --config must be absolute" >&2; exit 2; }
[[ "$UNIT_DIR" = /* ]] || { echo "planctl setup: --unit-dir must be absolute" >&2; exit 2; }
[[ "$BIN_DIR" = /* ]] || { echo "planctl setup: --bin-dir must be absolute" >&2; exit 2; }
if [[ "$SYSTEMCTL_BIN" == */* ]]; then
  [[ -x "$SYSTEMCTL_BIN" ]] || { echo "planctl setup: --systemctl is not executable" >&2; exit 2; }
else
  command -v "$SYSTEMCTL_BIN" >/dev/null || { echo "planctl setup: systemctl command is unavailable" >&2; exit 2; }
fi

# This must remain the first mutating boundary: invalid configuration creates
# no links, unit files, or service state.
"$REPO_DIR/bin/planctl" config check --role "$ROLE" --path "$CONFIG_PATH"

if [[ "$ROLE" = "machine" ]]; then
  UNIT_NAME="planctld.service"
  BINARY_NAME="planctld"
else
  UNIT_NAME="planctl-server.service"
  BINARY_NAME="planctl-server"
fi

TEMPLATE="$REPO_DIR/planctl/deploy/$UNIT_NAME"
[[ -f "$TEMPLATE" ]] || { echo "planctl setup: missing unit template $TEMPLATE" >&2; exit 1; }

bash "$REPO_DIR/lib/install-bin.sh" --dest "$BIN_DIR"

mkdir -p "$UNIT_DIR"
UNIT_PATH="$UNIT_DIR/$UNIT_NAME"
UNIT_CANDIDATE="$(mktemp "$UNIT_DIR/.planctl-unit.XXXXXX")"
cleanup() { rm -f "$UNIT_CANDIDATE"; }
trap cleanup EXIT

escape_sed() { printf '%s' "$1" | sed 's/[&|]/\\&/g'; }
sed \
  -e "s|@PLANCTL_BIN@|$(escape_sed "$BIN_DIR/$BINARY_NAME")|g" \
  -e "s|@CONFIG_PATH@|$(escape_sed "$CONFIG_PATH")|g" \
  -e "s|@REPO_DIR@|$(escape_sed "$REPO_DIR")|g" \
  "$TEMPLATE" > "$UNIT_CANDIDATE"

if [[ ! -f "$UNIT_PATH" ]] || ! cmp -s "$UNIT_CANDIDATE" "$UNIT_PATH"; then
  install -m 0644 "$UNIT_CANDIDATE" "$UNIT_PATH"
fi

"$SYSTEMCTL_BIN" --user daemon-reload
"$SYSTEMCTL_BIN" --user enable --now "$UNIT_NAME"
echo "planctl setup: $ROLE role active via $UNIT_NAME"
