#!/bin/sh
# Install and verify the repository-managed planctl command.
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
installer="$repo_dir/lib/install-bin.sh"
installed_planctl="$HOME/.local/bin/planctl"

if ! command -v bash >/dev/null 2>&1; then
  echo "Error: bash is required by $installer" >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun is required to run planctl" >&2
  exit 1
fi

if [ ! -f "$installer" ]; then
  echo "Error: canonical installer not found: $installer" >&2
  exit 1
fi

bash "$installer"

if [ ! -x "$installed_planctl" ]; then
  echo "Error: planctl was not installed at $installed_planctl" >&2
  exit 1
fi

help_output=$("$installed_planctl" --help)
case "$help_output" in
  *"Usage: planctl <command>"*) ;;
  *)
    echo "Error: installed planctl returned unexpected help output" >&2
    exit 1
    ;;
esac

echo "planctl installed and verified: $installed_planctl"
