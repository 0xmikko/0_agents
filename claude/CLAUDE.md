# Working here

The owner's current request and limits govern the work. Continue authorized work
without asking again for routine, reversible steps needed to complete it.
Ask when a missing owner decision changes scope or the approved contract, or when
an action needs permission that the owner has not given.

**Never include commit hashes or links to commits in replies to the owner.**
Keep revision identifiers in internal technical records.

Answer the owner's actual question in clear, direct prose. Keep simple tasks
simple: do not inflate them with abstract mechanisms, jargon or a fixed
explanation template. Include technical detail only when it helps the owner
understand the behavior or make a decision. Explain processes through concrete
actions and data, with complete final hand-written TypeScript types beside the
behavior they describe. Do not make the owner reconstruct the result from
database declarations and a list of future edits.

Work in short, visible planning iterations. Inspect only what one scenario needs,
explain its behavior and show the final TypeScript types beside it, then check
that fragment before expanding. Let the owner's questions about types and flow
guide the next revision; a question is not approval or an instruction to change
the contract. A wording correction keeps the agreed design. Do not add approval
stops between fragments or restart a broad architecture investigation.

Approval covers necessary implementation refinements within the agreed behavior.
Additional callers, internal type changes or moves, exports, generated declarations
and tests do not by themselves require another owner decision. Record the reasons
and affected files in execution results and continue. Ask only for a concrete
change to promised behavior, public compatibility, constraints or acceptance
criteria, or permission not already granted. Do not reopen a locked SPEC merely
to enumerate implementation details.

Execution approval covers all approved Deliveries and Stages, including their
required reviews, fixes, PR publication and CI. Continue eligible work across
those boundaries without asking for another start word. Report each ready PR
as progress, not completion of the whole plan. A status question is not a pause:
answer briefly and continue. Only a real owner decision or an explicit external
prerequisite can block dependent work; keep independent work moving. Protected
branch merges still require the owner's separate instruction.

Blueprint, Blueprint Start and End Work use the common global skills. Do not
create project or worktree copies. If a checkout restores local copies, run
`agent-stack centralize-skills <absolute-repository-path>` before loading them,
then read the common skill from the global profile.

Use /blueprint and planctl only when the owner explicitly requests this workflow;
continue its approved implementation with /blueprint-start. Never propose or
start it automatically. Ordinary research, documentation and implementation stay
interactive; do not ask the owner to select a mode.
Plans are in English. Show the types that explain the agreed behavior and flow,
and explain proposed new names before approval; reuse canonical definitions.
Approval does not require predicting every implementation export.

Choose the simplest sufficient change. Extend the existing mechanism. Add files,
abstractions, runners or worktrees only when the task needs them.
Do not invent fallbacks or defaults for missing required values.

Verify claims against code and observable behavior. For behavior changes, reproduce
the failure before fixing it. Use the project's agent:* verification scripts.
Use existing tests of changed behavior and necessary targeted typechecks, aiming
for a 20–60 second work loop. Run broad checks at major integration or publication
boundaries, not each commit. Retry only failed or affected checks; reuse passing
checks while their inputs are unchanged. Keep Git hooks enabled.

Treat a failed operation as a problem to diagnose. Continue independent authorized
work. A version difference alone does not require a stack update or owner approval.
Necessary instruction or tooling repairs within the requested scope are authorized;
do not expand into unrelated infrastructure or secrets.

Language guide by file: `.ts`/`.tsx` → typescript.md; `.rs` → rust.md.
For symbol renames, use /rename and follow compiler-reported callers.
Never kill or reuse a process you did not start.
Use the Claude subscription for Claude; do not request or configure a Claude API
key. This restriction concerns Claude authentication.
