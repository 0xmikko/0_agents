# 0_agents

Configs and tooling for our coding agents — **Claude Code** and **Codex** — kept in one repo so every host runs the same baseline. Re-runs are safe (everything idempotent).

## TL;DR

| Scenario | Command |
|---|---|
| Fresh Mac client | `bash ~/Coding/0_agents/install-client-mac.sh` |
| Bare Linux server | `bash ~/Coding/0_agents/install-server-linux.sh` |
| Linux server hosting Cyrus | `bash install-server-linux.sh && bash lib/setup-cyrus.sh` |
| Sync existing host | `bash ~/Coding/0_agents/update.sh` |
| Install planctl machine observer | `bash lib/setup-planctl.sh --role machine --config /absolute/machine.toml` |
| Install central planctl server | `bash lib/setup-planctl.sh --role server --config /absolute/server.toml` |

Three top-level entry points; every other installer is a helper inside `lib/`.

## Agent instructions

Claude and Codex share one screen (`claude/CLAUDE.md`, linked from
`codex/AGENTS.md`), two laws in `shared/code-production/laws`, and three
reviewers: coherence, coverage and simplicity. Language guides load by file
extension. Nothing selects a Task at session startup.

Nine shared skills remain: `blueprint`, `blueprint-start`, `end-work`, `bug`,
`rename`, `review-implementation`, `cleanup-worktrees`, `mdurl` and `dictate`.
Claude also has `nvim`; personal business skills stay separate.

- `bun run --cwd planctl agent:verify:docs` enforces the instruction audit:
  no dead references, vocabulary synonyms, language-routing mistakes or
  counted instruction set over 900 lines.
- `bun planctl/src/core/plan-gate.ts <plan.md> --lint` checks plan form.
- `bun planctl/src/core/plan-gate.ts <plan.md> --judge` reviews Goal, Stages,
  Names and Prose through `claude -p --model haiku` on the Claude subscription.
  The rubric lives in `shared/code-production/plan-judge.md` and is installed
  with each consumer gate. Claude receives only the SPEC, Stage descriptions
  and project vocabulary, with customizations and tools disabled.

The judge prints PASS or FAIL with a quote and correction for each rule.
Git-local verdicts are cached by SPEC and judged input, including the rubric;
changed Stages or vocabulary also invalidate them. There are no automatic
retries. A call has a 45-second limit. `approve-spec` runs lint and judge before
writing a lock: FAIL, malformed output, a missing CLI or a subscription limit
leaves the plan unchanged and returns an error. The owner still approves the
SPEC and Stages; the judge cannot grant that approval.

---

## Features on Mac (`install-client-mac.sh`)

- [x] **`claude` CLI** installed via Anthropic's native installer (`curl -fsSL https://claude.ai/install.sh | bash`) — no Node.js dependency; `update.sh` runs `claude update`
- [x] **`codex` CLI** installed globally via npm (`@openai/codex`); `update.sh` upgrades it
- [x] **Ten skills**, one text for Claude and Codex (`claude/skills` and `codex/skills` link into `shared/skills`) — the process: `blueprint`, `blueprint-start`, `end-work`, `bug`; the tools: `rename`, `review-implementation`, `cleanup-worktrees`, `mdurl`, `dictate`, `nvim` (Claude only)
- [x] **Claude background agents** (subagents) — `coherence-cop`, `coverage-cop`, `simplicity-cop`
- [x] **Per-language guides** loaded on demand — `rust.md`, `typescript.md`
- [x] **Portable code-production stack** — shared Git/PR/TDD laws, `planctl`,
  managed hooks/CI, timing receipts and one `package.json` command contract
- [x] **Optional distributed observer** — `planctld` collectors report
  privacy-safe agent/plan state to one NestJS server for progress, ETA,
  stale/offline/owner-wait distinctions and durable alerts; see
  [planctl/README.md](planctl/README.md) for explicit configuration
- [x] **Three production entrypoints** — `blueprint`, `blueprint-start`, and
  `end-work`; each is self-contained and does not chain auxiliary skills
- [x] **Codex sandbox profile** — workspace-write; auto-discovers `.git` / `.worktrees` writable roots in `~/Coding`, `~/.cyrus/repos`, `~/.cyrus/worktrees`
- [x] **Linear MCP** registered for both Claude and Codex (search, comment, ship issues from agent)
- [x] **`mdurl <path>`** — the single markdown-viewing command: publish `.md` to the u3775 server, get a browser URL (dark theme, mermaid renders)
- [x] **`agent-session-name <name>`** — set Zellij session label
- [x] **`agent-stack install <repo>`** — apply the same private production
  process to a TypeScript project without framework paths in hooks or skills
- [x] **Neovim ≥ 0.11 + LazyVim** starter at `~/.config/nvim`
- [x] **`Cmd-Shift-3` → screenshot uploaded to u3775 mdurl server** (via Hammerspoon)
- [x] **`Alt-Shift-3` → select an Omarchy region, upload it to u3775, copy the remote path, and notify** (via Hyprland)
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

**Everything from Mac above** (where applicable; Omarchy desktops use the Hyprland hotkey above) **plus:**

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

To configure an observer role during bootstrap, pass both explicit values:

```bash
bash install-server-linux.sh --planctl-role=machine --planctl-config=/absolute/machine.toml
```

Not installed by `install-server-linux.sh` — separate one-shots (all in `lib/`):
- **mdurl** markdown publishing server: `sudo bash lib/setup-mdurl.sh`
- **Cyrus** orchestrator: `bash lib/setup-cyrus.sh`
- **Create new agent user** (root): `sudo bash lib/create-agent-user.sh <username>`

---

## Sync existing host (`update.sh`)

```bash
bash update.sh              # client mode
bash update.sh --server     # apply server-only wide-permission settings
bash update.sh --planctl-role machine --planctl-config /absolute/machine.toml
```

Pulls latest, re-runs every component installer (idempotent — only changes what's missing or out of date). Runs `claude update` (native binary self-update) and `npm install -g @openai/codex`. On every run also installs/refreshes:

- [x] **`mdurl` shared skill** — `shared/skills/mdurl` linked into Claude and Codex skills (use `mdurl <path>` from any session to publish markdown to u3775 server)
- [x] **Refreshed zsh completions** — picks up new versions of `zellij`/`gh`/`codex`/etc. since last run

Skip individual steps with `--skip <name>` (repeatable). Names: `git, install, bin, codex-config, runtimes, mdurl-skill, linear-mcp, lazyvim, completions`.

---

For the long version — pre-requisites, multi-user setup, Cyrus bootstrap, troubleshooting, verification matrix — see **[ONBOARDING.md](ONBOARDING.md)**.
