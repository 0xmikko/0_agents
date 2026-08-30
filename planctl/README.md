# planctl distributed observer

`planctl` is the control surface for long-running coding plans. Its goal is a
robust, efficient vibecoding loop across multiple machines: keep each agent
focused on the approved Goal and Task, show evidence-backed delivery progress
and ETA, distinguish stale work from an offline host or an owner wait, and
notify the owner without uploading transcript content.

The observer is optional. Local `planctl focus`, `progress`, and execution
commands keep working when the server cannot be reached.

## Processes

| Process | Runs on | Responsibility |
|---|---|---|
| `planctl` | every agent worktree | Owns the approved plan lifecycle and gives agents a focused next action |
| `planctld` | every coding machine | Discovers worktrees and Codex/Claude JSONL sessions, computes local idle state, and queues privacy-safe snapshots |
| `planctl-server` | one central host | Authenticates machines, persists observations, computes progress/ETA and records attention transitions |
| Telegram module | central host | Serves `/progress`, `/agents`, `/stale`, `/waiting` and sends transition alerts |

Machine collectors use a durable singleton outbox. A server outage never
blocks plan execution; the latest observation is retried with a bounded timeout
and deterministic backoff. Server liveness uses receipt time, while agent idle
time is calculated on the source machine.

## Install dependencies

```bash
cd planctl
bun run agent:install
```

The repository wrappers in `bin/` run the TypeScript entrypoints with Bun.
`lib/install-bin.sh` links `planctl`, `planctld`, and `planctl-server` into
`~/.local/bin`.

## Configuration

Configuration is strict TOML. All paths are absolute. Secret values are stored
only in separate mode-`0600` files; TOML contains their paths. Initializers
refuse to overwrite existing files and leave every required value commented:

```bash
planctl config init --role server --path /home/planctl/.config/planctl/server.toml
planctl config init --role machine --path /home/marketing/.config/planctl/machine.toml
```

### Central server

```toml
version = 1
bind = "127.0.0.1:4789"
external_url = "https://planctl.example.ts.net"
database = "/home/planctl/.local/state/planctl/server.sqlite"
machine_offline_after_seconds = 60
history_retention_days = 90

[telegram]
bot_token_file = "/home/planctl/.config/planctl/telegram.token"
allowed_user_ids = [123456789]
default_chat_id = 123456789
long_poll_seconds = 30
claim_lease_seconds = 60
notifier_scan_milliseconds = 5000
```

Bind to loopback behind Tailscale Serve or an HTTPS reverse proxy. A
non-loopback plain-HTTP external URL is rejected. Telegram uses long polling;
unknown user IDs receive no plan data. Claim leases make failed alert sends
retryable across restarts; the notifier scan interval controls how quickly
persisted transitions are delivered.

### Coding machine

```toml
version = 1
machine_id = "u3775"
repository_ids = { "/home/marketing/Coding/private-repo" = "private-repo" }

[server]
url = "https://planctl.example.ts.net"
token_file = "/home/marketing/.config/planctl/machine.token"
connect_timeout_ms = 1000
request_timeout_ms = 5000

[collector]
scan_seconds = 5
heartbeat_seconds = 15
stale_after_seconds = 900
session_lookback_days = 7
state_db = "/home/marketing/.local/state/planctl/machine.sqlite"
watch_roots = ["/home/marketing/Coding"]
codex_sessions = "/home/marketing/.codex/sessions"
claude_sessions = "/home/marketing/.claude/projects"
```

`watch_roots` bounds Git discovery. Session directories are explicit; there is
no hidden path search. `repository_ids` supplies stable identities only where a
normalized Git remote is unavailable. Machine IDs must be unique, heartbeat
must be shorter than the stale threshold, and repository paths must be within
one configured watch root.

Create each secret file before validation:

```bash
install -m 0600 /dev/null /home/planctl/.config/planctl/telegram.token
install -m 0600 /dev/null /home/marketing/.config/planctl/machine.token
```

Then validate without starting a service:

```bash
planctl config check --role server --path /home/planctl/.config/planctl/server.toml
planctl config check --role machine --path /home/marketing/.config/planctl/machine.toml
```

## Enroll a machine

The central store keeps only a derived credential. The raw token is printed
once and must be copied into that machine's configured token file:

```bash
planctl-server machine create u3775 --config /home/planctl/.config/planctl/server.toml
chmod 0600 /home/marketing/.config/planctl/machine.token
```

Do not place enrollment tokens in TOML, command history, plan files, Telegram,
or session fixtures.

## Install or update a role

The setup helper validates first. Invalid configuration creates no binary
links, unit files, or service state. A valid rerun refreshes links and the
systemd-user unit without modifying configuration:

```bash
bash lib/setup-planctl.sh --role server --config /home/planctl/.config/planctl/server.toml
bash lib/setup-planctl.sh --role machine --config /home/marketing/.config/planctl/machine.toml
```

The host entrypoints can perform the same explicit setup:

```bash
bash install-server-linux.sh --planctl-role=machine --planctl-config=/home/marketing/.config/planctl/machine.toml
bash update.sh --planctl-role server --planctl-config /home/planctl/.config/planctl/server.toml
```

Inspect or restart a role with normal user-service commands:

```bash
systemctl --user status planctld.service
systemctl --user status planctl-server.service
systemctl --user restart planctld.service
systemctl --user restart planctl-server.service
journalctl --user -u planctld.service -f
```

Enable user lingering on unattended Linux hosts so services survive logout.

## Agent and owner commands

Inside an approved plan worktree:

```bash
planctl start-task docs/plans/example.md --task EXAMPLE_001 --agent codex:session-id --config /absolute/machine.toml
planctl focus docs/plans/example.md
planctl progress docs/plans/example.md
planctl progress docs/plans/example.md --server --config /absolute/machine.toml
planctl needs-owner docs/plans/example.md --task EXAMPLE_001 --reason "Approve the production hostname"
planctl resume-task docs/plans/example.md --task EXAMPLE_001
```

`start-task` emits a distributed TaskRunV2 when a validated machine config and
an explicit `--agent` identity are present. Codex/Claude session environment
identity is used automatically when available. Without telemetry identity or
machine configuration, the existing TaskRunV1 local execution path remains
available and server unavailability never blocks the Task.

Observer progress reads authenticate with the configured machine ID and its
enrollment bearer token. Telegram reads the same internal progress service
without exposing an unauthenticated HTTP route.

Telegram owner commands are `/progress`, `/progress <plan>`, `/agents`,
`/stale`, and `/waiting`. Alerts are emitted once for stale, owner-wait,
machine-offline, and recovery transitions. Messages use structured plan,
machine, task, timing, and owner-wait fields only—never transcript excerpts.
`/waiting` calculates duration from the structured owner-wait start time.
Completed Stage Result timing is carried as stable, idempotent samples so the
server can calibrate forecasts from actual deliveries.

## Verification and scale baseline

```bash
cd planctl
bun run agent:verify:pr
bun run bench/distributed-benchmark.ts
```

The deterministic certificate fixes cardinality at 100 machines and 1,000
agents. Host timings are reported as an optimization baseline, never used as
flaky pass/fail thresholds.
