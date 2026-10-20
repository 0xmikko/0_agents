# Fast Development: Workflow and Three Best Ideas

**Goals: fast development, a clear experience for the owner, and autonomous execution of the agreed task.**

This document is a proposal for approval. It does not change settings, hooks, or other agents' work.

## Workflow

Steps 2–3 apply only when Blueprint/planctl is explicitly requested. During ordinary interactive work, the agent completes the agreed task without these formal approvals.

1. **Define the task.** The owner describes the result. The agent studies the code, names, and tests; discusses one flow at a time; and records decisions. Resolve product choices here. Blueprint and planctl require an explicit request; ordinary work remains interactive.

2. **Approve the plan: what must work.** **Goal** states the observable outcome. **Target** describes the finished system: its flows, data, module responsibilities, and error behavior. Follow the existing standard with readable diagrams, files, typed interfaces, and vocabulary. Reuse existing concepts and explain new ones. The owner approves the whole solution; agreement with one item does not approve the entire plan.

3. **Approve the stages: how to build and verify it.** Each stage delivers a small, complete result, with its change, assignee, dependencies, files, and sufficient checks. Identify major integration boundaries and publication in advance. The owner approves all stages together; individual stages do not require repeated approval.

4. **Agent work and commits.** Change → affected checks → autonomous correction. Aim for a **20–60 second** feedback cycle. Commit completed, verified work locally; one Stage ends in one PR and may contain several local commits. committing does not trigger a push. Keep hooks enabled. Parallel agents have non-overlapping edits; one agent owns integration and publication for the branch.

5. **Major stages and final verification.** At component boundaries, verify the entire changed flow. Before publication, run the complete agreed set of checks. Reuse passing results while their inputs remain unchanged. Repeat only failed or affected checks. Do not omit necessary verification to save seconds.

6. **Review, push, and CI.** Local verification → review if included in the task → fixes and affected checks → the agent publishes the PR and waits for CI. An agreed review needs no further permission. Intermediate commits stay local. Early plan publication, if agreed, does not run product CI. Finish with the link and result. Merging into `staging`/`main` requires a separate explicit instruction from the owner.

**When to return to the owner:** a material change to the agreed outcome, compatibility, module responsibilities, or scope. An additional file, consumer, technical correction, or tool failure does not by itself require approval. The agent corrects execution autonomously without bypassing access restrictions.

## Which Checks to Run and Why

| Change | Short checks during work |
|---|---|
| Document, plan, or instruction | Meaning, links, and relevant documentation checks; no product suites. |
| One backend service | Existing behavior tests for the service and affected consumers; necessary type checking. |
| Frontend component | Related tests, lint for changed files, and the existing incremental typecheck. For visible behavior, run the affected browser scenario. |
| Catalog module or source | Tests, types, and lint for the affected module or connector; not the entire catalog after every edit. |
| Shared interface, data schema, or protocol | Changed-contract checks for producers and consumers; broader integration checks at the agreed major boundary. |

A regression test reproduces the bug. Verify behavior: test counts and matching source text do not prove the result.

## Three Best Ideas to Preserve

1. **Existing selection of checks by change.** Backend test families, related frontend tests, and catalog module checks. A previous measurement of the verification script was **46 seconds instead of 559 seconds**. Preserve the mechanism and fix specific unnecessary runs.

2. **A clear Target before autonomous execution.** Preserve the Blueprint standard and refine the solution in small increments. Two approvals: what will work, then how to deliver it. Vocabulary and Jev feedback help the agent correct its work without creating additional approvals.

3. **One accountable agent delivers the result.** Agents do not duplicate the full verification run or push. An observer identifies stalls and unsupported claims. Distinguish passing tests, passing PR CI, and a successful product release.

## Evidence and Remaining Gaps

The review covered earlier instructions, commands, and **all six available Herdr work sessions**. It used the observer and short snapshots; it did not reread every message in each session's archive.

- Teaching session: 108 tests passed in 3.38 seconds, but a live scenario found the task incomplete.
- Catalog migration: push took 8 minutes 42 seconds and PR CI passed; publication after merge failed because the publication jobs had an empty token. Release verification did not run in the PR.
- **Two problems in the hooks remain unfixed:** a new commit invalidates reuse of the full verification result; any frontend change selects the entire catalog.
- Domain vocabulary checks and Jev are connected in the isolated trial. Semantic advice is not an approval gate; see [the measured trial](planctl-trial.md).

The basis is the earlier `fast-precommit` workflow, stage-boundary rules, existing test-selection scripts, and the [document standard](http://u3775:6420/dev/planctl-document-standard). The [session observer](http://u3775:6420/dev/planctl-watch-status) reports current evidence separately from this proposal.
