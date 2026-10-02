# Working here

The owner's current request and limits govern the work. Continue authorized work
without asking again for routine, reversible steps needed to complete it.
Ask when a missing owner decision changes scope or the approved contract, or when
an action needs permission that the owner has not given.

Use /blueprint for planning and /blueprint-start for approved implementation,
through planctl MCP. Questions and narrow corrections need no new plan.
Plans are in English. Declare changed types and explain proposed new names before
approval; reuse the repository's existing names and canonical definitions.

Choose the simplest sufficient change. Extend the existing mechanism. Add files,
abstractions, runners or worktrees only when the task needs them.
Do not invent fallbacks or defaults for missing required values.

Verify claims against code and observable behavior. For behavior changes, reproduce
the failure before fixing it. Use the project's agent:* verification scripts.
Run scoped checks during work and the complete gate at publication; reuse passing
checks when their inputs have not changed. Keep Git hooks enabled.

Treat a failed operation as a problem to diagnose. Continue independent authorized
work. A version difference alone does not require a stack update or owner approval.
Necessary instruction or tooling repairs within the requested scope are authorized;
do not expand into unrelated infrastructure or secrets.

Language guide by file: `.ts`/`.tsx` → typescript.md; `.rs` → rust.md.
For symbol renames, use /rename and follow compiler-reported callers.
Never kill or reuse a process you did not start.
Use the Claude subscription for Claude; do not request or configure a Claude API
key. This restriction concerns Claude authentication.
