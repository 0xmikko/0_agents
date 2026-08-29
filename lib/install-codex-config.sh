#!/usr/bin/env bash
# Install the Codex CLI configuration from this repo into ~/.codex/.
# Renders HOME-specific paths from codex/config.toml.template.

set -euo pipefail

REPO_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
SRC="$REPO_DIR/codex"
DST="$HOME/.codex"
CONFIG_TEMPLATE="$SRC/config.toml.template"
RULES_SRC="$SRC/rules/default.rules"
SKILLS_SRC="$SRC/skills"

[ -f "$CONFIG_TEMPLATE" ] || { echo "ERROR: $CONFIG_TEMPLATE not found"; exit 1; }

mkdir -p "$DST/rules" "$DST/memories" "$DST/skills"

EXISTING_CONFIG=""
if [ -f "$DST/config.toml" ]; then
  EXISTING_CONFIG="$(mktemp)"
  cp "$DST/config.toml" "$EXISTING_CONFIG"
fi

backup_file() {
  local file="$1"
  if [ -e "$file" ] && [ ! -L "$file" ]; then
    local backup="${file}.bak.$(date +%s)"
    cp "$file" "$backup"
    echo "  backed up $file -> $(basename "$backup")"
  fi
}

render_template() {
  local extra_roots
  local runtime_dir
  extra_roots="$(discover_extra_writable_roots)"
  runtime_dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

  sed \
    -e "s#__HOME__#$HOME#g" \
    -e "s#__XDG_RUNTIME_DIR__#$runtime_dir#g" \
    "$CONFIG_TEMPLATE" \
    | awk -v extra_roots="$extra_roots" '
        $0 == "__EXTRA_WRITABLE_ROOTS__" {
          if (extra_roots != "") print extra_roots
          next
        }
        { print }
      '
}

discover_extra_writable_roots() {
  local roots=()
  local search_roots=(
    "$HOME/Coding"
    "$HOME/.cyrus/repos"
    "$HOME/.cyrus/worktrees"
  )

  local root
  for root in "${search_roots[@]}"; do
    [ -d "$root" ] || continue
    while IFS= read -r path; do
      roots+=("$path")
    done < <(
      find "$root" -maxdepth 5 -type d \( -name .git -o -name .worktrees \) 2>/dev/null
    )
  done

  if [ "${#roots[@]}" -eq 0 ]; then
    return 0
  fi

  printf '%s\n' "${roots[@]}" \
    | sort -u \
    | while IFS= read -r path; do
        printf '  "%s",\n' "$path"
      done
}

append_existing_sections() {
  local section_pattern="$1"
  local source="$2"
  [ -n "$source" ] && [ -f "$source" ] || return 0

  awk -v pattern="$section_pattern" '
    /^\[/ {
      printing = ($0 ~ pattern)
    }
    printing { print }
  ' "$source"
}

backup_file "$DST/config.toml"
render_template > "$DST/config.toml"
{
  append_existing_sections "^\\[plugins\\." "$EXISTING_CONFIG"
  append_existing_sections "^\\[mcp_servers\\." "$EXISTING_CONFIG"
  append_existing_sections "^\\[tui\\." "$EXISTING_CONFIG"
} >> "$DST/config.toml"
chmod 600 "$DST/config.toml"
echo "✓ installed ~/.codex/config.toml"

if [ -f "$RULES_SRC" ]; then
  if [ -f "$DST/rules/default.rules" ]; then
    while IFS= read -r rule; do
      [ -n "$rule" ] || continue
      grep -Fqx "$rule" "$DST/rules/default.rules" || echo "$rule" >> "$DST/rules/default.rules"
    done < "$RULES_SRC"
    echo "✓ merged ~/.codex/rules/default.rules"
  else
    cp "$RULES_SRC" "$DST/rules/default.rules"
    echo "✓ installed ~/.codex/rules/default.rules"
  fi
  chmod 600 "$DST/rules/default.rules"
fi

if [ -d "$SKILLS_SRC" ]; then
  # markdown-view is retired; mdurl is the single markdown command.
  retired_markdown_view="$DST/skills/markdown-view"
  if [ -L "$retired_markdown_view" ] \
    && [ "$(readlink "$retired_markdown_view")" = "$SKILLS_SRC/markdown-view" ]; then
    rm "$retired_markdown_view"
    echo "✓ removed retired Codex skill: ~/.codex/skills/markdown-view"
  fi

  # Remove only stale links previously managed by this repository.
  for stale_skill in "$DST"/skills/*; do
    [ -L "$stale_skill" ] || continue
    stale_target="$(readlink "$stale_skill")"
    case "$stale_target" in
      "$SKILLS_SRC"/*)
        if [ ! -e "$stale_target" ]; then
          rm "$stale_skill"
          echo "✓ removed retired Codex skill: ~/.codex/skills/$(basename "$stale_skill")"
        fi
        ;;
    esac
  done

  find "$SKILLS_SRC" -mindepth 1 -maxdepth 1 -type d | sort | while IFS= read -r skill_src; do
    skill_name="$(basename "$skill_src")"
    skill_dst="$DST/skills/$skill_name"

    if [ -L "$skill_dst" ]; then
      current="$(readlink "$skill_dst")"
      if [ "$current" = "$skill_src" ]; then
        echo "✓ already linked: ~/.codex/skills/$skill_name"
        continue
      fi
      rm "$skill_dst"
    elif [ -e "$skill_dst" ]; then
      backup="${skill_dst}.bak.$(date +%s)"
      mv "$skill_dst" "$backup"
      echo "  backed up ~/.codex/skills/$skill_name -> $(basename "$backup")"
    fi

    ln -s "$skill_src" "$skill_dst"
    echo "✓ linked: ~/.codex/skills/$skill_name"
  done
fi

if [ -n "$EXISTING_CONFIG" ]; then
  rm -f "$EXISTING_CONFIG"
fi

echo ""
echo "Done. New Codex sessions will use workspace-write with reduced approvals."
