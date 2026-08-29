# `package.json` code-production API

These seven scripts are mandatory. Their names and lifecycle meaning are
stable; their implementation belongs to the consumer repository.

| Script | Meaning |
|---|---|
| `agent:install` | Refresh the exact workspace dependencies after a merge and in CI. |
| `agent:test:backend` | Run a backend test target supplied after `--`. |
| `agent:test:frontend` | Run a frontend unit/component test target supplied after `--`. |
| `agent:test:e2e` | Run an isolated end-to-end target supplied after `--`. |
| `agent:verify:commit` | Fast, changed-scope verification bought for every Stage commit. |
| `agent:verify:pr` | Complete relevant product gate bought once at Delivery publication. |
| `agent:verify:docs` | Documentation and process verification. |

Rules:

1. A Task's `RED` field names one exact `agent:test:*` invocation, normally a
   file and optionally a test ID. It never names `agent:verify:pr`.
2. `agent:verify:commit` must not call `agent:verify:pr`.
3. `agent:verify:pr` is complete for the repository. It may classify changed
   paths internally, but it may not silently omit an applicable lane.
4. A missing lane is represented by an explicit successful `N/A` script with
   its reason in the command. A missing script is invalid.
5. Hooks and CI call only these names. They contain no framework paths, test
   runners or duplicated project policy.
6. Final review reuses the published-SHA gate result. It reruns a suite only
   when the reviewed SHA changed.

## Existing CI

The managed GitHub workflow is the default. A repository that already owns an
equivalent complete PR workflow opts out explicitly in `package.json`:

```json
{
  "agentStack": {
    "ci": "external",
    "ciWorkflow": ".github/workflows/ci.yml"
  }
}
```

The named workflow must already exist as a regular file. `ciWorkflow` without
`ci: external` is rejected instead of silently falling back to managed CI. In
this mode `agent-stack` installs the runtime and hooks but does not create
`.github/workflows/code-production.yml`.
It also refuses the opt-out when that managed workflow is still present, so a
repository cannot silently buy both complete gates. The external workflow owns
published-SHA coverage; the local pre-push hook still calls
`agent:verify:pr` once and stores its exact-HEAD receipt.
