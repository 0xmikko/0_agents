# Approval recovery incident

## Finding

The original MCP records showed that SPEC and implementation approval had succeeded. A later Git hook rejected creating an already approved plan. The agent then recreated the draft and lost the recorded state, after which the client blocked attempts to reproduce the approval through shell commands. These were distinct failures, not evidence that the owner had withheld approval.

## Correction

Preserve recorded approvals. Commit authorized MCP changes with normal hooks. Reconcile the journal against the committed plan automatically. Do not recreate an approved plan or ask the owner to repeat the same consent to repair bookkeeping. Client permission enforcement remains a separate host control.

The regression suite exercises approval, commit and continuation through installed hooks, plus conflicting and interrupted journal writes. The exact private session transcript and original incident notes remain in the local evaluation archive.

See [the current working trial](planctl-trial.md) for the implemented protocol and its verification.
