# Code-production stack

This directory is the private, reusable development system for every project:

- `laws/` defines the Git, plan, TDD, PR, timing and review contract;
- `runtime/` contains the canonical plan writer and gates;
- `templates/` contains the managed Git hooks and GitHub workflow;
- `agent-stack.ts` installs and verifies the managed project snapshot;
- global skills teach agents when to call the deterministic runtime.

There is one project seam: `package.json`. Every repository implements the
same command names, while the central hooks and CI decide *when* they run.
Framework paths and tool choices never leak into the central process.

## Consumer contract

```json
{
  "scripts": {
    "agent:install": "bun install --frozen-lockfile",
    "agent:test:backend": "cd backend && bun test",
    "agent:test:frontend": "cd frontend && bun test",
    "agent:test:e2e": "cd test-e2e && bun test",
    "agent:verify:commit": "bun run lint:changed && bun run test:changed",
    "agent:verify:pr": "bun run check",
    "agent:verify:docs": "bun run docs:check"
  }
}
```

An absent lane still has a deliberate script, for example:

```json
"agent:test:e2e": "bun -e \"console.log('N/A: this repository has no E2E lane')\""
```

That declaration is visible and reviewable. The central stack never guesses a
fallback command.

## Cadence

| Boundary | Central action | Project action |
|---|---|---|
| Task RED/GREEN | `planctl start-task` / `complete-task` | one named `agent:test:*` command with exact test arguments |
| Stage commit | plan freeze + mutation-journal check | `agent:verify:docs`, then `agent:verify:commit` |
| Delivery push / PR | plan gate | `agent:verify:pr` once |
| GitHub PR head | same gates on published SHA | `agent:verify:docs`; full `agent:verify:pr` only when PR is ready |
| Final review | reuse the exact PR-head receipts | no unchanged suite rerun |

One PR Delivery may contain several Stage commits. Independent Stages may be
delegated in parallel; Deliveries are published sequentially by default.

## Install in a repository

First add the seven scripts above to the repository's `package.json`, then:

```bash
agent-stack install /path/to/repository
agent-stack check /path/to/repository
```

The installer vendors the small deterministic runtime, installs managed hooks
and a GitHub workflow, and selects `.githooks` for the current worktree only.
It refuses to overwrite an unmanaged hook or workflow.
