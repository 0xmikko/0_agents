# 0_agents — Onboarding & Operations

Single source of truth for setting up an agent host (Mac client or Linux server) and keeping it current. Replaces the per-script README skim — read this top-to-bottom once, then come back as needed.

## TL;DR

| Scenario | Command |
|---|---|
| **Fresh Mac client** | `bash ~/Coding/0_agents/install-client-mac.sh` |
| **Bare Linux server** (no Cyrus) | `bash ~/Coding/0_agents/install-server-linux.sh` |
| **Linux server hosting Cyrus** | `bash install-server-linux.sh && bash lib/setup-cyrus.sh` |
| **Create new agent user** (as root) | `sudo bash ~/Coding/0_agents/lib/create-agent-user.sh <username>` |
| **Existing host — just sync latest** | `bash ~/Coding/0_agents/update.sh` |

Three top-level entry points; every other installer is a helper inside `lib/`.

All scripts are **idempotent**: re-runs detect what's already in place and only update what's missing or out of date. Running `update.sh` weekly is the maintenance cadence.

---

## What 0_agents provides

A repo of opinionated configs and helpers for two coding agents — **Claude Code** and **Codex** — plus the supporting tooling we use daily:

```
0_agents/
├── claude/                         # Claude Code config (CLAUDE.md, agents, skills)
│   └── skills/                     # User-invocable slash commands (/spec, /plan, ...)
├── codex/                          # Codex config (skills, rules, agents, config.toml)
├── shared/                         # Skills + lang docs reachable from BOTH tools
│   └── skills/                     # bug, completion-note, dictate, fast-precommit,
│                                   # markdown-view, quick-fix, start-work, test-protocol
├── server/                         # Server-only profiles (wide-permission settings)
│   ├── claude/settings.json        # SOURCE OF TRUTH for server-side Claude permissions
│   └── codex/config.toml           # Codex workspace-write profile
├── bin/                            # Helper CLIs installed into ~/.local/bin
│   ├── markdown-view               # Open .md in Zellij pane (frogmouth → glow → less)
│   ├── frogmouth-tuned             # Frogmouth wrapper with sane theming
│   └── agent-session-name          # Set Zellij session label
├── install-client-mac.sh           # Top-level entry: bootstrap a Mac client
├── install-server-linux.sh         # Top-level entry: bootstrap a Linux server
├── update.sh                       # Top-level entry: re-sync after `git pull`
└── lib/                            # All helpers — called by the three entries above
    ├── install.sh                  # Symlinks claude/, codex/, shared/ into ~/.claude/+~/.codex/
    ├── install-bin.sh              # ~/.local/bin/{markdown-view, frogmouth-tuned, ...}
    ├── install-codex-config.sh     # Render codex/config.toml.template
    ├── install-runtimes.sh         # claude (native installer) + codex (npm)
    ├── install-linear-mcp.sh       # Register Linear MCP for both tools
    ├── install-lazyvim.sh          # Neovim ≥ 0.11 + LazyVim starter
    ├── install-completions.sh      # zsh completions for zellij/gh/codex/bun/...
    ├── setup-cyrus.sh              # Cyrus orchestrator (Linux only, opt-in)
    ├── setup-mdurl.sh              # mdurl markdown server (sudo, opt-in)
    ├── create-agent-user.sh        # Add a new agent user (sudo, opt-in)
    ├── doctor.sh                   # Read-only diagnostics — never changes anything
    ├── macos_hotkey.sh             # Hammerspoon Cmd-Shift-3 → upload to u3775
    └── screenshot-upload.sh        # Used by the hotkey above
```

---

## Pre-requisites you bring yourself

These are intentionally NOT automated — you do them once per machine, then 0_agents takes over.

| Need | Mac | Linux |
|---|---|---|
| `bash`, `curl`, `git`, `ssh` | ✅ ships with macOS | most distros — `apt install -y` if missing |
| Homebrew | https://brew.sh | n/a |
| GitHub SSH key | `ssh-keygen -t ed25519` → paste pubkey at https://github.com/settings/keys |
| Linear OAuth (browser) | one-time per machine in `claude` and `codex` CLIs |

For a server you're going to run **as a different user** (e.g. `vibe`, `marketing`):

```bash
sudo adduser vibe
sudo loginctl enable-linger vibe        # systemd --user persists at logout
sudo -iu vibe                           # become the user, then proceed
```

### Setting up multiple agent users for parallel work

When you need multiple independent agent users working in parallel (e.g., for different projects or workstreams), use the helper script (recommended) or create users manually.

**Option A: Using the helper script (recommended):**

```bash
# As root, run the script for each user
cd ~/Coding/0_agents
sudo bash lib/create-agent-user.sh <username1>
sudo bash lib/create-agent-user.sh <username2>
```

The script creates the user, enables systemd linger, and prints next steps.

**Option B: Manual creation:**

```bash
# As root, create each user
sudo adduser <username1>
sudo adduser <username2>

# Enable systemd --user services to persist after logout
sudo loginctl enable-linger <username1>
sudo loginctl enable-linger <username2>

# Optional: Add to sudo group if needed (only if the user needs elevated privileges)
# sudo usermod -aG sudo <username1>
# sudo usermod -aG sudo <username2>
```

Then, for **each user**, become that user and run the full setup:

```bash
# Setup for first user
sudo -iu <username1>
ssh-keygen -t ed25519 -C "<username1>@$(hostname)"
# → Add the pubkey to https://github.com/settings/keys
git clone git@github.com:dltxperts/0_agents.git ~/Coding/0_agents
bash ~/Coding/0_agents/install-server-linux.sh
# Optionally: bash ~/Coding/0_agents/lib/setup-cyrus.sh
exit

# Repeat for other users
sudo -iu <username2>
ssh-keygen -t ed25519 -C "<username2>@$(hostname)"
# → Add the pubkey to https://github.com/settings/keys
git clone git@github.com:dltxperts/0_agents.git ~/Coding/0_agents
bash ~/Coding/0_agents/install-server-linux.sh
# Optionally: bash ~/Coding/0_agents/lib/setup-cyrus.sh
exit
```

Each user will have:
- Independent `~/.claude/` and `~/.codex/` configurations
- Isolated worktrees (if running Cyrus)
- Separate systemd --user services
- Own Linear OAuth tokens and credentials

This allows multiple agent sessions to run in parallel without conflicts.

---

## Scenarios

### A. Fresh Mac client

```bash
git clone git@github.com:dltxperts/0_agents.git ~/Coding/0_agents
bash ~/Coding/0_agents/install-client-mac.sh
```

`install-client-mac.sh` runs (in order, every step idempotent; all helpers in `lib/`):
1. **lib/install.sh** — symlink `claude/` + `codex/` + `shared/` into `~/.claude/` and `~/.codex/`
2. **lib/install-bin.sh** — install `markdown-view`, `frogmouth-tuned`, `agent-session-name` into `~/.local/bin/`
3. **lib/install-codex-config.sh** — render `codex/config.toml.template` → `~/.codex/config.toml`
4. **lib/install-runtimes.sh** — claude via Anthropic's native installer (`curl -fsSL https://claude.ai/install.sh | bash`; no Node needed) + codex via `npm install -g @openai/codex` (installs Node via brew if missing)
5. **lib/install-linear-mcp.sh** — register Linear MCP for both Codex and Claude
6. **lib/install-lazyvim.sh** — Neovim ≥ 0.11 (via brew) + LazyVim starter at `~/.config/nvim`
7. **lib/macos_hotkey.sh** — Hammerspoon + Cmd-Shift-3 → `lib/screenshot-upload.sh` → u3775
8. **Subscription logins** — `claude setup-token`, `codex login` (interactive; on Mac the default browser flow works)

After it finishes, do these manually:
- `brew install --cask tailscale` then log in to Tailscale
- Grant Hammerspoon **Accessibility** access in System Settings → Privacy & Security → Accessibility (if Cmd-Shift-3 doesn't fire)

`~/.claude/settings.json` is **not** installed on Mac — the Mac uses its own personal settings (the wide-permission profile is server-only, see `server/claude/settings.json`).

### B. Bare Linux server (no Cyrus)

Use this for any agent host where you want Claude + Codex tooling but not the full Cyrus orchestrator (e.g. a personal dev VM).

```bash
git clone git@github.com:dltxperts/0_agents.git ~/Coding/0_agents
bash ~/Coding/0_agents/install-server-linux.sh
```

`install-server-linux.sh` does, in order (all helpers in `lib/`):
1. Sanity (must run as user, not root; bash/curl/git/ssh/sudo present)
2. **GitHub CLI** — install `gh`, `gh auth login` (first run is interactive — paste a token or use the device-flow code), then `gh auth setup-git` so `git push` over HTTPS uses the gh token
3. **Node** via nvm (still needed for codex; claude no longer needs Node)
4. **Bun**
5. **cloudflared** (system tool — useful regardless of Cyrus)
6. **lib/install.sh --server** (claude+codex symlinks **+** server-side wide-permission `settings.json`)
7. **lib/install-bin.sh**
8. **lib/install-codex-config.sh**
9. **lib/install-runtimes.sh** (claude native binary + codex npm global)
10. **lib/install-linear-mcp.sh**
11. **lib/install-lazyvim.sh** (avoids old Ubuntu apt nvim — fetches GitHub stable tarball into `~/.local/share/nvim-prebuilt/` and symlinks `~/.local/bin/nvim`)
12. **zsh + oh-my-zsh** — installs zsh, oh-my-zsh (unattended), seeds `~/.zshrc` with the nvm/bun/`~/.local/bin` PATH block, `chsh` to zsh
13. Subscription logins (interactive — `claude setup-token`, `codex login --device-auth`)
14. Zellij session label

### C. Linux server hosting Cyrus

```bash
bash ~/Coding/0_agents/install-server-linux.sh   # see above
bash ~/Coding/0_agents/lib/setup-cyrus.sh        # adds Cyrus on top
```

`lib/setup-cyrus.sh` is intentionally narrow — it pre-flights that `install-server-linux.sh` already ran (node, bun, cloudflared, claude, codex must all exist) and STOPS otherwise. Then:
1. Install `cyrus-ai` npm CLI
2. `cloudflared tunnel login` (browser flow — once per Cloudflare zone)
3. Create `~/.cyrus/`
4. Cloudflare tunnel + DNS route + per-tunnel config file
5. Env file (Linear OAuth Application secrets — manual UI step at https://linear.app/settings/api/applications/new)
6. systemd `--user` units (`cyrus.service` + `cloudflared-<bot>.service`)
7. Start tunnel
8. `cyrus self-auth-linear` (browser flow)
9. `cyrus self-add-repo` (interactive — paste git SSH URL)
10. Per-repo runner config hint
11. Start Cyrus
12. Cleanup origin cert (`cert.pem`) — leaves running tunnel intact

After this, assigning a Linear issue to your bot user fires the webhook, and Cyrus spawns an agent session in `~/.cyrus/worktrees/<MAG-N>/`.

### D. Existing host — sync latest

After `git pull` on `0_agents`, or on a maintenance cadence:

```bash
bash ~/Coding/0_agents/update.sh                      # client mode
bash ~/Coding/0_agents/update.sh --server             # server mode (applies wide-permission settings)
```

`update.sh` does:
1. `git pull --ff-only` (aborts on diverged history; resolve manually)
2. `lib/install.sh` (with `--server` passthrough)
3. `lib/install-bin.sh`
4. `lib/install-codex-config.sh`
5. `lib/install-runtimes.sh` (runs `claude update` for the native binary; `npm install -g @openai/codex` for codex)
6. `lib/install-linear-mcp.sh` (idempotent re-register)
7. `lib/install-lazyvim.sh` (auto-detected if `~/.config/nvim/lua/config/lazy.lua` exists, or via `--with-lazyvim`)
8. `lib/install-completions.sh` (zsh completions)

Skip individual steps with `--skip <name>` (`git`, `install`, `bin`, `codex-config`, `runtimes`, `mdurl-skill`, `linear-mcp`, `lazyvim`, `completions`).

---

## Component installer reference

Each component installer can be called directly when you only need a slice.

| Script | Purpose | Idempotent? |
|---|---|---|
| `lib/install.sh` | symlinks `claude/`, `codex/`, `shared/` into `~/.claude/` + `~/.codex/`; registers Codex MCP in Claude. `--server` adds wide-permission `settings.json`. | ✅ |
| `lib/install-bin.sh` | `~/.local/bin/markdown-view` + `frogmouth-tuned` + `agent-session-name` (+ backward-compat `plan-view` symlink) | ✅ |
| `lib/install-codex-config.sh` | render `codex/config.toml.template` → `~/.codex/config.toml` (HOME substitution); `.bak.<ts>` if existing differs | ✅ |
| `lib/install-runtimes.sh` | claude via `curl -fsSL https://claude.ai/install.sh \| bash` (or `claude update` on rerun); codex via `npm install -g @openai/codex`. `--check` reports versions. `--skip-claude` / `--skip-codex` narrow scope. | ✅ (upgrade) |
| `lib/install-linear-mcp.sh` | register Linear MCP for both Codex and Claude. Codex login is interactive on local sessions; SSH prints `ssh -L` instructions. | ✅ |
| `lib/install-lazyvim.sh` | Neovim ≥ 0.11 (or fetches GitHub stable on Linux) + LazyVim starter. `--no-nvim` keeps your nvim. `--force` reinstalls LazyVim. | ✅ |
| `lib/install-completions.sh` | zsh completion files in `~/.zsh/completions/` for `zellij`, `gh`, `codex`, `bun`, `rg`, `docker`, `kubectl`, `helm`, `cargo`, `rustup`; wires `fpath` block into `~/.zshrc`. | ✅ |

---

## Skills layout (Claude + Codex)

Skills are user-invocable slash commands like `/spec`, `/plan`, `/dispatch-to-linear`. They live in three places:

- **`shared/skills/<name>/SKILL.md`** — canonical for skills both tools should see. `claude/skills/<name>` and `codex/skills/<name>` are symlinks to here.
- **`claude/skills/<name>/SKILL.md`** — Claude-only. Either Claude-specific behavior, or a copy that intentionally diverges from the Codex twin.
- **`codex/skills/<name>/SKILL.md`** — Codex-only.

When you change a skill, check both directories before assuming you're done. There are 5 deliberately-divergent pairs (`spec`, `plan`, `review-plan`, `review-implementation`, `verify-frontend`) — they share most of the body but reference `CLAUDE.md` vs `AGENTS.md` and use Codex via MCP vs directly. Future cleanup may merge them with parameter substitution; for now, sync manually.

Notable skills:
- **`/mdurl`** (Claude + Codex) — publish Markdown and return a browser URL
- **`/markdown-view`** (Claude only) — open Markdown in a separate Zellij pane
- **`/start-work`** — implement an approved plan locally with worktree + TDD discipline
- **`/dispatch-to-linear`** + **`/execute-from-linear`** — handoff a plan to Cyrus's bot for autonomous implementation

---

## Verification

After install, run the diagnostics:

```bash
bash ~/Coding/0_agents/lib/doctor.sh           # client-mode checks
bash ~/Coding/0_agents/lib/doctor.sh --server  # also verify server profile + Cyrus
bash ~/Coding/0_agents/lib/doctor.sh --quiet   # only print failures
```

`lib/doctor.sh` is read-only — it never changes anything, just reports what's there. Exit code 0 = all green; 1 = soft fail (something drifted; the failure line tells you which `install-*.sh` to re-run). Useful after `update.sh` and any time something feels off.

Manual spot-checks if `doctor.sh` is unavailable:

```bash
claude --version                  # 2.x
codex --version                   # 0.12.x
markdown-view --help              # prints usage
claude mcp list                   # codex + linear should appear
codex mcp list                    # linear should appear
ls -la ~/.claude/skills           # symlinks into 0_agents
ls -la ~/.codex/skills            # mix of system + 0_agents symlinks

# server only
ls -la ~/.claude/settings.json    # → 0_agents/server/claude/settings.json
systemctl --user status cyrus     # if Cyrus is set up
nvim --version                    # 0.11.x
```

---

## Troubleshooting

### Push refused — `Permission to <repo>.git denied to <user>`
Your fine-grained PAT lacks write access to the repo. Add the repo to the PAT's Repository access list at https://github.com/settings/personal-access-tokens, then `git push` again. (Org-owned repos like `dltxperts/*` need explicit grant even if you own the personal `0xmikko/*` fork the redirect points at.)

### Push refused — workflow scope missing
GitHub blocks PAT pushes that touch `.github/workflows/` without `Workflows: Read and write` permission. Add it to the PAT and retry.

### `ssh-add -l` fails / `Could not open authentication agent`
Either start `ssh-agent` (`eval $(ssh-agent)`) or use `ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes` directly.

### LazyVim fails on Ubuntu — `module 'vim.fs' not found` or similar
The system nvim is too old. Either:
- Run `bash lib/install-lazyvim.sh` (it installs latest into `~/.local/bin/nvim`, sidesteps apt)
- Or `apt remove neovim` and let LazyVim manage it

### Codex OAuth callback hangs over SSH
Codex tries to bind 127.0.0.1:1455 on the server; your local SSH session needs to forward that port:
```bash
ssh -L 1455:localhost:1455 user@server
codex login    # opens URL, callback now reaches your laptop
```

### Cyrus tunnel "DNS route already exists"
Re-running `lib/setup-cyrus.sh` is safe — the script detects the existing CNAME and reuses it. If the assertion fails because the CNAME points somewhere else, fix it manually in Cloudflare and re-run.

---

## Update cadence

- **After every `git pull` on this repo** → `bash update.sh`
- **After a CLI publishes a new version** (claude or codex) → `bash lib/install-runtimes.sh`
- **After a fresh git clone on a new host** → `install-client-mac.sh` or `install-server-linux.sh`

The repo's own update cadence: small focused commits, one PR per logical change. CI is in `.github/workflows/` (just typecheck for now).

---

## Related repos

- **`dltxperts/content-os`** — content authoring + publishing pipeline; uses 0_agents skills heavily
- **`dltxperts/magnis-app`** — separate product workspace; also pulls 0_agents

Both are configured per-project via their own `.claude/settings.json` (allows narrower than server profile, but **never** overrides the deny block in `0_agents/server/claude/settings.json`).
