---
name: dispatch-to-linear
description: Hand an approved plan over to Linear so a coding-bot can pick it up. CLIENT-SIDE skill — its only job is to formulate the task correctly for the server (the bot). For each plan creates one Linear issue + one git branch + one draft GitHub PR; the PR is the long-lived task container the bot extends with implementation commits. The bot's execution protocol lives in the separate server-side skill `/execute-from-linear`. PREVIEWS the entire artifact tree before creating anything. User-invocable.
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools: Bash(whoami) Bash(ls *) Bash(grep *) Bash(git *) Bash(gh *) Bash(awk *) Bash(sed *) Bash(head *) Read Grep Glob
---

# Dispatch to Linear: client-side, plan → Linear issue + draft PR

You are the **client side** of a two-skill split:

- **`/dispatch-to-linear` (this skill)** — takes an approved plan from the local repo and produces three artifacts:
  1. A **Linear issue** that points at the work
  2. A **git branch** `<linear-issue-gitBranchName>` (Cyrus convention) containing the plan as its first commit
  3. An OPTIONAL **draft GitHub PR** from that branch into the base ref, with the same pointer body
- **`/execute-from-linear` (server-side, runs inside Cyrus's worktree)** — Cyrus picks up the issue assignment from Linear, creates the worktree at `~/.cyrus/worktrees/MAG-N/` from the branch we pre-created, spawns the bot session in it. The bot then runs `/execute-from-linear` to read the plan and execute stages.

**Cyrus is the orchestrator.** It owns: worktree creation, branch checkout, bot spawn, agent_context injection, Linear comment posting. We do NOT duplicate any of that. Our dispatch's job is to land the **branch + plan + Linear issue** so Cyrus has something to attach to.

The PR is the long-lived task container. Linear is the assignment layer. The plan file in the repo is canon. Don't paste the plan into the Linear issue body, don't paste a TDD protocol — those belong on the server side.

## STOP — Pre-flight Check

Before touching Linear or git remote:

1. **Is there an approved plan?** `Status: APPROVED` in the plan header. If not — STOP, route to `/spec` or `/review-plan`.
2. **Is the working tree clean enough to commit the plan?** `git status -s docs/plans/<slug>.md` should show only the plan file (or be clean if it's already committed locally on staging). Untracked unrelated files are OK; uncommitted unrelated changes — STOP and ask the operator to stash/commit first.
3. **Does `$(whoami)-bot` exist in Linear?** `mcp__linear__list_users(query=...)`. Not found → STOP and ask which bot to use.
4. **Has this plan already been dispatched?** Search Linear by title; check for an existing `*/mag-*-<slug>` branch on origin. Hit → STOP and ask: update / new / abort.
5. **Is `gh` authenticated with PR-write scope?** `gh auth status` should show write access. If not → STOP, ask the operator to refresh PAT.
6. **Auto-mode:** PREVIEW is mandatory regardless. Linear + GitHub are shared state.

## Step 1: Locate the approved plan

Two resolution paths, in order — no other heuristics:

1. **Explicit argument** — `/dispatch-to-linear <path>`. Use it directly after verifying the file exists and `Status: APPROVED`.
2. **Conversation context** — look at the current conversation. Is there a single specific plan the operator just discussed (finished `/spec` for it, published it via `mdurl`, asked a question about it)? If yes — propose it and CONFIRM: `"Dispatching docs/plans/<X>.md. Correct? (yes / no — name the plan you mean)"`. Only proceed on yes.

If neither path is clear — STOP and ask the operator in natural language:
```
Which plan should I dispatch? Examples:
  - "the dashboard one"
  - "docs/plans/x-api-migration.md"
  - "the latest"
  - "the spec we just discussed"
```
Then resolve their answer — match it against `docs/plans/*.md` titles or paths, confirm the match before proceeding. The operator's words are the source of truth; never silently fall back to a filesystem heuristic.

If the resolved plan does not have `Status: APPROVED` — STOP, ask the operator: route to `/spec` / `/review-plan` first, or override explicitly.

Extract from the chosen plan:
- `title`: first H1 line (used as issue title + PR title verbatim)
- `slug`: filename without `.md`
- `summary`: first 1–2 sentences from `## Task` (≤255 chars)

## Step 2: Resolve the coding-bot

- **Default:** `BOT_NAME="$(whoami)-bot"`.
- **Verify:** `mcp__linear__list_users(query=BOT_NAME)`, exact match on `name` / `displayName`.
- **Not found:** STOP, ask. List every `*-bot` from `list_users(limit=50)`.
- **Override:** `--bot=<name>` always wins.
- **Never humans.** Coding goes to bots only.

Print the resolved bot before going further:
```
Detected bot: marketing-bot (id=…)
```

## Step 3: Resolve team, project, base ref, repo

- **Team:** if a single team exists, use it; otherwise prefer one matching the repo name. On ambiguity — STOP.
- **Project:** OPTIONAL. Default: no project. `--project=<name>` requires the project to exist; never auto-create.
- **Base ref:** default `staging`. Override: `--base=<branch>`. Verify the ref exists on origin (`git ls-remote --heads origin <ref>`).
- **Repo:** `git remote get-url origin`. If it points at an old / forked URL, warn but don't auto-correct — ask the operator.

## Step 4: Compose what will be created (do not write yet)

Three artifacts must be planned coherently before any write:

### (a) Linear issue

- `title`: plan H1 verbatim
- `team`, `project` (or omit), `assignee` = bot, `priority` = 2 (High), `state` = `Todo`
- `description`: pointer body (composed below). Linear is created BEFORE the branch, so `description` initially does NOT contain a PR URL — the skill will update the issue after the PR exists (Step 6).

### (b) Git branch

**Branch name MUST come from Linear's `issue.gitBranchName` field**, not derived from the slug. Linear auto-generates this field at issue creation time as `<assignee-username>/<lowercased-team-prefix>-<id>-<title-slug>` (e.g. `mikael/mag-19-observability-dashboard-frontend-for-content-os-state`). When Cyrus picks up the assignment, it creates the worktree on a branch with EXACTLY this name. If our branch name diverges, Cyrus creates a NEW empty branch and the bot cannot find the plan we committed.

The skill MUST:

1. After `mcp__linear__save_issue` returns, read `response.gitBranchName`.
2. Use that exact string as the branch name.
3. If the assignee field on the Linear side maps to a human (typical: the operator who triggered the dispatch), the prefix will be the human's Linear username — not the bot's. That's fine; Cyrus uses the issue identifier (e.g. `mag-19`) to match, not the prefix.

Common-but-wrong patterns to avoid:
- ❌ `<bot>/mag-N-<slug>` derived locally from the bot name + slug — this is what dispatch-to-linear@v1 did and broke MAG-19. The Linear-side title slugifier produces a longer string than the local plan slug, AND uses the assignee username (often the human, not the bot) for the prefix, so the names diverged.
- ❌ `feat/<slug>` — no Linear identifier; Linear ↔ GitHub auto-link won't match.
- ❌ uppercase `MAG-N` in the branch — Linear's gitBranchName is always lowercase (`mag-19`, not `MAG-19`).

- Base: the resolved base ref (default `staging`).
- First commit: `plan(<slug>): approved spec — <one-line task summary>` adding `docs/plans/<slug>.md`. Author = whoever ran the dispatch.

### (c) Draft GitHub PR — OPTIONAL

Cyrus's `verify-and-ship` skill (running inside the bot session) does `gh pr view ... || gh pr create --draft ...` — i.e., it opens the PR if one doesn't exist. So pre-creating a draft PR here is OPTIONAL.

When to pre-create (default: yes):
- Operator wants to see CI run on the plan-only commit immediately
- Operator wants the PR URL to share with reviewers before the bot finishes
- Operator wants the Linear issue to carry a ready PR pointer from day 1

When to skip (`--no-pr`):
- Cyrus / `verify-and-ship` will handle it; nothing wrong with letting the server side do it

If pre-creating:
- Title: plan H1 verbatim (same as Linear issue title)
- Base: same base ref. Head: the new branch
- Body: same pointer body as the Linear issue
- Status: **draft** (`gh pr create --draft`)
- Marker: include `<!-- generated-by-cyrus-dispatch -->` HTML comment so Cyrus's verify-and-ship recognizes the PR as already opened

### Pointer body (shared between Linear issue and PR)

```markdown
**Plan:** [`docs/plans/<slug>.md`](<plan_file_url_on_branch>)
**Repo:** <plan_repo>
**Base:** <base_ref>
**Branch:** `<linear-issue-gitBranchName>`
**PR:** #<pr-number> (draft)  ← (omit on Linear-issue first write; filled in Step 6)
**Slug:** <slug>

## Summary

<first 1–2 paragraphs of the plan's ## Task — enough to know what
this is without opening the file>

## Acceptance (PR-level)

A PR is mergeable when ALL of:

- [ ] Every implementation stage in the plan has landed as a separate
      commit with the exact commit message prescribed in the plan's
      `### Implementation stages` section
- [ ] CI is green (typecheck + unit tests)
- [ ] No regressions in unrelated test suites
- [ ] `/review-implementation` verdict is APPROVED with all REAL
      findings fixed
- [ ] PR moved out of draft and human reviewer approves
- [ ] Plan file in the PR carries a `## Linear` footer pointing back
      at this issue

The bot must NOT merge — only the human reviewer does that.

## Bot

`<bot-name>` — picks up via `/execute-from-linear` (server-side skill).
```

## Step 5: PREVIEW — mandatory hard stop

Print the full triple-artifact plan to the operator before any write:

```
## Will create
**Linear team:** <name>
**Linear project:** <name | (none)>
**Assignee:** <bot-name> (id=…)
**State:** Todo · **Priority:** High

### Linear issue
- Title: <plan H1>
- Body: pointer + summary + acceptance + bot identity (~30 lines)

### Git branch (created locally + pushed to origin)
- Name: <linear-issue-gitBranchName>     (MAG-N filled after Linear issue is created)
- Base: <base_ref>
- First commit: plan(<slug>): approved spec — <summary>
- Files in commit: docs/plans/<slug>.md

### Draft GitHub PR
- Title: <plan H1>
- Base: <base_ref>  ← Head: <linear-issue-gitBranchName>
- Body: same pointer body as Linear issue
- Status: draft

---

**Total: 1 Linear write + 1 git branch + 1 git push + 1 GitHub PR (draft)**

After creation:
- Linear MAG-N appears, draft PR is open and idle, CI runs on plan-commit
- Bot picks up the issue → opens worktree on the existing branch → adds
  implementation commits → pushes → CI re-runs each push
- When bot is done, it marks the PR ready for review

Confirm to proceed (yes / no / edit instructions):
```

WAIT for explicit YES. On `no` — clean stop, no creation. On `edit` — adjust + re-print. Auto-mode does not bypass this.

## Step 6: Create — strict order

After explicit YES:

1. **Create the Linear issue** via `mcp__linear__save_issue` with the pointer body (PR URL field empty for now). Capture from the response:
   - `id` (e.g. `MAG-19`)
   - `url` (Linear permalink)
   - **`gitBranchName`** — Linear's auto-generated branch name. THIS IS THE BRANCH NAME for everything below. Don't derive from slug; don't add prefixes; use it verbatim. (See Step 4(b) for why.)
2. **Create the local branch** from the base ref:
   ```
   git fetch origin <base_ref>
   git checkout -b <linear-issue-gitBranchName> origin/<base_ref>
   ```
3. **Commit the plan** if it's not already in the branch's history:
   ```
   git add docs/plans/<slug>.md
   git commit -m "plan(<slug>): approved spec — <summary>"
   ```
   If the plan is already committed somewhere accessible from this branch, skip — never duplicate.
4. **Push** the branch:
   ```
   git push -u origin <linear-issue-gitBranchName>
   ```
5. **Open the draft PR** via `gh` (skip if `--no-pr`):
   ```
   gh pr create --draft \
     --base <base_ref> \
     --head <linear-issue-gitBranchName> \
     --title "<plan H1>" \
     --body "<pointer-body-with-PR-#-omitted-or-self-ref>"
   ```
   Capture `pr_url` and `pr_number`. If skipped, leave them blank — Cyrus's `verify-and-ship` opens the PR later.
6. **Update the Linear issue** to include the PR URL in its body (if PR was created). Same `save_issue(id=MAG-N, description=...)` call with the PR field filled in.
7. **Print the result**:
   ```
   ✓ Linear issue: <issue_url>           (MAG-N)
   ✓ Branch: <linear-issue-gitBranchName>           (pushed to origin)
   ✓ Draft PR: <pr_url>                  (#M, base=<base_ref>)
   ✓ CI started: <ci_run_url>            (will re-run on each bot push)

   The bot will pick up MAG-N within ~30s (Linear webhook → content-os
   LinearSyncService → agent dispatch). Watch progress on the PR
   conversation or `tail -f /tmp/x-api-backend.log` on u3775.
   ```

If any step fails partway through:
- Linear issue created but branch push fails → tell operator, leave issue (it's idempotent on re-run with `--update`)
- PR creation fails (e.g. gh auth) → tell operator, branch is on origin, they can open PR manually
- Never roll back automatically — the operator decides recovery

## Step 7: Plan footer + session archive

### (a) Plan footer (on the dispatch branch)

Append to the plan file:
```markdown
## Linear

Dispatched as [MAG-N](<issue_url>) on YYYY-MM-DD; PR [#M](<pr_url>); branch `<linear-issue-gitBranchName>`; assigned to <bot-name>.
Session archive: ~/.claude/sessions-by-plan/<slug>.jsonl
```

The plan is on the dispatch branch already (committed in Step 6). Add a follow-up commit:
```bash
git add docs/plans/<slug>.md
git commit -m "docs(plan): link <slug> to Linear MAG-N + PR #M"
git push origin <linear-issue-gitBranchName>
```

The push triggers CI again — fine, idempotent.

### (b) Session archive

The conversation that produced this plan is valuable context (decisions, trade-offs, dead ends). Claude Code stores every session as a JSONL transcript at `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl`. The session uuid is opaque; archive the active session under a human-readable name keyed by the plan slug:

```bash
session_dir="$HOME/.claude/projects/$(pwd | sed 's|/|-|g')"
session_file=$(ls -t "$session_dir"/*.jsonl 2>/dev/null | head -1)
[ -n "$session_file" ] || { echo "warn: no session JSONL found in $session_dir"; }
archive_dir="$HOME/.claude/sessions-by-plan"
mkdir -p "$archive_dir"
cp -- "$session_file" "$archive_dir/<slug>.jsonl"
```

The archive lives **outside the repo** — never commit transcripts (they may contain secrets, env values, machine-specific paths). The plan footer points at it; that's enough for future-you to grep `jq '.message.content' ~/.claude/sessions-by-plan/<slug>.jsonl` and recover the discussion.

If the session lookup fails, surface a warning but don't abort dispatch — the dispatch artifacts are already on origin.

## Step 8: Local cleanup

Once Linear + branch + (optional) PR + plan footer are pushed, the local artifacts of this dispatch are no longer needed. The bot owns the work in Cyrus's worktree at `~/.cyrus/worktrees/MAG-N/`; your local copy is stale the moment the bot starts.

```bash
# back to staging WT (where the plan briefly was uncommitted before dispatch)
cd "$(git rev-parse --show-toplevel)"
git checkout <base_ref>

# if the plan ever lived in the staging WT (the /spec workflow leaves it
# uncommitted on staging until dispatch), the checkout above wipes it
# from the staging WT — the plan now lives ONLY on <linear-issue-gitBranchName>.

# remove the local feature branch — origin has it, no value keeping
# the local copy now (re-pull on demand).
git branch -D <linear-issue-gitBranchName>

# if a worktree was used during planning (e.g. /spec created
# .worktrees/<slug>), remove it:
[ -d ".worktrees/<slug>" ] && git worktree remove .worktrees/<slug>
```

After cleanup:
- Local repo: on base ref, clean WT, no stale branches, no stale worktrees
- Origin: branch `<linear-issue-gitBranchName>` with plan + footer commits
- Linear: MAG-N pointing at branch + (optional) PR
- Archive: `~/.claude/sessions-by-plan/<slug>.jsonl`
- Cyrus: about to receive Linear webhook → spawn bot in its own worktree

## Args

```
/dispatch-to-linear                       # newest approved plan, $(whoami)-bot
/dispatch-to-linear <plan-path>           # explicit plan
/dispatch-to-linear --bot=<name>          # override bot
/dispatch-to-linear --project=<name>      # file under existing project
/dispatch-to-linear --base=<branch>       # base ref (default: staging)
/dispatch-to-linear --state=backlog       # create in Backlog instead of Todo
/dispatch-to-linear --update              # if Linear issue or branch exists, allow update
/dispatch-to-linear --no-pr               # skip pre-creating draft PR (verify-and-ship will open it)
/dispatch-to-linear --keep-local          # skip Step 8 local cleanup (operator wants to inspect)
/dispatch-to-linear --dry-run             # never write, only PREVIEW
```

## Anti-patterns — DO NOT

- **NEVER paste the plan body or TDD protocol into the Linear issue.** Pointer + summary + acceptance only. The plan is in the branch / PR diff.
- **NEVER pick a plan by mtime** ("newest file"). Multiple approved plans + parallel work make mtime a silent wrong-dispatch hazard. Always require explicit path, conversation-context confirmation, or a single unambiguous match — and always confirm before proceeding.
- **NEVER skip PREVIEW.** Auto-mode does not relax this.
- **NEVER assign to humans.** Bots only.
- **NEVER guess the bot name silently.** STOP and ask.
- **NEVER dispatch without an approved plan.**
- **NEVER create the same issue or branch twice.** Search first; on hit ask update/new/abort.
- **NEVER auto-create projects, labels, or base refs.** Operator-driven.
- **NEVER open the PR as ready-for-review.** Always draft. The bot flips it ready when implementation is done.
- **NEVER force-push the branch.** First commit is the plan; never rewrite.
- **NEVER skip MAG-N in the branch name.** Linear ↔ GitHub auto-link depends on it.
- **NEVER escape newlines in description / body fields.** Linear MCP and `gh pr create` both want real newlines.
- **NEVER mark the Linear issue Done from this skill.** That happens on PR merge.
- **NEVER skip the session archive** unless the JSONL is genuinely missing. The conversation is the only artifact that captures *why* a decision was made — losing it is irreversible. Surface a warning if the lookup fails, but the dispatch itself completes.
- **NEVER commit the session JSONL into the repo.** Transcripts can carry secrets, env values, machine-specific paths. Archive lives at `~/.claude/sessions-by-plan/`; plan footer points at it.
- **NEVER skip Step 8 local cleanup** unless `--keep-local` was passed. Local artifacts after dispatch grow into a junk pile fast.
- **NEVER construct the branch name yourself.** Always use `response.gitBranchName` from `mcp__linear__save_issue`'s response. Linear is the source of truth; deriving locally from slug + bot name will diverge from what Cyrus expects (this happened on MAG-19 — see Step 4(b) for the breakage details).

## When NOT to use this skill

- Plan not approved → `/spec` or `/review-plan` first.
- The work is too small for a plan → just open a normal issue or PR manually.
- You want stage-level Linear visibility → that's a different model; write a separate skill rather than overloading this one.

## Related skill

`/execute-from-linear` — server-side counterpart. Pointer-body schema (Plan / Repo / Base / Branch / PR / Slug fields) is shared; if you change the schema here, update that skill's parser too.
