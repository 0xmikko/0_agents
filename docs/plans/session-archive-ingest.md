# Archive agent sessions for project analysis

Status: SPEC_DRAFT
Spec lock: unlocked
Implementation lock: unlocked
Active Delivery: none
Unattended decisions: allowed

<!-- plan:spec:start -->
## The Goal

Give every opted-in coding machine a lossless, retry-safe path for archiving completed Claude, Codex and future provider sessions on the Planctl server, indexed by canonical GitHub project identity, so later analysis can use exact session evidence without scraping developer machines or mixing repositories. Success means a completed session is stored once per content revision despite retries, remains attributable to one authenticated machine and one GitHub repository, and never leaks raw payloads into telemetry, SQLite metadata, logs or Telegram.

## The target

### Owner-visible outcome

After archive upload is explicitly enabled on a machine, `planctld` discovers completed session revisions below its configured provider roots, resolves the session working directory to a Git worktree and canonical GitHub remote, spools an immutable gzip object, and uploads it in the background. The server authenticates the existing machine credential, verifies identity, declared limits and the uncompressed SHA-256, stores the object atomically, and records searchable project/session metadata in SQLite.

An interrupted or lost-ack upload is retried without creating another object or metadata row. If the same resumable session receives later work and reaches another terminal record, that changed content becomes a new immutable revision. Files with no supported terminal evidence, no GitHub project, malformed JSONL or excessive size remain local and surface a bounded machine health code; Planctl never guesses a project from a folder name.

### Scope decisions

- Archive content is the exact source JSONL compressed as deterministic gzip. This is an explicit raw-data opt-in because prompts, tool output and secrets may be present.
- The first server backend is its local filesystem plus the existing SQLite database. Filesystem objects are content-addressed; SQLite stores metadata and references only.
- Built-in discovery adapters cover Codex and Claude. The archive protocol and candidate interface accept validated provider identifiers so another provider can be added without changing the endpoint or persistence schema.
- Codex completion is evidenced by `event_msg.payload.type = task_complete`. Claude completion is evidenced by an assistant `message.stop_reason = end_turn`. A required settle interval lets provider bookkeeping lines finish before the revision is spooled.
- Upload and durable indexing are in this Delivery. Reading archives, analytics, semantic extraction, UI, Telegram archive commands, cloud object storage and automatic retention are later work.

### Configuration

Raw archiving is disabled unless the machine TOML contains a complete `[archive]` block:

```toml
[archive]
enabled = true
spool = "/absolute/private/planctl/archive-spool"
settle_seconds = 30
initial_lookback_days = 30
max_uncompressed_bytes = 67108864
```

The server requires its own storage boundary:

```toml
[archive]
root = "/absolute/private/planctl/session-archives"
max_compressed_bytes = 67108864
max_uncompressed_bytes = 67108864
```

All values are explicit and strictly decoded. Archive directories are mode `0700`, spool/object files are mode `0600`, and remote machine URLs must already satisfy the existing HTTPS-or-loopback rule. Disabling archive discovery does not disable ordinary snapshots or heartbeats.

### Upload contract

The provider-neutral route is:

```text
PUT /v1/machines/:machineId/session-archives/:provider/:sessionId/revisions/:sha256
Authorization: Bearer <existing machine credential>
Content-Type: application/gzip
Content-Length: <compressed bytes>
X-Planctl-Archive-Version: 1
X-Planctl-Project-Id: github.com/<owner>/<repository>
X-Planctl-Started-At: <ISO-8601>
X-Planctl-Ended-At: <ISO-8601>
X-Planctl-Uncompressed-Bytes: <bytes>
```

`:sha256` is the lowercase SHA-256 of the uncompressed JSONL. The server streams the body through bounded gunzip and hashing into an archive-root temporary file; it does not materialize the full session in memory. It rejects unsupported versions/providers, malformed IDs or timestamps, a URL/authenticated machine mismatch, non-GitHub project IDs, missing length, either size limit, invalid gzip and hash/length mismatches.

After validation, the object is atomically placed at a digest-derived path containing no machine-, project- or session-controlled path segment. SQLite maps `(machine_id, provider, session_id, sha256)` to project, start/end timestamps, byte counts, object digest and receipt time. An exact replay returns the same acknowledgement with `disposition = replayed`; the first commit returns `disposition = stored`. The same digest may be referenced by multiple metadata rows without duplicating object bytes.

### Machine flow

1. Reuse explicit Codex/Claude roots, JSONL tail reading and Git worktree discovery; provider adapters expose session identity, working directory, time range and terminal evidence without changing the observer snapshot payload.
2. Resolve `cwd` through the deepest discovered worktree and require canonical `github.com/owner/repository` identity from `remote.origin.url` or an explicit canonical repository mapping.
3. Once terminal evidence is older than `settle_seconds`, snapshot the whole file, enforce the local uncompressed limit, compute the raw digest and write deterministic gzip to the private spool.
4. Persist an archive outbox row before upload. Unlike the coalescing telemetry outbox, archive revisions are immutable and may not replace one another.
5. Upload one due item with the existing connect/request timeouts and deterministic bounded backoff. Verify the full acknowledgement before deleting its outbox row and spool object.
6. Preserve queued revisions across daemon restart and server outage. A file that changes after spooling can later produce another revision but cannot mutate the queued revision.

### Acceptance stories

1. Given a completed Codex JSONL inside a GitHub worktree, one collector scan after the settle boundary queues and uploads an exact gzip archive whose server metadata names the authenticated machine, provider, session and canonical GitHub project.
2. Given a completed Claude JSONL followed by normal stop-hook bookkeeping, the settled revision includes those final lines and is archived once.
3. Given a response lost after the server commits, the persisted machine outbox retries; the server reports `replayed`, object and metadata cardinality stay one, and the machine clears the item.
4. Given a completed session that later resumes and completes again, the second raw digest creates a second ordered revision under the same machine/provider/session identity.
5. Given an unlinked directory, non-GitHub remote, unsupported provider, running session, malformed/truncated tail, oversize payload, invalid gzip or digest mismatch, no archive row/object is committed and a bounded non-payload error is reported.
6. Given raw prompts containing a secret marker, that marker exists only inside the private spool/server object and never in snapshot JSON, SQLite metadata, logs, HTTP errors or Telegram messages.
7. Given archive upload disabled or unavailable, existing progress snapshots, stale detection, task execution and heartbeats continue unchanged.

### Invariants

- **ARC-001 — authenticated ownership:** every archive URL machine ID, bearer subject and stored machine ID are identical.
- **ARC-002 — exact project identity:** an archived revision has one validated canonical GitHub project; no path/name fallback exists.
- **ARC-003 — immutable content:** `(machine, provider, session, sha256)` identifies immutable raw bytes, and retries are idempotent.
- **ARC-004 — bounded streaming:** both compressed and uncompressed limits are enforced while streaming; the server never buffers the complete archive.
- **ARC-005 — durable offline delivery:** every spooled revision has a durable outbox row until a matching server acknowledgement arrives.
- **ARC-006 — privacy boundary:** raw session bytes enter only the private spool and archive object store, never telemetry, metadata, diagnostics or notifications.
- **ARC-007 — explicit completion:** only provider-supported terminal evidence plus the settle boundary creates a candidate; inactivity alone is not completion.
- **ARC-008 — observer independence:** archive failures degrade archive health but never block local Planctl commands or ordinary telemetry delivery.

### Success measures

- Deterministic integration coverage proves Codex, Claude, replay-after-lost-ack, resumed revision, rejection and privacy stories through the public collector/client/controller/store calls.
- Replaying the same revision 100 times leaves one metadata row and one content object.
- The configured maximum-size fixture is processed through bounded streams without a full-body archive buffer in application code.
- The complete `agent:verify:pr` gate passes once on the final local SHA; CI verifies the published SHA.

### Constraints and reuse

- Extend `MachineAuthGuard`, `ServerClient`, `MachineStore`, `ServerStore`, strict TOML decoding, JSONL readers and Git worktree identity. A second credential system, HTTP wrapper, SQLite layer or repository resolver is forbidden.
- Keep raw archives out of `MachineSnapshot`; the existing privacy-safe observer protocol remains small and bounded.
- Archive paths are derived only from trusted digests. Client-controlled IDs are metadata, never filesystem paths.
- PR #7 (`fix/planctl-env-secrets`) should merge before implementation; this Delivery extends the resulting ConfigModule-based runtime rather than reintroducing token files.
- This repository currently has no `staging` branch, so the plan worktree and draft PR use its sole integration branch, `main`.

### Non-goals

- Query/download APIs, dashboards, Telegram archive output or analysis jobs.
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
