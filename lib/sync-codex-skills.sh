#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: sync-codex-skills.sh <source-dir> <installed-dir>" >&2
  exit 2
fi

skills_source="$1"
skills_installed="$2"

[ -d "$skills_source" ] || { echo "ERROR: $skills_source not found" >&2; exit 1; }
mkdir -p "$skills_installed"

# Remove only broken links previously managed from this source catalog.
for installed_skill in "$skills_installed"/*; do
  [ -L "$installed_skill" ] || continue
  installed_target="$(readlink "$installed_skill")"
  case "$installed_target" in
    "$skills_source"/*)
      if [ ! -e "$installed_target" ]; then
        rm "$installed_skill"
        echo "✓ removed retired Codex skill: ${installed_skill##*/}"
      fi
      ;;
  esac
done

for skill_source in "$skills_source"/*; do
  [ -d "$skill_source" ] || continue
  skill_name="${skill_source##*/}"
  skill_installed="$skills_installed/$skill_name"

  # Older mdurl installs were real directories managed by this repository.
  if [ "$skill_name" = "mdurl" ] && [ -e "$skill_installed" ] && [ ! -L "$skill_installed" ]; then
    backup="${skill_installed}.bak.$(date +%s)"
    mv "$skill_installed" "$backup"
    echo "✓ backed up legacy Codex skill: $skill_name → ${backup##*/}"
  fi

  if [ -L "$skill_installed" ]; then
    installed_target="$(readlink "$skill_installed")"
    if [ "$installed_target" = "$skill_source" ]; then
      echo "✓ already linked: $skill_name"
      continue
    fi
    case "$installed_target" in
      "$skills_source"/*)
        rm "$skill_installed"
        ;;
      *)
        echo "✓ kept operator Codex skill: $skill_name"
        continue
        ;;
    esac
  elif [ -e "$skill_installed" ]; then
    echo "✓ kept operator Codex skill: $skill_name"
    continue
  fi

  ln -s "$skill_source" "$skill_installed"
  echo "✓ linked Codex skill: $skill_name"
done
