---
name: verify-app
description: Run the repository's complete PR publication gate through its portable package.json contract and report PASS/FAIL on the exact SHA.
---

# Verify app

Record `git rev-parse HEAD`, then run:

```bash
bun run agent:install
bun run agent:verify:docs
bun run agent:verify:pr
```

Report each command and the exact SHA. If the SHA remains unchanged, final
review reuses this receipt and CI's receipt instead of rerunning the suite. If
the SHA changes, the receipt is stale and the complete gate runs once again.
