#!/usr/bin/env bash
# One command installs the code-production process into a consumer repository:
# the runtime, hooks and workflow, the base branch, the three flow skills as
# managed copies, and the planctl MCP server registered once per user. Then it
# prints the "where am I" screen for that repository.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET=""
BASE=""

usage() {
  echo "Usage: setup-code-production.sh --repo <dir> --base <branch>"
  echo "  --repo   the consumer repository root (package.json with the seven agent:* scripts)"
  echo "  --base   the integration branch its plans branch from, written to code-production.base"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo|--base)
      [[ $# -ge 2 ]] || { echo "setup-code-production: $1 requires a value" >&2; usage >&2; exit 2; }
      case "$1" in
        --repo) TARGET="$2" ;;
        --base) BASE="$2" ;;
      esac
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "setup-code-production: unknown flag $1" >&2; usage >&2; exit 2 ;;
  esac
done
[[ -n "$TARGET" ]] || { echo "setup-code-production: --repo is required" >&2; usage >&2; exit 2; }
[[ -n "$BASE" ]] || { echo "setup-code-production: --base is required" >&2; usage >&2; exit 2; }
[[ -d "$TARGET" ]] || { echo "setup-code-production: --repo $TARGET is not a directory" >&2; exit 2; }
TARGET="$(cd "$TARGET" && pwd)"

say() { printf "\n▶ %s\n" "$*"; }

say "agent-stack install $TARGET --base $BASE"
bun "$REPO_DIR/shared/code-production/agent-stack.ts" install "$TARGET" --base "$BASE"

say "install-planctl-mcp.sh"
bash "$REPO_DIR/lib/install-planctl-mcp.sh"

say "planctl progress --root $TARGET"
bun "$REPO_DIR/planctl/src/cli/main.ts" progress --root "$TARGET"
