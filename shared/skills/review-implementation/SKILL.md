---
name: review-implementation
description: Review a Stage's diff with the three reviewers and, when asked or over 200 lines, Codex; triage and report a verdict. Does not fix.
user-invocable: true
disable-model-invocation: true
effort: high
---

# Review Implementation

The diff under review is `origin/staging..HEAD` or the one commit the
caller names. The plan in the conversation says what it was meant to do.
Run at most two review rounds. This skill reports; the caller fixes.
The round limit does not stop corrections. The caller fixes real defects
within the authorized task and verifies those fixes without requesting
another approval merely because the second review round has ended.

1. The three reviewers, in parallel, each on its one metric:
   coherence-cop (reuse and layers), coverage-cop (the state graph, one
   detailed test per flow, no test that passes on any code),
   simplicity-cop (no abstraction for a case that does not exist, no type
   the SPEC's Interfaces block does not name). They are `agents/*-cop.md`
   of the running tool.
2. Codex, only when the caller asks or the diff is over 200 lines: one
   review pass over correctness, behavior against the plan's invariants,
   security, data integrity and API stability.
3. Triage every finding into one of three:
   REAL — a gap, a bug or a risk here; blocks approval.
   ASK_USER — right in general, wrong in this context (a security note on
   a local CLI, "abstract this" on five lines); quote it, say why, and
   let the owner decide. Unsure means ASK_USER.
   DROPPED — naming, doc phrasing, log text, comment tone. Not surfaced.
4. The report, and nothing said that was not run:

```
REVIEW VERDICT: APPROVED | NEEDS_WORK | NEEDS_HUMAN_DECISION
coherence-cop: PASS|REJECT (N)   coverage-cop: PASS|REJECT (N)   simplicity-cop: PASS|REJECT (N)
Codex: APPROVED | NEEDS_WORK | not run
REAL: <finding> — <source> …
ASK_USER: <finding> — <source>; why it may not apply; apply / skip / override
DROPPED: <count>
```

APPROVED means no REAL and no ASK_USER. NEEDS_WORK means REAL findings.
NEEDS_HUMAN_DECISION means ASK_USER findings, whatever else there is.
"Should be fine now" is not a verdict.
