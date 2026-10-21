## The Goal

Fast development, a readable plan and autonomous execution.

## The target

Use Blueprint and planctl only when the owner explicitly requests this workflow.

1. **Discuss.** Work through the intended behavior in small steps. Research and try examples before writing the complete SPEC.
2. **Check and approve the SPEC.** Describe the Goal and each flow, with its interfaces and a concrete example beside it. Reuse the dictionary and existing types. Planctl checks the structure, names and contracts; Jev gives focused feedback on meaning and unnecessary additions. The agent corrects findings, then shows the complete SPEC for approval.
3. **Break it into Tasks.** Group Tasks into Stages, with dependencies and checks. **One Stage ends in one PR.** Approve this breakdown once; execution then proceeds autonomously.
4. **Implement locally.** For each Task, run only checks covering its changes and affected consumers. Reuse unchanged passing results. Keep intermediate commits local; do not push every correction or run the full suite after every Task.
5. **Finish the Stage and publish.** Complete its Tasks, run the full local test gate, perform the agreed review and fix findings. Recheck affected work, publish the PR, observe CI and return the link. The owner merges.

### Checks belong to planctl

- **Document:** each flow carries its own interfaces; shared types use references. Diagrams must render and remain readable. Ordinary notes do not acquire a plan format.
- **Vocabulary and contracts:** no unapproved new concepts or contract changes after SPEC approval. Local helpers and implementation choices remain the agent's responsibility.
- **Actual diff:** hooks and MCP inspect Git changes themselves. Compare added, removed and changed declarations with the approved contracts, including fields and nullability; a type name appearing in the SPEC is insufficient.
- **Jev:** use a fixed rubric and reviewed good/bad examples. Check only relevant excerpts, cache unchanged inputs and bound cost. Its advice helps the agent correct itself; it cannot approve changes.

Incomplete drafts may be saved. The agent fixes routine findings without an owner question. Ask only for a material change to approved behavior, contracts or scope. No intermediate paid CI; no merge into protected branches without the owner's separate instruction.

This describes the agreed direction. These checks are not all implemented yet.
