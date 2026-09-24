# Goal eval

The stand that chose the Goal rule on 24 September 2026. It measures how well a wording makes an agent write a plan's Goal from the owner's conversation, inside an isolated clone at the plan's base commit.

- `build.py` builds `cases.jsonl` from the owner's sessions: for each approved plan, the first tool call that created the plan file, preceded by the owner's messages in that session. `attribute.py` asks a judge whether the conversation really asked for that plan (`attribution.jsonl`; `yes-slugs.txt` lists the 23 it confirmed).
- `variants.json` holds the wordings under test. `run-commit.py <dir> <n> <model> <slug> <variants>` clones the repository at the plan's base commit into a temporary directory without a remote, runs `claude -p` with tools inside it, audits the transcript for any look beyond the clone, and judges the Goal against the conversation only. `rejudge.py` re-scores stored rounds with the current judge.
- `submit-spec-check.system.txt` is the system prompt measured for the fast model check in `submit_spec`.
- `rounds/` and `rounds4/` hold the 23-plan rounds; `results.md` shows every candidate next to the approved Goal; `dataset.md` is the review table.

Numbers on 23 plans, one judge, each item 0–2: the short rule with the measure sentence 6.61 of 8, without it 6.13, with the asks listed first 6.23. Session files are read from the machine's Codex and Claude directories and are not copied here.
