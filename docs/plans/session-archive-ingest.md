# Archive agent sessions for project analysis

Status: SPEC_DRAFT
Spec lock: unlocked
Implementation lock: unlocked
Active Delivery: none
Unattended decisions: allowed

<!-- plan:spec:start -->
## The Goal

Continuously synchronize every discovered Claude, Codex and future provider session from opted-in coding machines to the Planctl server, indexed by canonical GitHub project identity, so the server always has a queryable latest version plus immutable history for later analysis. Success means an unchanged session produces no content read, spool object or network request; an appended session uploads only new complete JSONL bytes; retries never duplicate data; and raw payloads never leak into telemetry, SQLite metadata, logs or Telegram.

## The target

### Owner-visible outcome

After session synchronization is explicitly enabled, a separate scheduled `planctld` job scans every JSONL file below the configured Codex and Claude roots, including existing, active and completed sessions. It resolves each session working directory to a Git worktree and canonical GitHub remote, compares the file with durable per-source sync state, and skips it immediately when its filesystem version is unchanged.

When complete JSONL records were appended, the daemon spools only the new byte range as one or more deterministic gzip chunks and uploads them in the background. The server verifies authenticated machine identity, project/session metadata, contiguous offsets, limits and raw chunk hashes before atomically extending the session generation. Server metadata exposes the latest synchronized offset/state while preserving prior chunks and generations.

An interrupted or lost-ack upload is retried without creating another chunk. File truncation, replacement or mutation of the already acknowledged prefix never overwrites history: it starts a new generation at offset zero. Files with no GitHub project, malformed JSONL or unsupported metadata remain local and surface a bounded health code; Planctl never guesses a project from a folder name.

### Scope decisions

- Synchronize all session files under the explicit provider roots; completion is metadata, not an upload gate.
- Run synchronization on an explicit Nest scheduled interval inside `planctld`, not an operating-system cron entry, so configuration, health and shutdown remain in one daemon.
- Archive exact source JSONL bytes in append chunks compressed as deterministic gzip. This is an explicit raw-data opt-in because prompts, tool output and secrets may be present.
- The machine persists the last observed filesystem version and last server-acknowledged generation/offset. A matching `device + inode + size + mtime` is a no-op before content is opened or hashed.
- Built-in adapters cover Codex and Claude. The chunk protocol and source interface accept validated provider identifiers so another provider can be added without changing the endpoint or storage schema.
- The first server backend is its local filesystem plus the existing SQLite database. Chunk objects are content-addressed; SQLite stores manifests, offsets, metadata and references only.
- Upload, durable indexing, local server inspection and explicit raw export are in this Delivery. Analytics, semantic extraction, UI, Telegram archive commands, cloud object storage and automatic retention are later work.

### Configuration

Raw synchronization is disabled unless the machine TOML contains a complete `[archive]` block:

```toml
[archive]
enabled = true
spool = "/absolute/private/planctl/archive-spool"
sync_seconds = 60
max_chunk_uncompressed_bytes = 8388608
```

The first enabled scan includes every session file below the already explicit `collector.codex_sessions` and `collector.claude_sessions` roots; archive synchronization is not limited by telemetry `session_lookback_days`.

The server requires its own storage boundary:

```toml
[archive]
root = "/absolute/private/planctl/session-archives"
max_chunk_compressed_bytes = 8388608
max_chunk_uncompressed_bytes = 8388608
```

All values are explicit and strictly decoded. Archive directories are mode `0700`; spool, chunk and export files are mode `0600`. Remote machine URLs must already satisfy the existing HTTPS-or-loopback rule. Disabling synchronization does not disable ordinary snapshots or heartbeats.

### Version and change detection

`MachineStore` keeps one sync record per source path with provider/session identity, device, inode, last observed size/mtime, last complete JSONL offset, current generation, server-acknowledged offset, and a SHA-256 of the acknowledged raw prefix.

Each scheduled scan follows this order:

1. `stat` the source. If device, inode, size and mtime match the stored observation, return without opening the file, hashing, spooling or calling the server.
2. Read from the stored complete-record cursor and advance only through newline-terminated valid JSON objects. A partial final line is retained locally until a later scan completes it.
3. Revalidate the already acknowledged prefix when the filesystem version changed. If the inode changed, size shrank or prefix bytes no longer match, start the next generation; never amend acknowledged history.
4. If there are no new complete bytes, persist the new filesystem observation and skip upload.
5. Split new complete bytes on JSONL record boundaries without exceeding the configured raw chunk limit. Persist deterministic gzip spool objects and non-coalescing outbox rows before network I/O.
6. Upload due chunks in offset order. Delete a spool object/outbox row only after a matching server acknowledgement, then advance the durable acknowledged offset/prefix hash.

Codex `event_msg.payload.type = task_complete` and Claude assistant `message.stop_reason = end_turn` update the generation state to `complete`; any later appended record returns it to `active`. State changes ride the next raw chunk and do not create payload-free network writes.

### Chunk upload contract

The provider-neutral route is:

```text
PUT /v1/machines/:machineId/session-archives/:provider/:sessionId/generations/:generation/chunks/:startOffset/:endOffset/:sha256
Authorization: Bearer <existing machine credential>
Content-Type: application/gzip
Content-Length: <compressed bytes>
X-Planctl-Archive-Version: 1
X-Planctl-Project-Id: github.com/<owner>/<repository>
X-Planctl-Started-At: <ISO-8601>
X-Planctl-Observed-At: <ISO-8601>
X-Planctl-Session-State: active|complete
X-Planctl-Uncompressed-Bytes: <endOffset-startOffset>
```

`:sha256` is the lowercase SHA-256 of the uncompressed chunk. The server streams the body through bounded gunzip and hashing into an archive-root temporary file; it never materializes a complete chunk or session in memory. It rejects unsupported versions/providers, malformed IDs, offsets or timestamps, a URL/authenticated machine mismatch, non-GitHub project IDs, missing length, either size limit, invalid gzip and hash/length mismatches.

For a new generation, the first accepted `startOffset` is zero. Later chunks must start at the manifest's acknowledged end offset. An exact replay of an already committed offset range and digest returns the original acknowledgement with `disposition = replayed`; overlap, gaps, changed metadata or a different digest for a committed range return conflict. The first commit returns `disposition = stored` and the manifest's new latest offset/state.

After validation, a chunk is atomically placed at a digest-derived path containing no machine-, project- or session-controlled segment. SQLite maps a deterministic generation `archiveId` and ordered chunk rows to machine, project, provider/session, generation, state, time range, offsets, byte counts, digests and receipt times. Identical chunk bytes may be referenced by multiple manifests without duplicating objects.

### Server inspection flow

The server operator can inspect synchronized data without a second network authentication system:

```text
planctl-server archive list [--project <github-id>] [--provider <id>] [--machine <id>] [--state <active|complete>] [--limit <n>] [--json]
planctl-server archive inspect <archiveId> [--json]
planctl-server archive export <archiveId> --output </absolute/path.jsonl>
```

`list` returns newest-sync-first bounded generation rows. Its default text view includes archive ID, project, provider/session, machine, generation, state, latest offset, chunk count and last synchronization time. `inspect` shows one generation and its ordered chunk metadata. Both commands support stable JSON for scripts and never read or print raw session content.

`export` resolves ordered chunk objects from trusted metadata, streams gunzip while rechecking every raw chunk SHA-256, offsets and final byte count, and atomically creates a new mode-`0600` JSONL file at the required absolute output path. It refuses an existing destination, a missing object, a gap or any integrity mismatch. No unauthenticated or machine-authenticated HTTP read route is added in this Delivery.

### Acceptance stories

1. On the first enabled scan, existing active and completed Codex/Claude sessions inside GitHub worktrees are queued from offset zero and appear on the server with canonical project, state and latest byte offset.
2. On a later scheduled scan whose file device, inode, size and mtime are unchanged, the synchronizer performs no content open/hash/gzip, outbox write or HTTP request.
3. When an active session appends complete records plus a partial tail, only new complete bytes are uploaded; a later scan uploads the remainder after its newline arrives and advances the same generation.
4. Given a response lost after the server commits a chunk, the persisted outbox retries; the server reports `replayed`, chunk/object cardinality stays one, and the machine advances its acknowledged offset.
5. Given a source truncation, replacement or acknowledged-prefix mutation, the next upload starts a new generation at zero while the previous generation remains exportable.
6. Given terminal evidence and then later resumed activity, server state changes `active → complete → active` only alongside committed raw chunks and preserves their ordered history.
7. Given synchronized generations across projects and providers, the server operator can filter their metadata as text or JSON and export one generation to a private file whose reconstructed bytes exactly match the uploaded JSONL prefix.
8. Given an unlinked directory, non-GitHub remote, unsupported provider, malformed record, oversize chunk, invalid gzip, offset gap or digest mismatch, no invalid chunk/manifest update is committed and a bounded non-payload error is reported.
9. Given raw prompts containing a secret marker, that marker exists only inside private spool/chunk/export files and never in snapshot JSON, SQLite metadata, logs, HTTP errors or Telegram messages.
10. Given synchronization disabled or the archive server unavailable, existing progress snapshots, stale detection, task execution and heartbeats continue unchanged while queued archive chunks remain durable.

### Invariants

- **ARC-001 — authenticated ownership:** every archive URL machine ID, bearer subject and stored machine ID are identical.
- **ARC-002 — exact project identity:** each generation has one validated canonical GitHub project; no path/name fallback exists.
- **ARC-003 — monotonic generations:** chunks append contiguously within a generation; truncation or prefix mutation starts a new generation and never rewrites history.
- **ARC-004 — no-op unchanged state:** an unchanged filesystem version causes no content read, hash, spool write, outbox write or network request.
- **ARC-005 — bounded streaming:** compressed and uncompressed limits are enforced while streaming; neither side buffers a complete session.
- **ARC-006 — durable offline delivery:** every spooled chunk has a durable non-coalescing outbox row until a matching acknowledgement arrives.
- **ARC-007 — idempotent content:** `(machine, provider, session, generation, offsets, sha256)` identifies immutable bytes, and retries are exact replays.
- **ARC-008 — privacy boundary:** raw session bytes enter only private source/spool/chunk/export files, never telemetry, metadata, diagnostics or notifications.
- **ARC-009 — observer independence:** archive failures degrade archive health but never block local Planctl commands or ordinary telemetry delivery.
- **ARC-010 — explicit local reads:** metadata inspection is bounded and content-free; raw bytes leave object storage only through integrity-checked export to a new mode-`0600` file.

### Success measures

- Deterministic integration coverage proves initial sync, unchanged no-op, partial-tail append, Codex/Claude state, replay-after-lost-ack, generation reset, rejection, privacy and export through public scheduler/client/controller/store calls.
- A fixture of 1,000 unchanged tracked sessions performs zero content reads and zero upload requests during its no-op scan.
- Replaying the same chunk 100 times leaves one chunk row, one content object and one manifest offset transition.
- Maximum-size chunks are processed through bounded streams without a full-body archive/session buffer in application code.
- Text/JSON list and inspect output is stable and filtered; export reconstructs exact ordered bytes and refuses overwrite, gaps or corruption.
- The complete `agent:verify:pr` gate passes once on the final local SHA; CI verifies the published SHA.

### Constraints and reuse

- Extend `MachineAuthGuard`, `ServerClient`, `MachineStore`, `ServerStore`, strict TOML decoding, JSONL tail readers and Git worktree identity. A second credential system, HTTP wrapper, SQLite layer or repository resolver is forbidden.
- Use the existing Nest scheduler but keep archive synchronization separate from the coalescing telemetry collector/outbox so raw upload work cannot delay heartbeats.
- Keep raw bytes and archive cursor state out of `MachineSnapshot`; the privacy-safe observer protocol remains small and bounded.
- Archive paths are derived only from trusted digests. Client-controlled IDs are metadata, never filesystem paths.
- Extend the existing `planctl-server` command surface and `ServerStore` for local inspection; do not add a public read endpoint or second bearer-token family.
- PR #7 (`fix/planctl-env-secrets`) should merge before implementation; this Delivery extends the resulting ConfigModule runtime rather than reintroducing token files.
- This repository currently has no `staging` branch, so the plan worktree and draft PR use its sole integration branch, `main`.

### Non-goals

- Remote HTTP read/download APIs, dashboards, Telegram archive output or analysis jobs.
- Redaction, secret scanning or claiming raw archives are safe to share.
- S3-compatible storage, cross-server replication, encryption with a separate application key or automatic deletion/retention.
- Importing arbitrary user-supplied files outside configured provider roots.
- Implementing a third provider adapter in this Delivery.
<!-- plan:spec:end -->

<!-- plan:implementation:start -->
## Implementation contract
<!-- plan:implementation:end -->

<!-- plan:execution:start -->
## Execution log
<!-- plan:execution:end -->
