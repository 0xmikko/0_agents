#!/usr/bin/env bash
# Bootstrap a Linux server as an agent host (Claude Code + Codex + tooling).
#
# Idempotent — re-runs detect what's already in place and only update what's
# missing. Safe to use as the standard "bring this server up to current
# baseline" command after every git pull.
#
# What this installs (in order, all helpers live in lib/):
#   0. Sanity checks (running as user, basic tools present)
#   1. GitHub CLI (gh) + gh auth login + gh auth setup-git
#   2. Node (via nvm)
#   3. Bun
#   4. cloudflared (system tool — Cyrus, dev tunnels, anything else)
#   5. lib/install.sh --server     (claude+codex symlinks + wide-permission settings)
#   6. lib/install-bin.sh          (~/.local/bin/markdown-view, frogmouth-tuned, ...)
#   7. lib/install-codex-config.sh (Codex config.toml render)
#   8. lib/install-runtimes.sh     (claude native binary + codex npm CLI)
#   9. lib/install-linear-mcp.sh   (Linear MCP register; OAuth login deferred)
#  10. lib/install-lazyvim.sh      (LazyVim — useful on Ubuntu where apt nvim is old)
#  11. zsh + oh-my-zsh + ~/.zshrc PATH (chsh to zsh)
#  12. lib/install-completions.sh  (zsh completions for zellij/gh/bun/codex/...)
#  13. Subscription logins (interactive: claude /login, codex login --device-auth)
#  14. Zellij session label
#
# Does NOT install:
#   - mdurl markdown server (separate one-shot: sudo bash lib/setup-mdurl.sh)
#   - Cyrus (separate: bash lib/setup-cyrus.sh)
#
# Does NOT do:
#   - Cyrus bootstrap (use lib/setup-cyrus.sh AFTER this)
#   - Mac-specific things (use install-client-mac.sh)
#   - User creation (do that as root: 'sudo adduser X; sudo loginctl enable-linger X')
#   - SSH keys (do that yourself: 'ssh-keygen -t ed25519')
#   - Repo clone (you've already cloned to run this script)
#
# Run AS THE TARGET USER, not root.
#
# Optional environment overrides:
#   NODE_VERSION    default: 20
#   NVM_VERSION     default: v0.40.1
#
# Usage:
#   install-server-linux.sh                 # full bootstrap
#   install-server-linux.sh --no-runtimes   # skip claude/codex install (faster reruns)
#   install-server-linux.sh --no-lazyvim    # skip LazyVim install
#   install-server-linux.sh --no-logins     # skip interactive subscription logins
#   install-server-linux.sh --planctl-role=machine --planctl-config=/absolute/machine.toml

set -euo pipefail

DO_RUNTIMES=1
DO_LAZYVIM=1
DO_LOGINS=1
PLANCTL_ROLE=""
PLANCTL_CONFIG=""
for arg in "$@"; do
  case "$arg" in
    --no-runtimes) DO_RUNTIMES=0 ;;
    --no-lazyvim)  DO_LAZYVIM=0 ;;
    --no-logins)   DO_LOGINS=0 ;;
    --planctl-role=*) PLANCTL_ROLE="${arg#*=}" ;;
    --planctl-config=*) PLANCTL_CONFIG="${arg#*=}" ;;
    -h|--help)
      sed -n '2,/^set -euo/p' "$0" | grep '^#' | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

if [[ -n "$PLANCTL_ROLE" && -z "$PLANCTL_CONFIG" ]] || [[ -z "$PLANCTL_ROLE" && -n "$PLANCTL_CONFIG" ]]; then
  echo "--planctl-role and --planctl-config must be supplied together" >&2
  exit 2
fi
if [[ -n "$PLANCTL_ROLE" ]]; then
  [[ "$PLANCTL_ROLE" = "machine" || "$PLANCTL_ROLE" = "server" ]] \
    || { echo "--planctl-role must be machine or server" >&2; exit 2; }
  [[ "$PLANCTL_CONFIG" = /* ]] || { echo "--planctl-config must be an absolute path" >&2; exit 2; }
fi

REPO_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
NODE_VERSION="${NODE_VERSION:-20}"
NVM_VERSION="${NVM_VERSION:-v0.40.1}"

say()   { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
warn()  { printf "\n\033[1;33m⚠ %s\033[0m\n" "$*"; }
ok()    { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }
err()   { printf "\n\033[1;31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

# ─── 0. Sanity ──────────────────────────────────────────────────────────────
say "Sanity checks"
[[ "$(id -u)" -ne 0 ]] || err "Do NOT run as root. Switch to your agent user (e.g. 'sudo -iu vibe') and rerun."
for c in bash curl git ssh sudo; do
  command -v "$c" >/dev/null || err "$c is missing. Install via your package manager and rerun."
done
ok "running as $(whoami) on $(uname -s) $(uname -m)"

[[ "$(uname -s)" == "Linux" ]] || warn "This script is targeted at Linux. macOS has its own install-client-mac.sh."

# ─── 1. GitHub CLI (gh) + git credential helper ─────────────────────────────
# Install gh, log in (first run is interactive — paste token or use device
# flow), then `gh auth setup-git` so subsequent `git push` over HTTPS uses the
# same token without prompting. Without this, fresh boxes can't push to
# github.com non-interactively.
say "GitHub CLI (gh)"
if ! command -v gh >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    if ! sudo apt-get install -y gh >/dev/null 2>&1; then
      # Some Ubuntus don't ship gh — add GitHub's apt repo and retry.
      sudo mkdir -p -m 755 /etc/apt/keyrings
      curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null
      sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
      sudo apt-get update -y >/dev/null
      sudo apt-get install -y gh
    fi
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y gh
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y gh
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --noconfirm github-cli
  else
    err "no supported package manager (apt/dnf/yum/pacman) — install gh manually and rerun"
  fi
fi
ok "gh $(gh --version 2>/dev/null | head -1 | awk '{print $3}')"

if gh auth status >/dev/null 2>&1; then
  ok "gh already authenticated"
else
  say "gh auth login (first run — paste a token or use the device-flow code)"
  gh auth login || warn "gh auth login did not complete; rerun later: gh auth login"
fi

# Wire git's HTTPS credential helper to gh for github.com.
gh auth setup-git
ok "git HTTPS auth wired to gh"

# ─── 2. Node via nvm ────────────────────────────────────────────────────────
say "Node $NODE_VERSION (via nvm)"
if [[ ! -s "$HOME/.nvm/nvm.sh" ]]; then
  curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash
  ok "nvm $NVM_VERSION installed"
fi
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
if ! command -v node >/dev/null \
     || [[ "$(node -v 2>/dev/null | sed 's/^v//;s/\..*//')" -lt "$NODE_VERSION" ]]; then
  nvm install "$NODE_VERSION"
  nvm alias default "$NODE_VERSION"
fi
nvm use default >/dev/null
ok "node $(node --version), npm $(npm --version)"

# ─── 3. Bun ─────────────────────────────────────────────────────────────────
say "Bun"
if [[ ! -x "$HOME/.bun/bin/bun" ]]; then
  curl -fsSL https://bun.sh/install | bash
fi
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
ok "bun $(bun --version)"

# ─── 4. cloudflared ─────────────────────────────────────────────────────────
say "cloudflared"
if ! command -v cloudflared >/dev/null; then
  case "$(uname -m)" in
    x86_64)        CFD_ARCH=amd64 ;;
    aarch64|arm64) CFD_ARCH=arm64 ;;
    *) err "Unsupported arch $(uname -m) — install cloudflared manually and rerun." ;;
  esac
  mkdir -p "$HOME/.local/bin"
  curl -L --fail \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CFD_ARCH}" \
    -o "$HOME/.local/bin/cloudflared"
  chmod +x "$HOME/.local/bin/cloudflared"
fi
export PATH="$HOME/.local/bin:$PATH"
ok "cloudflared $(cloudflared --version 2>&1 | head -1)"

# ─── 5. Repo-managed agent config (server mode) ─────────────────────────────
if [[ -x "$REPO_DIR/lib/install.sh" ]]; then
  say "Installing agent config from $REPO_DIR (server mode)"
  bash "$REPO_DIR/lib/install.sh" --server
else
  err "install.sh not found alongside this script — abort"
fi

# ─── 6. ~/.local/bin helpers (markdown-view, frogmouth-tuned, ...) ──────────
if [[ -x "$REPO_DIR/lib/install-bin.sh" ]]; then
  say "Installing ~/.local/bin helpers"
  bash "$REPO_DIR/lib/install-bin.sh"
fi

if [[ -n "$PLANCTL_ROLE" ]]; then
  say "Installing planctl $PLANCTL_ROLE role"
  bash "$REPO_DIR/lib/setup-planctl.sh" --role "$PLANCTL_ROLE" --config "$PLANCTL_CONFIG"
fi

# ─── 7. Codex config.toml render ────────────────────────────────────────────
if [[ -x "$REPO_DIR/lib/install-codex-config.sh" ]]; then
  say "Rendering Codex config.toml"
  bash "$REPO_DIR/lib/install-codex-config.sh"
fi

# ─── 8. Runtimes (claude-code + codex npm CLIs) ─────────────────────────────
if [[ "$DO_RUNTIMES" -eq 1 && -x "$REPO_DIR/lib/install-runtimes.sh" ]]; then
  say "Installing agent runtimes"
  bash "$REPO_DIR/lib/install-runtimes.sh"
else
  warn "skipping runtimes install (--no-runtimes or install-runtimes.sh missing)"
fi

# ─── 9. Linear MCP register ─────────────────────────────────────────────────
if [[ -x "$REPO_DIR/lib/install-linear-mcp.sh" ]]; then
  say "Registering Linear MCP"
  # OAuth login is interactive and requires a browser — print instructions
  # but don't block the bootstrap; user can finish login on their laptop.
  bash "$REPO_DIR/lib/install-linear-mcp.sh" || warn "install-linear-mcp.sh exited non-zero (continuing)"
fi

# ─── 10. LazyVim ────────────────────────────────────────────────────────────
if [[ "$DO_LAZYVIM" -eq 1 && -x "$REPO_DIR/lib/install-lazyvim.sh" ]]; then
  say "Installing LazyVim"
  bash "$REPO_DIR/lib/install-lazyvim.sh"
else
  warn "skipping LazyVim install (--no-lazyvim or install-lazyvim.sh missing)"
fi

# ─── 11. zsh + oh-my-zsh ────────────────────────────────────────────────────
# Install zsh, oh-my-zsh, set zsh as the user's login shell, and seed ~/.zshrc
# with the PATH lines we need (nvm, bun, ~/.local/bin) — without those, codex
# and claude are not on PATH after the user re-logs into a zsh session.
# Needs sudo (system package + chsh + /etc/shells edit). You may be prompted.
say "zsh + oh-my-zsh"
command -v sudo >/dev/null || err "sudo is required for zsh install (system package + chsh)"

install_zsh_pkg() {
  if command -v zsh >/dev/null 2>&1; then
    ok "zsh already installed ($(zsh --version | head -1))"
    return
  fi
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -y >/dev/null
    sudo apt-get install -y zsh
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y zsh
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y zsh
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --noconfirm zsh
  else
    err "no supported package manager (apt/dnf/yum/pacman) — install zsh manually and rerun"
  fi
  ok "zsh installed ($(zsh --version | head -1))"
}
install_zsh_pkg

# oh-my-zsh — unattended so it doesn't chsh or exec zsh on us
if [[ -d "$HOME/.oh-my-zsh" ]]; then
  ok "oh-my-zsh already present ($HOME/.oh-my-zsh)"
else
  RUNZSH=no CHSH=no \
    sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
  ok "oh-my-zsh installed"
fi

# Seed ~/.zshrc with our PATH block (idempotent via marker).
# oh-my-zsh writes a default ~/.zshrc; we append after it.
ZSHRC="$HOME/.zshrc"
ZSHRC_MARKER="# >>> 0_agents zsh PATH (managed) >>>"
if [[ -f "$ZSHRC" ]] && grep -qF "$ZSHRC_MARKER" "$ZSHRC"; then
  ok "~/.zshrc PATH block already present"
else
  cat >> "$ZSHRC" <<'EOF'

# >>> 0_agents zsh PATH (managed) >>>
# Bring nvm-installed node + globals (claude, codex), bun, and ~/.local/bin
# onto PATH so they work in zsh sessions just like bash.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
export BUN_INSTALL="$HOME/.bun"
export PATH="$HOME/.local/bin:$BUN_INSTALL/bin:$PATH"
# <<< 0_agents zsh PATH (managed) <<<
EOF
  ok "appended PATH block to $ZSHRC"
fi

# chsh to zsh (only if the user's login shell isn't already zsh)
ZSH_BIN="$(command -v zsh)"
CURRENT_SHELL="$(getent passwd "$(whoami)" 2>/dev/null | cut -d: -f7)"
if [[ "$CURRENT_SHELL" == "$ZSH_BIN" ]]; then
  ok "login shell already zsh"
else
  # /etc/shells must list the zsh binary or chsh refuses.
  if ! grep -qxF "$ZSH_BIN" /etc/shells 2>/dev/null; then
    echo "$ZSH_BIN" | sudo tee -a /etc/shells >/dev/null
  fi
  if sudo chsh -s "$ZSH_BIN" "$(whoami)"; then
    ok "login shell changed to $ZSH_BIN (effective on next login)"
  else
    warn "chsh failed — change manually: sudo chsh -s $ZSH_BIN $(whoami)"
  fi
fi

# ─── 12. Zsh completions ────────────────────────────────────────────────────
if [[ -x "$REPO_DIR/lib/install-completions.sh" ]]; then
  say "Installing zsh completions"
  bash "$REPO_DIR/lib/install-completions.sh"
fi

# ─── 13. Subscription logins (interactive) ─────────────────────────────────
if [[ "$DO_LOGINS" -eq 0 ]]; then
  warn "skipping subscription logins (--no-logins). Run manually:"
  echo "    claude auth login --claudeai"
  echo "    codex login --device-auth"
else
  say "Claude Code subscription login"
  if [[ -f "$HOME/.claude/.credentials.json" ]]; then
    ok "claude-code already authenticated ($HOME/.claude/.credentials.json present)"
  else
    # 'claude auth login' does OAuth and persists to ~/.claude/.credentials.json.
    # 'claude setup-token' only PRINTS a token (the user has to set it as
    # ANTHROPIC_API_KEY themselves) — that's why fresh boxes were re-prompting
    # for login on every claude invocation when we used setup-token.
    #
    # The OAuth callback hits localhost:<port>. Over SSH from a Mac, open the
    # tunnel first:    ssh -L 54545:localhost:54545 user@host
    # (port is printed by claude during the flow; mirror it on -L).
    echo "  Running 'claude auth login --claudeai' — open the printed URL,"
    echo "  sign in. Over SSH you need 'ssh -L <port>:localhost:<port>' first."
    claude auth login --claudeai \
      || warn "claude auth login failed; retry: claude auth login --claudeai"
  fi

  say "Codex subscription login"
  if [[ -f "$HOME/.codex/auth.json" ]]; then
    ok "codex already authenticated ($HOME/.codex/auth.json present)"
  else
    # --device-auth: prints a code + URL to open on any device.
    # The default flow opens a localhost callback, which is broken on headless
    # boxes and behind SSH without a tunnel.
    codex login --device-auth \
      || warn "codex login exited non-zero — retry with 'codex login --device-auth'"
  fi
fi

# ─── 14. Zellij session label ──────────────────────────────────────────────
if command -v agent-session-name >/dev/null 2>&1; then
  say "Naming terminal session"
  agent-session-name "${AGENT_SESSION_NAME:-$(whoami)}" || true
fi

# ─── Summary ────────────────────────────────────────────────────────────────
say "Done."
cat <<EOF
  Repo            : $REPO_DIR @ $(cd "$REPO_DIR" && git rev-parse --short HEAD)
  Node            : $(node --version)
  Bun             : $(bun --version)
  cloudflared     : $(cloudflared --version 2>&1 | head -1 | awk '{print $3}')
  claude-code     : $(claude --version 2>/dev/null | head -1)
  codex           : $(codex --version 2>/dev/null | head -1)

  Symlinks installed:
    ~/.claude/{CLAUDE.md, agents, skills, lang}
    ~/.claude/settings.json     (server-side wide-permission profile)
    ~/.codex/{skills/*, agents, lang}
    ~/.codex/config.toml        (server-side workspace-write profile)
    ~/.config/zellij/config.kdl (defaults + Russian-layout mirror binds)
    ~/.local/bin/{markdown-view, frogmouth-tuned, agent-session-name, plan-view}

  Next steps:
    - Re-login (or run 'exec zsh') so the new login shell takes effect.
      The current session is still bash — chsh only applies on next login.
    - If this host is meant to run Cyrus: bash $REPO_DIR/lib/setup-cyrus.sh
    - To re-apply latest 0_agents changes anytime: bash $REPO_DIR/update.sh
    - To edit code from terminal: nvim (LazyVim is configured)
EOF
