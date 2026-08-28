---
name: fast-precommit
description: Run the repository's standard changed-scope Stage gate. Use before a work commit; never substitute the full PR gate.
---

# Fast pre-commit

Run exactly:

```bash
bun run agent:verify:commit
```

The repository owns changed-path classification inside that script. Do not
duplicate framework paths or compose a second ad-hoc gate in the skill. If it
fails, fix the cause and rerun only the failed narrow command before invoking
the standard gate again.

The complete suite is `bun run agent:verify:pr`; it belongs to Delivery
publication, not every Stage.
