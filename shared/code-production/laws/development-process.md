# Development process

The owner's current request and limits govern the work. This document defines
the shared lifecycle; [plan-format.md](plan-format.md) defines the plan data.
Project instructions supply architecture, commands and Git destinations.

## Lifecycle

Ordinary research, documentation and implementation are interactive. Use
/blueprint and planctl only when the owner explicitly requests this workflow;
never propose or start it automatically, or ask the owner to select a mode.
For that selected workflow, use /blueprint-start for execution and /end-work
after the owner merges. Reuse the task's existing checkout; add a worktree only
when isolation is needed. A committed draft remains a draft.

In the explicitly selected workflow there are two planning approvals: the SPEC, then the concrete implementation
contract. There is no outline approval. Show the owner the published plan and
the decision to approve. Review rounds run only at the owner's request.

After approval, continue eligible work within that contract. Start each Task
through MCP, reproduce missing behavior, make the smallest sufficient change,
verify it, and create one work commit per Stage. Import the result through MCP
and close the Stage. Amend an approved contract only under the owner's word.
A Deviation records a shortfall; it does not authorize extra scope.

## Verification

Use the project's [agent:* commands](../package-contract.md). During work,
run existing tests of changed behavior and necessary targeted typechecks.
Aim for 20–60 seconds per work loop. Broad checks belong at major integration
or publication boundaries, not each work commit. After a failure, retry only
failed or affected checks. After completing the work, run the
complete local gate, then the requested final review. Fix real findings and
verify affected changes before the authorized implementation push; remote CI
checks the published commit afterward. A PR and green CI are not prerequisites
for review. Reuse passing checks whose inputs have not changed. Keep Git hooks
enabled. The owner merges.

Authorized publication includes the agent pushing the feature branch, creating
or updating its PR, observing CI and returning the link. Use planctl `progress`
or the Actions API for the exact published head; do not require the fine-grained
PAT to read the Checks API. Preserve observation failures instead of reporting
a logging command's success. Protected-branch merge, auto-merge and direct push
require a separate explicit owner instruction.

Record measured results and unavailable measurements honestly. Forecast active
work, dependency time and external waits separately; agent count alone does
not predict elapsed time. Delegate only when authorized and writes are disjoint.

## Failures and owner decisions

Diagnose a failed operation and continue independent authorized work. A version
difference alone proves neither incompatibility nor a need to update the stack.
Necessary instruction and tooling repairs within the requested scope are
authorized; inspect their actual changes and preserve other agents' work.

An additional caller, file, move of an unchanged type or bookkeeping correction
does not by itself change the approved outcome. Resolve it within the existing
authorization and record it accurately through MCP. A refusal by tooling is not
evidence that another owner decision is needed.

Use `needs_owner` only for a material change to agreed behavior, compatibility,
module responsibility or scope that the existing authorization does not cover,
then `resume_task` after the answer. Routine repairs and retries do not create
another approval. Sandbox permissions are enforced separately by the host;
an instruction cannot grant access to a protected path.

## Completion

Return the PR and plan URLs, verification evidence, deviations and unverified
gaps. Record actual time and usage when available; never invent them. Clean
only task-owned inactive temporary paths. After the owner merges, record a
short result and retro through /end-work. Do not add a review or approval
merely to close completed work.
