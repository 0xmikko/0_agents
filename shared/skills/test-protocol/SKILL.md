---
name: test-protocol
description: Portable TypeScript/JavaScript TDD and traceability rules. Auto-use when writing or reviewing tests.
---

# Test protocol

Every non-trivial invariant maps to a deterministic behavior test.

## IDs

- Scenario: `scn_<domain>_<nnn>`
- Test: `tst_<layer>_<area>_<nnn>`
- Lowercase snake case; immutable; first stable token in the test name.

```typescript
it("tst_api_session_003 rejects a second active session", async () => { /* ... */ });
```

Near a non-trivial test, record:

```text
@test-id: tst_api_session_003
@scenario: scn_session_002
@covers: src/session/admission.ts::admitSession
@deterministic: yes
@fixtures: test/fixtures/two-active-sessions.json
```

## TDD receipt

1. Run `planctl start-task` and use the Task's exact
   `bun run agent:test:<backend|frontend|e2e> -- <target>` command.
2. Add the smallest behavior test. Observe it RED for the expected missing
   behavior, not syntax, environment or stale dependency failure.
3. Implement the minimum and rerun the same command GREEN.
4. Run the Stage's 1–3 named behavior files. The commit hook owns other fast
   checks; the Delivery boundary owns the complete PR gate.

A test that passes before the implementation does not prove the new invariant.
Rewrite it or explicitly show why the production code already satisfies the
requirement and amend the plan.

## Determinism

Automated suites may use real in-process services, temporary databases and
captured fixtures. They may not use live provider accounts, real OAuth, network
dependencies, unbounded wall-clock sleeps, unseeded randomness or writes
outside test-owned temp roots.

For a user-visible web change, typecheck/unit tests are supporting evidence.
The behavior receipt is an isolated browser journey through
`agent:test:e2e`.

Do not add permanent inventory/file-layout pin tests. A one-shot acceptance
command may prove a migration or absence; product behavior tests survive the
implementation layout.

Every discovered bug gets a regression test at the cheapest deterministic
layer before the fix. Do not close a bug from code inspection alone.
