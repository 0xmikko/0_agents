---
name: verify-app
description: Run the repository's complete PR publication gate through its portable package.json contract and report PASS/FAIL on the exact SHA.
---

# Verify app

Record `git rev-parse HEAD`, then run:

```bash
bun run agent:install
.githooks/pre-push
```

The hook writes a Git-local receipt only after both verification commands pass.
The actual `git push` and final review reuse it while `HEAD` is unchanged; a
new commit invalidates it and buys the complete gate once again. Report the
commands and exact SHA. CI independently repeats the gate on the published SHA.
