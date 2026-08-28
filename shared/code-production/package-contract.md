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
