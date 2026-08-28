---
name: test-protocol
description: Testing and traceability protocol. Canonical test ID format, scenario IDs, metadata blocks, traceability comments, determinism rules, bug-to-test rule. Auto-invokes when writing or reviewing tests.
user-invocable: true
disable-model-invocation: false
---

# Testing & Traceability Protocol

Every non-trivial invariant must map to a numbered test case. Tests and code must be bidirectionally traceable.

## Canonical Test IDs

Format: `tst_<layer>_<area>_<nnn>`

Examples:
- `tst_core_canon_001`
- `tst_kernel_sync_014`
- `tst_src_tg_023`
- `tst_fe_contacts_004`
- `tst_agent_pol_002`

Rules:
- Lowercase `snake_case`, immutable once assigned
- The canonical ID should be the **first stable token** in the test name
- Must be grep-friendly across Rust, TypeScript, Markdown, and scripts

### Rust naming

```rust
fn tst_kernel_sync_014_bootstrap_transitions_to_catchup() { ... }
```

### TypeScript naming

```typescript
it("tst_fe_detail_003 renders detail after list selection", ...)
```

## Scenario IDs

Format: `scn_<domain>_<nnn>`

- Scenarios describe **behavior**. Test IDs describe **implementation of coverage**.
- One scenario can map to many tests. One test covering many scenarios should be rare.

## Test Metadata

Every new non-trivial test must carry a metadata block near the definition:

```
@test-id: tst_src_tg_023
@scenario: scn_tg_sync_003
@covers: backend/src/services/sync/scheduler.rs::track_envelope_coverage
@deterministic: yes
@fixtures: tests/fixtures/telegram/bootstrap-three-chats.json
```

For Playwright / app-visible tests, also include:

```
@video-mode: showcase
@manual-flow: yes
```

## Code Traceability

Every non-trivial invariant branch or state-machine edge must link back to at least one test:

```
@tested-by: tst_src_tg_023
@invariant: coverage for each chat must remain independent across gaps
```

Annotate: state transitions, merge rules, routing rules, approval gates, sync loops, normalization logic.
Do NOT annotate: trivial getters, obvious formatting helpers.

## Determinism Rules

### Forbidden in automated suites
- Live Gmail, Telegram, or any real provider sessions
- Real OAuth flows or live internet calls
- Wall-clock timing without bounded harness
- Random data without fixed seeds
- Filesystem writes outside temporary test-owned paths

### Allowed in automated suites
- Real SQLite in temporary directories
- Real migrations
- Real in-process routers and service wiring
- Fake/scripted/fixture-backed source runtimes and agent engines
- Captured provider payload fixtures

### Manual class
Tests hitting live systems must be marked `manual`. Never used as main correctness signal.

## Bug-to-Test Rule

If a bug is found during user testing, QA, MCP walkthrough, or showcase:

1. A regression test MUST be added at the closest valid layer
2. Preferred order: unit/deterministic layer > app-visible scenario > backend layer
3. If bug spans layers: cheapest deterministic regression at root cause + app-visible scenario if the flow was broken
4. Do NOT close a bug as "fixed" on code inspection alone

## Test Infrastructure

### Clients (NOT mocks)
| Client | Layer | Purpose |
|--------|-------|---------|
| Playwright | Frontend E2E | Browser automation |
| WsRpcClient | Frontend/Backend E2E | WebSocket RPC |
| reqwest | Backend integration | HTTP requests |
| Direct calls | Backend unit | Rust function calls via TestCore |

### Mocks
| Mock | Replaces |
|------|----------|
| MockChatSource | Telegram API |
| MockMailSource | Gmail API (MailSurface) |
| MockSourceRuntime | Any generic source |
| MockAgentSidecar | Agent engine/API responses |

### Test comment format
```
Test environment: <which backend modules>
Clients: <Playwright | WsRpcClient | direct calls>
Mocks: <MockChatSource | MockAgentSidecar | none>
Data: <which fixtures/seeds>
```

## Testing Layers

`core`, `kernel`, `module`, `src_iso`, `src_int`, `fe_unit`, `fe_scn`, `agent_unit`, `agent_beh`, `agent_pol`, `eval_scn`, `eval_qual`, `cert`

See `docs/testing/layers.md` for exact meanings and allowed seams.

## Canonical References

- `docs/testing/policy.md` — full testing policy
- `docs/testing/e2e-standard.md` — E2E standard (Phase 1-3)
- `docs/backend/testing.md` — backend test seams, TestCore, harnesses
