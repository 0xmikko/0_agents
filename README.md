# 0_agents

Configs and tooling for our coding agents — **Claude Code** and **Codex** — kept in one repo so every host runs the same baseline. Re-runs are safe (everything idempotent).

## TL;DR

| Scenario | Command |
|---|---|
| Fresh Mac client | `bash ~/Coding/0_agents/install-client-mac.sh` |
| Bare Linux server | `bash ~/Coding/0_agents/install-server-linux.sh` |
| Linux server hosting Cyrus | `bash install-server-linux.sh && bash lib/setup-cyrus.sh` |
| Sync existing host | `bash ~/Coding/0_agents/update.sh` |

Three top-level entry points; every other installer is a helper inside `lib/`.

---

## Features on Mac (`install-client-mac.sh`)

- [x] **`claude` CLI** installed via Anthropic's native installer (`curl -fsSL https://claude.ai/install.sh | bash`) — no Node.js dependency; `update.sh` runs `claude update`
- [x] **`codex` CLI** installed globally via npm (`@openai/codex`); `update.sh` upgrades it
- [x] **Shared agent skills** in both Claude and Codex — `bug`, `cleanup-worktrees`, `completion-note`, `dictate`, `fast-precommit`, `git`, `mdurl`, `quick-fix`, `start-work`, `startup-pressure-test`, `test-protocol`, `verify-app`
- [x] **Claude-only skills** — `dispatch-to-linear`, `execute-from-linear`, `plan`, `review-implementation`, `review-plan`, `spec`, `verify-frontend`
- [x] **Claude background agents** (subagents) — `coherence-cop`, `coverage-cop`, `simplicity-cop`
- [x] **Per-language guides** loaded on demand — `rust.md`, `typescript.md`
- [x] **Codex sandbox profile** — workspace-write; auto-discovers `.git` / `.worktrees` writable roots in `~/Coding`, `~/.cyrus/repos`, `~/.cyrus/worktrees`
- [x] **Linear MCP** registered for both Claude and Codex (search, comment, ship issues from agent)
- [x] **`mdurl <path>`** — the single markdown-viewing command: publish `.md` to the u3775 server, get a browser URL (dark theme, mermaid renders)
- [x] **`agent-session-name <name>`** — set Zellij session label
- [x] **Neovim ≥ 0.11 + LazyVim** starter at `~/.config/nvim`
- [x] **`Cmd-Shift-3` → screenshot uploaded to u3775 mdurl server** (via Hammerspoon)
- [x] **Zellij keybindings work on Russian (ЙЦУКЕН) layout** — every `Ctrl-P x` shortcut has a sibling on the matching Russian letter (`Ctrl-P ч`, etc.), so shortcuts keep working without switching keyboard layout
- [x] **zsh completions** for `zellij`, `gh`, `codex`, `bun`, `rg`, `docker`, `kubectl`, `helm`, `cargo`, `rustup` — auto-generated and wired into `~/.zshrc`
- [x] **Interactive subscription logins** — `claude auth login` (OAuth), `codex login` (browser flow)

Skips: `--no-runtimes`, `--no-lazyvim`, `--no-hotkey`, `--no-logins`.

Not installed by `install-client-mac.sh` — install yourself:
- Homebrew (https://brew.sh)
- Tailscale — `brew install --cask tailscale` then log in
- GitHub SSH key — `ssh-keygen -t ed25519` + paste pubkey to GitHub

---

## Features on Linux server (`install-server-linux.sh`)

**Everything from Mac above** (where applicable; no Hammerspoon hotkey) **plus:**

- [x] **Server-wide Claude permissions profile** — wide bash allowlist for ops tools, **plus explicit `.env*` deny rules** (Read/Edit/Write/cat/grep all blocked) so agents can't leak secrets
- [x] **`gh` CLI** installed + authenticated; `gh auth setup-git` wires HTTPS git push to use the gh token (no per-repo credential setup, works from any worktree)
- [x] **Node 20** via nvm — `claude-code` and `codex` npm globals work
- [x] **Bun**
- [x] **cloudflared** binary — Cyrus tunnels and dev tunnels
- [x] **LazyVim from prebuilt tarball** — Ubuntu's apt nvim is too old for LazyVim
- [x] **zsh + oh-my-zsh as login shell** — `chsh -s zsh`; `~/.zshrc` pre-seeded with nvm + bun + `~/.local/bin` PATH
- [x] **Codex device-auth login** — headless-friendly (prints code + URL, no localhost callback to forward over SSH)
- [x] **Zellij session named after the user** — multiple agent users on one host don't collide

Run **as the target user, not root**.

Skips: `--no-runtimes`, `--no-lazyvim`, `--no-logins`.

Not installed by `install-server-linux.sh` — separate one-shots (all in `lib/`):
- **mdurl** markdown publishing server: `sudo bash lib/setup-mdurl.sh`
- **Cyrus** orchestrator: `bash lib/setup-cyrus.sh`
- **Create new agent user** (root): `sudo bash lib/create-agent-user.sh <username>`

---

## Sync existing host (`update.sh`)

```bash
bash update.sh              # client mode
bash update.sh --server     # apply server-only wide-permission settings
```

Pulls latest, re-runs every component installer (idempotent — only changes what's missing or out of date). Runs `claude update` (native binary self-update) and `npm install -g @openai/codex`. On every run also installs/refreshes:

- [x] **`mdurl` shared skill** — `shared/skills/mdurl` linked into Claude and Codex skills (use `mdurl <path>` from any session to publish markdown to u3775 server)
- [x] **Refreshed zsh completions** — picks up new versions of `zellij`/`gh`/`codex`/etc. since last run

Skip individual steps with `--skip <name>` (repeatable). Names: `git, install, bin, codex-config, runtimes, mdurl-skill, linear-mcp, lazyvim, completions`.

---

For the long version — pre-requisites, multi-user setup, Cyrus bootstrap, troubleshooting, verification matrix — see **[ONBOARDING.md](ONBOARDING.md)**.
