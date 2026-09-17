# Rule register B — process laws (0_agents laws + Magnis repo copies)

Sources (line numbers are from the files as read on 2026-09-17):

- `development-process.md`, `plan-format.md`, `plan-protocol.md`, `git-workflow.md` = `/home/marketing/Coding/0_agents/.worktrees/instructions-by-rule/shared/code-production/laws/<file>`
- `repo:development-process.md`, `repo:plan-format.md`, `repo:plan-protocol.md`, `repo:git-workflow.md` = `origin/staging:docs/<file>` in magnis-app
- `repo:testing/policy.md` = `origin/staging:docs/testing/policy.md`; `repo:plans/README.md` = `origin/staging:docs/plans/README.md` (prose only)

| id | rule (≤ 20 words, plain English, no jargon) | homes (file:line, all of them; prefix repo copies with "repo:") | group | note |
|---|---|---|---|---|
| B-001 | Project documents describe architecture; they never redefine this lifecycle. | development-process.md:3-5 | lifecycle | |
| B-002 | Project commands implement the shared package API (`package-contract.md`). | development-process.md:6-7 | lifecycle | |
| B-003 | Skills implement these laws; they do not replace them. | repo:development-process.md:22-23 | lifecycle | |
| B-004 | Produce mergeable code predictably: high quality, low cost, short wall time; optimize measured outcomes, not activity. | development-process.md:11-12; repo:development-process.md:27-28 | lifecycle | |
| B-005 | Start every plan in its own worktree and commit the first draft immediately. | development-process.md:28; plan-protocol.md:20; git-workflow.md:26-27; repo:development-process.md:44; repo:plan-protocol.md:22; repo:git-workflow.md:47-48 | lifecycle | |
| B-006 | SPEC settles goal, flows, metrics, constraints, invariants and reuse before any decomposition. | development-process.md:29; plan-protocol.md:21; repo:development-process.md:45; repo:plan-protocol.md:23 | lifecycle | |
| B-007 | Once SPEC settles, open the draft PR and publish the plan with `mdurl` for owner review. | development-process.md:30; plan-protocol.md:22; git-workflow.md:27-28; repo:development-process.md:46; repo:plan-protocol.md:24; repo:git-workflow.md:48-49 | lifecycle | |
| B-008 | HARD STOP 1: the owner approves SPEC; then run `planctl approve-spec`. | development-process.md:31,43-44; plan-protocol.md:23; repo:development-process.md:47,59-60; repo:plan-protocol.md:25 | lifecycle | |
| B-009 | After SPEC lock, add PR Deliveries, commit-sized Stages, concrete Tasks, forecasts, writes and RED tests. | development-process.md:32; plan-protocol.md:24; repo:development-process.md:48; repo:plan-protocol.md:26 | lifecycle | |
| B-010 | HARD STOP 2: owner approves implementation; run `planctl approve-plan`; direct plan editing ends. | development-process.md:33,44-45; plan-protocol.md:25; repo:development-process.md:49,60-61; repo:plan-protocol.md:27 | lifecycle | |
| B-011 | There are exactly two planning stops; plan review rounds run only on the owner's word. | development-process.md:43-45; repo:development-process.md:59-61 | lifecycle | |
| B-012 | Only one PR Delivery is active; a second is refused — finish or close the current one. | development-process.md:34,55-56; plan-protocol.md:26,35,179; git-workflow.md:35; repo:development-process.md:50,70; repo:plan-protocol.md:28,37,178; repo:git-workflow.md:51 | lifecycle | |
| B-013 | Stages run in parallel only with declared disjoint writes, one exact base and an integration owner; uncertain overlap serializes. | development-process.md:35,56-58; plan-protocol.md:26,42,180; git-workflow.md:35-36; repo:development-process.md:51,70-72; repo:plan-protocol.md:28,44,179; repo:git-workflow.md:51-52 | lifecycle | |
| B-014 | The Integration Stage joins Stage commits, buys the affected full gates once and marks the existing PR ready. | development-process.md:37,144-145; plan-protocol.md:28,38; git-workflow.md:31-32,36; repo:development-process.md:53; repo:plan-protocol.md:30,40; repo:git-workflow.md:52,55-56 | lifecycle | |
| B-015 | The owner alone merges the PR; promotion from `staging` to `main` is also owner-owned. | development-process.md:39; plan-protocol.md:29; git-workflow.md:22; repo:development-process.md:55,206; repo:plan-protocol.md:31; repo:git-workflow.md:35-36 | lifecycle | |
| B-016 | After the owner merges, record the scorecard, a short retro and clean registered temp roots. | development-process.md:40,187-189; repo:development-process.md:56,208-210 | lifecycle | "scorecard" — no such section or command exists anywhere |
| B-017 | The retro names scope changes, estimate misses, duplicated gates, whether parallelism shortened the path, smallest process change next. | development-process.md:187-189; repo:development-process.md:208-210 | lifecycle | |
| B-018 | A Plan contains sequential PR Deliveries. | development-process.md:49; plan-format.md:38; repo:development-process.md:65; repo:plan-format.md:40 | lifecycle | |
| B-019 | A PR Delivery is one branch, one PR and one publication gate. | development-process.md:50; plan-protocol.md:35; repo:development-process.md:66; repo:plan-protocol.md:37 | lifecycle | |
| B-020 | A Stage is one delegable, observable TDD result and one work commit. | development-process.md:51; plan-protocol.md:36; repo:development-process.md:67; repo:plan-protocol.md:38 | lifecycle | |
| B-021 | A Task is one atomic, frozen, estimable code change readable without chat history. | development-process.md:52-53; plan-protocol.md:37; repo:development-process.md:68; repo:plan-protocol.md:39 | lifecycle | |
| B-022 | Child agents never edit the plan; they return a commit and a typed receipt; the integrator uses planctl. | plan-protocol.md:41; git-workflow.md:16-17; repo:development-process.md:72-73; repo:plan-protocol.md:43; repo:git-workflow.md:29-30 | lifecycle | |
| B-023 | Use profile `fast` for narrow low-risk Stages with explicit writes and local tests. | plan-protocol.md:108; repo:plan-protocol.md:102 | lifecycle | |
| B-024 | `fast` refuses migrations, security, concurrency, shared contracts and unclear scope. | plan-protocol.md:108; repo:plan-protocol.md:102 | lifecycle | |
| B-025 | Use profile `strong` for shared/risky work, integration, review and unattended decisions; no model race. | plan-protocol.md:109; repo:plan-protocol.md:103 | lifecycle | |
| B-026 | `strong` refuses a protected merge or a hidden decision. | plan-protocol.md:109; repo:plan-protocol.md:103 | lifecycle | |
| B-027 | Change this process only from observed Delivery receipts, one measured problem at a time. | plan-protocol.md:188-190 | lifecycle | absent from repo copy |
| B-028 | The reusable implementation lives in the `planctl/` Bun package, run from its own directory; agent-stack vendors only CLI/core bytes. | development-process.md:107-110; git-workflow.md:76-78 | lifecycle | Magnis path is `.agents/code-production/runtime/` (repo:development-process.md:214; repo:git-workflow.md:126) |
| B-029 | `agent-stack install` supplies portable hooks and, by default, the PR workflow; the consumer's package.json supplies the commands. | git-workflow.md:3-5; plan-protocol.md:13; repo:git-workflow.md:22-23 | lifecycle | |
| B-030 | A repo with equivalent CI declares external ownership in package.json; the installer keeps that workflow as the only published-SHA gate. | git-workflow.md:5-8,72-73; repo:git-workflow.md:112-114; repo:development-process.md:218-219 | lifecycle | |
| B-031 | Install or refresh the lifecycle stack with `agent-stack install .` then `agent-stack check .`. | repo:git-workflow.md:118-124 | lifecycle | |
| B-032 | The manifest pins the installed source revision; `bun run agent:install` refreshes workspace deps, not the lifecycle stack. | repo:git-workflow.md:126-128; repo:development-process.md:214 | lifecycle | |
| B-033 | Hook installation is local git state: each clone must run the installer once. | repo:git-workflow.md:155-156 | lifecycle | |
| B-034 | The plan ledger `docs/plans/README.md` is the lifecycle authority for every plan file. | repo:plans/README.md:13-14 | lifecycle | |
| B-035 | A plan body's own APPROVED/DRAFT/stage wording is not a live status; read the ledger row first. | repo:plans/README.md:14-16 | lifecycle | |
| B-036 | Ledger status `proposed`: incomplete or deferred proposal, not approved for execution. | repo:plans/README.md:228-229 | lifecycle | |
| B-037 | Ledger status `approved`: approved plan with no implementation receipt yet. | repo:plans/README.md:230 | lifecycle | |
| B-038 | Ledger status `in_progress`: active work exists and has not passed its completion gate. | repo:plans/README.md:231 | lifecycle | |
| B-039 | Ledger status `implemented`: a receipt proves the behavior landed; current docs own the live contract. | repo:plans/README.md:232-233 | lifecycle | |
| B-040 | Ledger status `superseded`: another plan, direction or contract replaced the proposal. | repo:plans/README.md:234-235 | lifecycle | |
| B-041 | Ledger status `abandoned`: intentionally stopped without implementation. | repo:plans/README.md:236 | lifecycle | |
| B-042 | Ledger status `historical`: preserved evidence or partial result; not current authority; no complete-plan receipt. | repo:plans/README.md:237-238 | lifecycle | |
| B-043 | Refresh each intentionally `in_progress` ledger row immediately before its review and merge gate. | repo:plans/README.md:242-245 | lifecycle | |
| B-044 | A shipped subset of a historical plan is never converted into a complete-plan claim. | repo:plans/README.md:246-248 | lifecycle | |
| B-045 | Broken links inside immutable plan bodies stay historical debt; current docs and receipt hashes are the authority. | repo:plans/README.md:249-251 | lifecycle | |
| B-046 | The plan format is one page of law for every plan in `docs/plans/`; the tooling enforces mechanics. | plan-format.md:12-13; repo:plan-format.md:14-15 | plan-writing | diverged: 0_agents says "planctl and the managed hooks" enforce; repo says "the managed `plan-gate.ts`" |
| B-047 | The Goal comes first and concrete: numbers for what gets faster, cheaper, smaller or safer; bullets beat vision. | plan-format.md:19-21,297-298; repo:plan-format.md:21-23,263-264 | plan-writing | |
| B-048 | The Goal names its currency; every Stage pays a stated share and its receipt records the measured payment. | plan-format.md:22-25; repo:plan-format.md:24-27 | plan-writing | |
| B-049 | The Target: a mermaid flowchart of the one architectural decision, a per-file target tree, TypeScript interfaces. | plan-format.md:26-29; repo:plan-format.md:28-31 | plan-writing | |
| B-050 | Unknown facts are `<placeholders>` a Stage 0 pins — never guessed. | plan-format.md:29-30; repo:plan-format.md:31-32 | plan-writing | |
| B-051 | "Today" is measured on a pinned base SHA: line counts, file:line anchors, one deciding fact; past tense. | plan-format.md:31-33; repo:plan-format.md:33-35 | plan-writing | |
| B-052 | The Reuse map names what existing code is extended and the greps proving nothing covers the need. | plan-format.md:33-34; repo:plan-format.md:35-36 | plan-writing | |
| B-053 | A second copy of an existing mechanism means the plan is wrong. | plan-format.md:35; repo:plan-format.md:37 | plan-writing | |
| B-054 | Invariants are plain one-pass statements; each is a named test written RED before its Stage. | plan-format.md:36-37; repo:plan-format.md:38-39 | plan-writing | |
| B-055 | Sections in order: Goal, Target, Today, Invariants, Implementation, Amendments, Deviations, Execution contract, Pre-approval screen. | plan-format.md:17-160; repo:plan-format.md:19-122 | plan-writing | |
| B-056 | The owner view is a review interface, not an execution log. | development-process.md:62 | plan-writing | |
| B-057 | planctl renders the owner-view shape; agents never hand-author the hidden comment. | plan-format.md:40-41 | plan-writing | |
| B-058 | Delivery heading `### PR Delivery D1 — <result>` with a `Branch; Depends; Gate` line and a `Stage graph` line. | plan-format.md:44-48; repo:plan-format.md:43-47 | plan-writing | |
| B-059 | A Delivery carries a required `description` (the PR text as of merge); without it the Delivery is refused. | plan-format.md:55-59; repo:plan-protocol.md:151-152,154-155 | plan-writing | repo:plan-format.md template (43-47) omits it |
| B-060 | A Stage carries a required `description` (what it solves, what is built, how proven, commit message); refused without it. | plan-format.md:69-72; repo:plan-format.md:56-59; repo:plan-protocol.md:152-156 | plan-writing | diverged: repo:plan-protocol.md:71 calls it `summary` |
| B-061 | A Stage is its result title plus one compact metadata block: Owner/Profile/Depends/Parallel, Writes, Temp root, Predict, verification share. | development-process.md:64-67; plan-format.md:61-67,104; plan-protocol.md:68-74,91-92; repo:plan-format.md:49; repo:plan-protocol.md:69-75 | plan-writing | diverged: repo:plan-protocol.md:73-75 has no Temp root and no verification share |
| B-062 | Stage metadata appears once; it is never copied into every Task, and a Task never repeats the write list. | plan-format.md:104; plan-protocol.md:91,155-156 | plan-writing | |
| B-063 | A Stage title names the commit result; never "finish the colleague's branch", "half-landed" or "remaining work". | development-process.md:67-68,81-83; plan-format.md:100-101,105-106; plan-protocol.md:58 | plan-writing | |
| B-064 | A Task is two source lines: a story ending in `(N min)`, then a hidden `plan:task-meta` comment. | development-process.md:77-79; plan-format.md:74-77,89-92; plan-protocol.md:76-79,92-93 | plan-writing | diverged: repo:plan-format.md:63-67 (`TASK_001` with Writes/Predict/How/RED lines) and repo:plan-protocol.md:77-84 (`CPP-001` with nested How) prescribe a five-line Task nobody generates |
| B-065 | A Task story is one concrete change, at most 200 characters, naming every write by full path or basename. | development-process.md:69-71; plan-format.md:94-96; plan-protocol.md:92-94 | plan-writing | |
| B-066 | A Task owns at most four write paths; split it when it exceeds that or joins independent changes. | development-process.md:72-73; plan-format.md:95-97; plan-protocol.md:94 | plan-writing | |
| B-067 | A Task stands alone: "existing", "new files", "named files", "rename map", "as discussed" are rejected unless resolved to a path or symbol. | development-process.md:74-76; plan-format.md:106-108; plan-protocol.md:58,60; repo:development-process.md:78-79,87-88; repo:plan-protocol.md:60 | plan-writing | |
| B-068 | Exact writes, credits, How and RED live in the hidden metadata; `start-task` reveals them; visible prose never repeats them. | development-process.md:77-79; plan-format.md:89-92; plan-protocol.md:79,94-95,155-156 | plan-writing | |
| B-069 | Legacy five-line Tasks remain readable but are never generated. | plan-format.md:92 | plan-writing | repo:development-process.md:77-81, repo:plan-format.md:63-67 and repo:plan-protocol.md:77-84 still prescribe them |
| B-070 | Before approval, follow every acceptance story through its public calls; every owning file that changes is a Task write. | development-process.md:90-93; plan-format.md:175-179; plan-protocol.md:98-100 | plan-writing | absent from all repo copies |
| B-071 | A missing owning file proves the decomposition incomplete; it never licenses editing first and asking later. | development-process.md:92-94; plan-format.md:177-179; plan-protocol.md:100 | plan-writing | |
| B-072 | Acceptance criteria: `` `<scoped command>` exits 0 — <behavior proved> `` plus a `Commit` box. | plan-format.md:79-82; plan-protocol.md:81-84; repo:plan-format.md:69-73; repo:plan-protocol.md:86-89 | plan-writing | |
| B-073 | A criterion states its asserted RESULT; a bare "test file exits 0" is not a criterion. | plan-format.md:115-118; repo:plan-format.md:80-83 | plan-writing | |
| B-074 | Results is a table: Task, Commit, UTC start-end, Active/elapsed, Usage, Result/proof. | plan-format.md:84-86; plan-protocol.md:86-88; repo:plan-protocol.md:91-93 | plan-writing | diverged: repo:plan-format.md:75-78 shows a bullet list ("what was measured: number, against target") instead |
| B-075 | Each Stage registers `.tmp/code-production/<plan-slug>/<Stage-ID>` as its temp child; the receipt proves it absent. | plan-format.md:65,120-121; plan-protocol.md:72 | plan-writing | |
| B-076 | A legitimate fan-out names its unit count and produces one commit per unit. | plan-format.md:121-122; repo:plan-format.md:51-54 | plan-writing | diverged: repo adds a `(fan-out: 9)` heading form and "the scorecard's commit arithmetic" — no scorecard exists |
| B-077 | A Stage touching time, parsing or concurrency names its adversarial cases in the criteria before code. | plan-format.md:133-135; repo:plan-format.md:95-97 | plan-writing | |
| B-078 | Read in order, Stage titles and Task stories tell the whole story; a Stage is a coherent commit, not unrelated cleanup. | plan-format.md:140-142; repo:plan-format.md:102-104 | plan-writing | diverged: repo says "typically 10-20 related changes, not a micro-edit" |
| B-079 | Amendments: owner-approved plan changes, one dated line each, written before the edit they license. | plan-format.md:143-144; repo:plan-format.md:105-106 | plan-writing | |
| B-080 | Deviations: agent-recorded shortfalls (stage, target vs reached, decision), written the moment they happen. | plan-format.md:145-146; repo:plan-format.md:107-108 | plan-writing | |
| B-081 | Execution contract: a short pointer to development-process.md, noting only overrides and scoped commands. | plan-format.md:147-149; repo:plan-format.md:109-111 | plan-writing | |
| B-082 | The pre-approval screen is the LAST block before "Утверждаешь?": file tree, human acceptance stories, what is not verified and why. | plan-format.md:150-160; repo:plan-format.md:112-122 | plan-writing | |
| B-083 | Forbidden: DEC-numbered decision lists and criteria referencing other criteria or documents. | plan-format.md:299-300; repo:plan-format.md:265-266 | plan-writing | |
| B-084 | Forbidden: permanent tests asserting file-structure layout; an acceptance command checks that once. | plan-format.md:301-302; repo:plan-format.md:267-268 | plan-writing | |
| B-085 | Forbidden: inventory pin tests in the suite; a one-shot acceptance script is allowed. | plan-format.md:303-307; repo:plan-format.md:269-273 | plan-writing | |
| B-086 | Forbidden: self-declared approval; `status: approved` is the owner's word only. | plan-format.md:308; repo:plan-format.md:274 | plan-writing | |
| B-087 | Forbidden: vision prose and sugar. | plan-format.md:309; repo:plan-format.md:275 | plan-writing | |
| B-088 | Forbidden: checkboxes mirroring external-system state (CI status, PR or merge state); GitHub is the record. | plan-format.md:310-312; repo:plan-format.md:276-278 | plan-writing | |
| B-089 | Model Goals on the given Good/Bad examples (measured baseline and receipts, not "make development faster"). | plan-protocol.md:49-53; repo:plan-protocol.md:51-55; repo:development-process.md:83-85 | plan-writing | diverged: repo examples say "Sources PR 1" / "backend gate"; 0_agents says "first pilot Delivery" / "complete project gate" |
| B-090 | Model Tasks on the given Good/Bad examples (exact path, symbol, test and minutes). | development-process.md:85-88; plan-format.md:99-102; plan-protocol.md:57-60; repo:development-process.md:86-93; repo:plan-protocol.md:59-61 | plan-writing | diverged: repo Good Task is the legacy long form (`TASK_014` / `CPP-014`) |
| B-091 | `put-stage --help` prints the copyable JSON contract plus good/bad Tasks. | plan-protocol.md:154-155; repo:plan-protocol.md:150-151 | plan-writing | |
| B-092 | Blank line before EVERY list — the renderer fuses lists into paragraphs without it. | plan-format.md:204-205; repo:plan-format.md:166-167 | plan-writing | |
| B-093 | Quote mermaid labels containing `\|`, `(`, `)` or `:`; use `<br/>` for line breaks, never `\n`. | plan-format.md:206-209; repo:plan-format.md:168-171 | plan-writing | |
| B-094 | Judged plan quality (goal concreteness, story-telling stages) has no complete mechanical check; owner review judges meaning. | plan-format.md:316-318; repo:plan-format.md:282-287 | plan-writing | diverged: repo cites `scripts/plan-score.ts` and the tournament research; 0_agents says planctl rejects low-information Tasks |
| B-095 | While status is `SPEC_DRAFT`, the agent may freely edit SPEC prose; a DRAFT is the agent's to shape. | development-process.md:112; plan-format.md:280-283; git-workflow.md:64; repo:development-process.md:104; repo:plan-format.md:246-249 | plan-freeze | |
| B-096 | HARD STOP 1 freezes the marked SPEC region; HARD STOP 2 freezes the Delivery/Stage/Task graph. | plan-format.md:164-165; repo:plan-format.md:126-127 | plan-freeze | |
| B-097 | After either lock, every plan mutation goes through planctl; `plan-update.ts` is the single mutation engine. | development-process.md:113-114; plan-format.md:165-167; plan-protocol.md:41,147-148; repo:development-process.md:104-106; repo:plan-format.md:127-129; repo:plan-protocol.md:43,137-138 | plan-freeze | |
| B-098 | Direct edits (Edit, Write, apply_patch, search/replace, manual checkbox) have no journal and are refused by pre-commit. | development-process.md:114-115; plan-format.md:167-168; plan-protocol.md:148-150; git-workflow.md:64-65; repo:development-process.md:106-107; repo:plan-format.md:129-130; repo:plan-protocol.md:138-140; repo:git-workflow.md:101-102 | plan-freeze | |
| B-099 | A raw approved-plan edit is discarded and repeated through planctl. | plan-protocol.md:184; repo:plan-protocol.md:183 | plan-freeze | |
| B-100 | Task text, criteria and forecasts stay immutable after approval; Results and execution events append. | plan-format.md:168-169; repo:plan-format.md:131-132 | plan-freeze | |
| B-101 | Approval freezes four things: Goal, target file tree, stage headings, acceptance-criterion text. | plan-format.md:222-223; repo:plan-format.md:184-185 | plan-freeze | |
| B-102 | A commit changing frozen text needs an Amendments line in THAT SAME commit; an earlier Amendment licenses nothing. | plan-format.md:223-226; repo:plan-format.md:186-188; repo:development-process.md:111-112; repo:git-workflow.md:103-104 | plan-freeze | |
| B-103 | Scope changes need the owner's word through `planctl amend`; amend before editing while the owner is available. | development-process.md:93-94,117; plan-protocol.md:142,178; repo:development-process.md:114; repo:plan-protocol.md:132,177 | plan-freeze | |
| B-104 | A wrapped criterion is one sentence frozen as one; unindented prose after the list is not a continuation and stays free. | plan-format.md:228-233; repo:plan-format.md:190-195 | plan-freeze | |
| B-105 | The freeze reaches any plan whose status line says APPROVED followed by who approved and when. | plan-format.md:235-236; repo:plan-format.md:197-198 | plan-freeze | |
| B-106 | A plan arriving through a MERGE is inherited, judged against `git merge-tree`; a conflicted plan's resolution is judged as authored, per file. | plan-format.md:241-246; repo:plan-format.md:203-208 | plan-freeze | |
| B-107 | During a merge the journal check stands aside: plan bytes mutated on another branch carry no journal here. | repo:development-process.md:107-110; repo:plan-format.md:130-131; repo:plan-protocol.md:144-146; repo:git-workflow.md:102-103 | plan-freeze | diverged: repo says `verify-staged` stands aside while `MERGE_HEAD` exists / bytes identical to a side; 0_agents (B-106) judges with `git merge-tree`; absent from 0_agents development-process/plan-protocol/git-workflow |
| B-108 | A plan edited by hand while the merge is open needs its journal again. | repo:plan-protocol.md:146 | plan-freeze | |
| B-109 | The planctl format hashes the entire marked SPEC including nested headings; heading-only freeze is only for legacy markerless plans. | plan-format.md:256-258; repo:development-process.md:110-112 | plan-freeze | contradicts B-110 |
| B-110 | A protected section ends at its first nested heading, so eight plans have no protected target tree (known hole). | repo:plan-format.md:218-224 | plan-freeze | diverged: contradicts B-109; repo:plan-format keeps the old hole while repo:development-process.md:110-112 and 0_agents say nested headings are hashed |
| B-111 | Four free deltas: checkbox character, receipt at the item's end, a corrected measured number, a Deviations line. | plan-format.md:260-263; repo:plan-format.md:226-229 | plan-freeze | diverged: repo says receipt "ending a line of the item" |
| B-112 | Everything outside the four frozen sections (stage prose, reuse map, measurements) stays the agent's to write. | plan-format.md:263-266; repo:plan-format.md:229-232 | plan-freeze | |
| B-113 | A measured result goes to `#### Results`, never into a task or criterion; appending to a criterion is not a free delta. | plan-format.md:124-131; repo:plan-format.md:86-93 | plan-freeze | |
| B-114 | The pre-commit hook calls `plan-gate --freeze` on every staged plan, so refusal arrives before the commit. | plan-format.md:268-270; repo:plan-format.md:234-236 | plan-freeze | diverged: repo names `scripts/codex/pre-commit-checks.sh`; 0_agents says "the managed pre-commit hook" |
| B-115 | Accepted limits: a commit with the hook silenced is not caught afterwards; a weakened threshold dressed as measurement is a reviewer's finding. | plan-format.md:270-273; repo:plan-format.md:236-239 | plan-freeze | |
| B-116 | A plan cannot be created already APPROVED; the draft is committed first. | plan-format.md:275-276; repo:plan-format.md:241-242 | plan-freeze | |
| B-117 | Deleting a plan is outside the freeze rule; the ledger records purged plans. | plan-format.md:276-278; repo:plan-format.md:242-244 | plan-freeze | |
| B-118 | Actuals append later and never rewrite the forecast. | plan-format.md:172-173; repo:plan-format.md:135-136 | plan-freeze | forecast |
| B-119 | The gate's `--start` mode refuses work on a plan not owner-approved or carrying unanswered owner lines. | plan-format.md:210-211; repo:plan-format.md:172-173 | plan-freeze | |
| B-120 | A closed box is `- [x] <text> — <short-sha>`; the receipt sits at the END of the item and must be an ancestor of HEAD. | plan-format.md:191-192; repo:plan-format.md:148-154 | plan-freeze | diverged: repo says the receipt terminates "a LINE" — last line for prose, the checkbox line for a five-line Task |
| B-121 | A non-ancestral result commit: merge the Stage commit first, then import. | plan-protocol.md:181; repo:plan-protocol.md:180 | plan-freeze | |
| B-122 | A machinable criterion opens with its command: `` `cmd` exits N ``; prose quoting the form is not executed. | plan-format.md:193-194; repo:plan-format.md:71,155-156 | plan-freeze | |
| B-123 | Beware `rg -c` (prints nothing, exits 1 on zero matches); write `` `rg -q …` exits 1 ``. | plan-format.md:194-195; repo:plan-format.md:156-157 | plan-freeze | |
| B-124 | A machinable criterion must hold in every re-running environment: Stage close, Integration pre-push, `/end-work` closure. | plan-format.md:196-198; repo:plan-format.md:158-160 | plan-freeze | |
| B-125 | The CI plan-gate job checks receipts only (`--no-exec`); a thin runner cannot host the stack. | plan-format.md:198-201; repo:plan-format.md:160-163 | plan-freeze | |
| B-126 | Environment-specific measurements are recorded as prose with number and place, never as a re-run command. | plan-format.md:201-203; repo:plan-format.md:163-165 | plan-freeze | |
| B-127 | Criteria run with `PLAN_GATE_NESTED=1`; a nested run verifies receipts without executing; `--no-exec` is the safe default. | plan-format.md:212-218; repo:plan-format.md:174-180 | plan-freeze | |
| B-128 | `plan-gate` reads receipts and machinable criteria only; prose criteria are the reviewer's. | plan-format.md:319-320; repo:plan-format.md:288-289 | plan-freeze | |
| B-129 | `docs/plans/<slug>.md` is the only plan copy; JSON files are inputs/receipts; journals hold hashes and timers, never a plan. | development-process.md:103-105; plan-format.md:187; plan-protocol.md:43; repo:development-process.md:100-102; repo:plan-format.md:144; repo:plan-protocol.md:45 | plan-freeze | |
| B-130 | Stale lock/hash: reload, then owner amendment or a complete unattended decision. | plan-protocol.md:178; repo:plan-protocol.md:177 | plan-freeze | |
| B-131 | A result differing from frozen Task/writes: correct the receipt or amend; never rewrite history. | plan-protocol.md:182; repo:plan-protocol.md:181 | plan-freeze | |
| B-132 | Legacy markerless plans stay under the legacy freeze: protected text changes only with a same-commit owner Amendment. | repo:development-process.md:110-112; repo:git-workflow.md:103-104 | plan-freeze | |
| B-133 | `planctl --help` and `planctl <command> --help` print exact syntax and JSON contracts. | plan-protocol.md:126,154; repo:plan-protocol.md:120,150 | planctl-command | |
| B-134 | `planctl init <plan> --title <title>` creates and stages a SPEC_DRAFT plan; its journal preimage is the empty string. | plan-protocol.md:127; repo:plan-protocol.md:121,140-142 | planctl-command | |
| B-135 | `planctl set-spec <plan> --from <spec.md>` replaces SPEC while draft, through the same journaled writer. | plan-protocol.md:128; repo:plan-protocol.md:122,142-143 | planctl-command | |
| B-136 | `planctl approve-spec <plan> --owner-word <word>` locks SPEC after the owner's approval. | plan-protocol.md:23,129; repo:plan-protocol.md:25,123 | planctl-command | |
| B-137 | `planctl put-delivery <plan> --from <delivery.json>` adds or replaces one draft Delivery. | plan-protocol.md:130; repo:plan-protocol.md:124 | planctl-command | |
| B-138 | `planctl put-stage <plan> --from <stage.json>` adds or replaces one draft Stage. | plan-protocol.md:131; repo:plan-protocol.md:125 | planctl-command | |
| B-139 | `planctl remove-stage <plan> --stage <ID>` deletes a draft Stage. | plan-protocol.md:132,153; repo:plan-protocol.md:126,149 | planctl-command | |
| B-140 | While `SPEC_LOCKED`, rerunning put-delivery/put-stage with the same ID replaces that record in place. | plan-protocol.md:152-153; repo:plan-protocol.md:148-149 | planctl-command | |
| B-141 | After `APPROVED`, put-delivery, put-stage and remove-stage are refused. | plan-protocol.md:153-154; repo:plan-protocol.md:150 | planctl-command | |
| B-142 | `planctl approve-plan <plan> --owner-word <word>` locks Delivery, Stage and Task meaning. | plan-protocol.md:25,133; repo:plan-protocol.md:27,127 | planctl-command | |
| B-143 | `planctl start-task <plan> --task <ID>` runs before RED, prints the frozen scope and starts a Git-local timer. | development-process.md:126; plan-format.md:181-184; plan-protocol.md:27,134,157-159; repo:development-process.md:123; repo:plan-format.md:138-141; repo:plan-protocol.md:29,128,161-163 | planctl-command | |
| B-144 | `start-task` re-reads the committed plan or a journal-verified staged Result and refuses blocked or closed Tasks. | plan-format.md:181-183; plan-protocol.md:157-158; repo:plan-format.md:138-140; repo:plan-protocol.md:161-162 | planctl-command | |
| B-145 | `start-task` never copies or changes the plan; it also prints the Stage description. | plan-format.md:72,183-184; plan-protocol.md:159; repo:plan-format.md:59; repo:plan-protocol.md:156,163 | planctl-command | |
| B-146 | `planctl focus <plan> [--task <ID>]` reprints Goal, current Task, next ready work, drift and progress. | plan-protocol.md:135,161 | planctl-command | absent from repo copy although the vendored runtime has it |
| B-147 | `planctl progress <plan> [--server]` stays local unless `--server` requests one bounded read. | plan-protocol.md:136,162 | planctl-command | absent from repo copy although the vendored runtime has it |
| B-148 | Before an owner-blocking question, run `planctl needs-owner <plan> --task <ID> --reason <safe-line>`. | development-process.md:137-139; plan-protocol.md:137,163-164 | planctl-command | absent from all repo copies although the vendored runtime has it |
| B-149 | After the owner answers, `planctl resume-task <plan> --task <ID>` clears the marker; `start-task` also clears it. | development-process.md:139-141; plan-protocol.md:138,164 | planctl-command | absent from all repo copies although the vendored runtime has it |
| B-150 | Transcripts, question marks and terminal turns never create an owner obligation. | development-process.md:141-142; plan-protocol.md:165 | planctl-command | |
| B-151 | `planctl complete-task <plan> --from <stage-result.json>` imports the typed receipt and consumes the timer. | development-process.md:133-134; plan-format.md:184-187; plan-protocol.md:27,139,159-160; repo:development-process.md:131-134; repo:plan-format.md:141-144; repo:plan-protocol.md:29,129,163-164 | planctl-command | |
| B-152 | `complete-task` proves receipt paths equal frozen Task writes and the commit diff (minus journaled plan bookkeeping). | development-process.md:133-134; plan-format.md:184-187; plan-protocol.md:159-160; repo:development-process.md:131-132; repo:plan-format.md:141-144; repo:plan-protocol.md:163-164 | planctl-command | |
| B-153 | `complete-task` records actual time/usage/result and leaves the plan update for the next work or closure commit. | repo:development-process.md:132-134 | planctl-command | |
| B-154 | `planctl close-stage <plan> --stage <ID>` proves and closes a Stage's acceptance criteria. | plan-protocol.md:140; repo:plan-protocol.md:130 | planctl-command | |
| B-155 | `planctl add-deviation <plan> --stage <ID> --reason <text>` appends one scoped deviation. | plan-protocol.md:141; repo:plan-protocol.md:131 | planctl-command | |
| B-156 | `planctl amend <plan> --owner-word <word> --patch <patch.json>` applies an owner amendment. | development-process.md:117; plan-protocol.md:142; repo:development-process.md:114; repo:plan-protocol.md:132 | planctl-command | |
| B-157 | `planctl verify <plan>` verifies SPEC and implementation locks. | plan-protocol.md:143; repo:plan-protocol.md:133 | planctl-command | |
| B-158 | `planctl verify-staged <plan>` verifies the staged mutation journal. | plan-protocol.md:144; repo:plan-protocol.md:134; repo:development-process.md:109 | planctl-command | |
| B-159 | The Delivery JSON carries `predictedExternalWaitMinutes`; planctl derives the rest of the Forecast line. | plan-format.md:50-54; repo:plan-protocol.md:156-160 | planctl-command | forecast |
| B-160 | `agent-stack check` rejects missing package scripts, a stale vendored runtime, modified managed files or a hooks path not `.githooks`. | git-workflow.md:74-75; repo:git-workflow.md:115-116,155-156 | planctl-command | |
| B-161 | The installer refuses to overwrite an unmanaged hook or workflow; integrate deliberately, then mark it managed. | git-workflow.md:80-82 | planctl-command | |
| B-162 | All work enters through a PR into `staging`; never open a feature PR into `main`. | git-workflow.md:12-13,70-71; repo:git-workflow.md:21 | git | |
| B-163 | Work on `feat\|fix\|refactor\|chore/<topic>` in a dedicated `.worktrees/<topic>` worktree created from `origin/staging`. | git-workflow.md:14-15; repo:git-workflow.md:27-28 | git | |
| B-164 | One agent = one branch = one worktree. | git-workflow.md:16; repo:git-workflow.md:29 | git | |
| B-165 | Refresh a feature branch with `git merge origin/staging`; merge commits only; never rebase, squash or rewrite published history. | git-workflow.md:18-19; repo:git-workflow.md:31-32 | git | |
| B-166 | Never move work between trees with `cp` or `git checkout <branch> -- <path>`; merge the commit. | git-workflow.md:20-21; repo:git-workflow.md:33-34 | git | |
| B-167 | Agents never merge or push directly to `staging` or `main`. | git-workflow.md:22; repo:git-workflow.md:35-36 | git | |
| B-168 | The `reference-transaction` hook protects local `staging`/`main`; its override belongs only to an explicit owner operation. | repo:git-workflow.md:110-111 | git | |
| B-169 | Keep the same branch and PR through the active Delivery. | git-workflow.md:27-28; repo:git-workflow.md:48-49 | git | |
| B-170 | A PR stays draft while product work or the full gate is incomplete; only the Integration Stage marks it ready after a locally green exact head. | git-workflow.md:30-32; plan-protocol.md:28; repo:git-workflow.md:55-56; repo:plan-protocol.md:30 | git | |
| B-171 | If a required check cannot be green, say so and keep the PR draft. | repo:git-workflow.md:57 | git | |
| B-172 | Before every push confirm the PR is still open; a closed or merged PR branch is never reused — a tail needs a new PR. | git-workflow.md:32-33; repo:git-workflow.md:52-53 | git | |
| B-173 | Conventional Commit subject; the body explains WHY and names the Stage. | git-workflow.md:40; repo:git-workflow.md:61 | git | |
| B-174 | One work commit per Stage. | development-process.md:36,51; plan-protocol.md:27; git-workflow.md:41; repo:development-process.md:52,67; repo:plan-protocol.md:29; repo:git-workflow.md:62 | git | |
| B-175 | Plan checkbox/result updates ride the next work commit; one explicit plan-only closure commit may carry the tail. | git-workflow.md:41-42; repo:git-workflow.md:62-63; repo:development-process.md:133-134 | git | |
| B-176 | Never use `--no-verify`, never change `core.hooksPath` to escape a failure, never amend published commits. | development-process.md:132; git-workflow.md:43-44; repo:development-process.md:130; repo:git-workflow.md:66-67 | git | |
| B-177 | A commit that unexpectedly touches another Stage's files is invalid even if tests pass; never silently widen Stage writes. | development-process.md:161; git-workflow.md:45-46; repo:development-process.md:187; repo:git-workflow.md:67 | git | |
| B-178 | After every staging merge refresh dependencies (`agent:install`: `bun install` and `bun install --cwd backend`) before tests. | development-process.md:145; plan-protocol.md:117; repo:development-process.md:170-175; repo:git-workflow.md:38-43; repo:plan-protocol.md:111 | git | |
| B-179 | `pre-commit` permits free SPEC_DRAFT writing, freezes locked plan bytes, requires a planctl journal, then runs commit-level scripts. | git-workflow.md:64-65; repo:git-workflow.md:101-105; repo:development-process.md:215 | git | |
| B-180 | `post-commit` consumes the spent plan mutation transaction. | git-workflow.md:66; repo:git-workflow.md:106 | git | |
| B-181 | `pre-push` rejects tracked uncommitted changes, verifies plan locks, runs the complete gate, stores a Git-local exact-HEAD receipt. | development-process.md:145-147; git-workflow.md:67-69; repo:development-process.md:216-217; repo:git-workflow.md:107-109 | git | |
| B-182 | A stored HEAD receipt lets the next unchanged push skip the suite; any new commit invalidates it. | development-process.md:146-147; git-workflow.md:68-69; repo:git-workflow.md:108-109 | git | |
| B-183 | Managed CI `.github/workflows/code-production.yml` rejects non-staging bases, runs cheap checks on drafts and the product gate on ready PRs. | git-workflow.md:70-72 | git | Magnis has no such file — external `ci.yml` is declared instead (B-184) |
| B-184 | `.github/workflows/ci.yml` is Magnis's only published-SHA workflow (backend, frontend, package, E2E, docs, audit, release); no second workflow. | repo:git-workflow.md:112-114,132-134; repo:development-process.md:218-219 | git | |
| B-185 | `package.json` owns project-specific commands; managed hooks contain no framework paths. | git-workflow.md:4-5; repo:development-process.md:220-221 | git | |
| B-186 | Consumer repositories retain the seven root package scripts and stable `.agents/code-production/runtime/` targets. | git-workflow.md:76-78 | git | "seven agent:* scripts" — Magnis package.json has eight (B-198) |
| B-187 | CI concurrency cancels superseded runs for the same head ref. | repo:git-workflow.md:135-136 | git | |
| B-188 | Task inner loop: run the exact RED/GREEN file, optionally one test ID, via `bun run agent:test:<lane> -- <file> [-t <ID>]`. | git-workflow.md:52; plan-protocol.md:115; repo:development-process.md:145; repo:git-workflow.md:73; repo:plan-protocol.md:109 | verification | |
| B-189 | Before the Stage commit run only the Stage's one to three named behavior files. | development-process.md:129; plan-protocol.md:116; repo:development-process.md:126,146; repo:plan-protocol.md:110 | verification | |
| B-190 | Micro-review the staged diff before committing: scope, accidental files, duplicated mechanisms, missing behavior. | development-process.md:130; plan-protocol.md:27,116; repo:development-process.md:127-128; repo:git-workflow.md:64-65 | verification | |
| B-191 | The Stage commit hook runs `agent:verify:docs` and `agent:verify:commit` (docs plus fast changed-scope checks); never bypass it. | development-process.md:131-132; git-workflow.md:53; repo:development-process.md:129-130,147; repo:git-workflow.md:74,79 | verification | |
| B-192 | Delivery publication: merge staging, both installs, affected full gates once, cumulative review, via `.githooks/pre-push` (`agent:verify:docs` + `agent:verify:pr`). | development-process.md:144-146; git-workflow.md:54; plan-protocol.md:117; repo:development-process.md:148; repo:git-workflow.md:75; repo:plan-protocol.md:111 | verification | |
| B-193 | Draft PR CI runs the process/docs (control-plane) contract only; ready PR CI buys every relevant product lane on the published SHA. | git-workflow.md:55-56,71-72; repo:git-workflow.md:76,133-135 | verification | |
| B-194 | CI independently repeats the relevant complete gates on the exact published ready-PR SHA. | development-process.md:147-148; plan-protocol.md:118; repo:development-process.md:149; repo:git-workflow.md:82-83; repo:plan-protocol.md:112 | verification | |
| B-195 | Final review reuses unchanged exact-head receipts; rerun only after the SHA changes. | development-process.md:148-149; git-workflow.md:57; plan-protocol.md:119; repo:development-process.md:150,178-179; repo:git-workflow.md:77,138-139; repo:plan-protocol.md:113 | verification | |
| B-196 | The complete gate is bought once per Delivery locally and once by CI — never after each edit, Task or Stage. | git-workflow.md:59-60; repo:development-process.md:177-179 | verification | |
| B-197 | No local hook result replaces CI. | repo:git-workflow.md:138 | verification | |
| B-198 | The Magnis package command contract: `agent:install`, `agent:test:{backend,frontend,e2e,evals}`, `agent:verify:{commit,pr,docs}`. | repo:development-process.md:152-163 | verification | eight scripts; git-workflow.md:77 says "seven" |
| B-199 | The PR gate classifies the Delivery diff against `origin/staging`: backend-only buys the backend lane, frontend-only the frontend lane, package work its lane. | repo:development-process.md:165-167; repo:git-workflow.md:79-81 | verification | |
| B-200 | Unknown or shared product paths fail closed to all lanes; process/docs-only Deliveries report explicit `N/A`. | repo:development-process.md:167-168; repo:git-workflow.md:81-82 | verification | |
| B-201 | The backend compile lane builds the SDK and runs its contract tests (including the Settings route inventory) before typecheck and lint. | repo:git-workflow.md:85-87 | verification | |
| B-202 | Browser and live-provider acceptance stay separate from the backend lane. | repo:git-workflow.md:87-88 | verification | |
| B-203 | The LLM call-sites audit (`scripts/llm-call-sites-audit.sh`) runs once per gate regardless of lanes and fails on any non-allowlisted provider call. | repo:git-workflow.md:90-94 | verification | |
| B-204 | The frontend lane also runs the production build, because `check` never runs the bundler. | repo:git-workflow.md:94-97 | verification | |
| B-205 | Pre-commit runs deterministic checks chosen by the repository script and the staged paths. | repo:testing/policy.md:65-66 | verification | |
| B-206 | Documentation paths select the repository checker without product suites; checker implementation paths also select its fixture tests. | repo:testing/policy.md:66-67 | verification | |
| B-207 | The docs route rejects unstaged or untracked documentation so the audit matches staged bytes, including deletions. | repo:testing/policy.md:67-69 | verification | |
| B-208 | Anchor revision checks use committed HEAD; a merge also supplies MERGE_HEAD and the next single-HEAD check needs a follow-up receipt. | repo:testing/policy.md:69-71 | verification | |
| B-209 | Deleted frontend sources still select the frontend gate but are excluded from file arguments needing an existing path. | repo:testing/policy.md:72-73 | verification | |
| B-210 | Cross-cutting schema/core changes require the full backend gate (`bun run typecheck`, `bun run lint`, `bun test` in `backend/`). | repo:testing/policy.md:73-75 | verification | |
| B-211 | E2E is required for app-visible behavior. | repo:testing/policy.md:75-76 | verification | |
| B-212 | Implementation review is a final handoff gate, not a per-commit suite. | repo:testing/policy.md:76-77 | verification | |
| B-213 | Live certification is always explicit and manual. | repo:testing/policy.md:77 | verification | |
| B-214 | Skipping, weakening assertions, adding ignore markers or accepting an unknown failure as "pre-existing" is not a green result. | repo:testing/policy.md:79-80 | verification | |
| B-215 | The backend CI gate is unfiltered `bun test` over `backend/test/`; path-prefix filters are development aids, never final evidence. | repo:testing/policy.md:82-84 | verification | |
| B-216 | CI retries Playwright tests; review the retry evidence or flakiness stays hidden. | repo:testing/policy.md:93-94 | verification | |
| B-217 | A green test is evidence only after the same test was observed RED for the expected reason. | development-process.md:151-152; plan-protocol.md:121; repo:development-process.md:138-139; repo:plan-protocol.md:115 | tdd | |
| B-218 | Write the named behavior test and show RED for the expected reason before implementing. | development-process.md:127; repo:development-process.md:124 | tdd | |
| B-219 | Implement the minimum change and show GREEN with the same narrow command. | development-process.md:128; repo:development-process.md:125 | tdd | |
| B-220 | Non-trivial behavior starts with an invariant and a deterministic failing test. | repo:testing/policy.md:15 | tdd | |
| B-221 | A bug found by a user, reviewer or walkthrough gets regression coverage at the closest valid layer before the fix is complete. | repo:testing/policy.md:16-17 | tdd | |
| B-222 | New test IDs are `tst_<layer>_<area>_<nnn>`; scenarios `scn_<domain>_<nnn>`; lowercase, grep-friendly, stable. | repo:testing/policy.md:21-23 | tdd | |
| B-223 | Put the test ID in the executable name when possible; otherwise in a nearby metadata comment. | repo:testing/policy.md:23-24 | tdd | |
| B-224 | Metadata fields: `@test-id`, `@scenario`, `@covers`, `@deterministic`, `@fixtures`, optional `@legacy-id`. | repo:testing/policy.md:26-27 | tdd | |
| B-225 | Non-trivial state edges in implementation code carry `@tested-by` and an invariant statement. | repo:testing/policy.md:27-28 | tdd | |
| B-226 | Legacy test IDs remain valid evidence; do not mass-rename unrelated suites. | repo:testing/policy.md:29 | tdd | |
| B-227 | When merging legacy executables, keep one canonical ID and list every absorbed ID as `@legacy-id` or `@covers`. | repo:testing/policy.md:31-33 | tdd | |
| B-228 | Matrix rows and lifecycle assertions include the relevant legacy ID in their failure message. | repo:testing/policy.md:33-34 | tdd | |
| B-229 | A before/after grep of the affected ID set must show no unexplained removals. | repo:testing/policy.md:34-35 | tdd | |
| B-230 | Compile-only checks that never exercised behavior may be removed, but the review receipt must classify them. | repo:testing/policy.md:35-36 | tdd | |
| B-231 | Default suites may use real PGlite/PostgreSQL, migrations, V8 isolates, child connectors, browsers and temp files. | repo:testing/policy.md:40-42 | tdd | |
| B-232 | Suites must not use live provider accounts, real OAuth, personal data, paid model calls, unbounded waits or writes outside test-owned paths. | repo:testing/policy.md:42-43 | tdd | |
| B-233 | Random input uses a fixed seed; time-sensitive behavior gets an injected clock or a bounded readiness protocol. | repo:testing/policy.md:45-46 | tdd | |
| B-234 | Fixtures are committed, non-sensitive and small enough for ordinary review. | repo:testing/policy.md:46-47 | tdd | |
| B-235 | Playwright, WebSocket, HTTP clients and direct service calls are test clients, not mocks; a mock replaces an external provider, connector or model. | repo:testing/policy.md:51-53 | tdd | |
| B-236 | Comments name the client, replaced boundary and fixture rather than calling the harness "mocked". | repo:testing/policy.md:53-54 | tdd | |
| B-237 | The default Playwright project keeps video/trace/screenshots on failure; `showcase` records all three and is preferred handoff evidence. | repo:testing/policy.md:58-60 | tdd | |
| B-238 | Numbered manual steps match the automated scenario; visual inspection never replaces assertions. | repo:testing/policy.md:60-61 | tdd | |
| B-239 | No repository-wide test-ID uniqueness checker exists; traceability metadata is a convention. | repo:testing/policy.md:88-89 | tdd | |
| B-240 | The backend suite is one flat `tst_bts_<area>_*` namespace; the layer rides in the area token, not a directory. | repo:testing/policy.md:90-92 | tdd | |
| B-241 | At night the agent decides instead of waiting: record goal, decision, alternatives, reason, scope, rollback base and verification. | development-process.md:117-120; plan-protocol.md:169; repo:development-process.md:114-117; repo:plan-protocol.md:168 | unattended | |
| B-242 | Commit the smallest reversible choice as `owner_review_pending` and continue. | development-process.md:119-120; plan-protocol.md:169; repo:development-process.md:116-117; repo:plan-protocol.md:168 | unattended | |
| B-243 | Ordinary shortfalls append to Deviations and work continues. | development-process.md:120; plan-protocol.md:171; repo:development-process.md:117; repo:plan-protocol.md:170 | unattended | |
| B-244 | Stop unattended work only for irreversible data loss, security damage or destruction of unmerged work. | development-process.md:164-165; plan-protocol.md:171; repo:development-process.md:190-191; repo:plan-protocol.md:170 | unattended | |
| B-245 | Hook or test failure: fix the cause and rerun the failed scope. | development-process.md:156; repo:development-process.md:183 | unattended | |
| B-246 | Task scope no longer matches reality: owner amendment; at night a complete reversible unattended decision, then continue. | development-process.md:157-158; repo:development-process.md:184-185 | unattended | |
| B-247 | Predicted time exceeded: record actuals and continue; a bad forecast is data, not a stop. | development-process.md:159-160; repo:development-process.md:186 | unattended | forecast |
| B-248 | Unrelated file appears in the diff: remove it from the Stage or amend scope. | development-process.md:161; repo:development-process.md:187 | unattended | |
| B-249 | Existing base failure: record its command and SHA; fix only when it blocks the Delivery and the plan authorizes it. | development-process.md:162-163; repo:development-process.md:188-189 | unattended | |
| B-250 | Continue automatically to the next ready Stage after each Task. | development-process.md:135; repo:development-process.md:135-136 | unattended | |
| B-251 | Each Delivery registers one temp root; each parallel Stage owns a child. | development-process.md:169; plan-protocol.md:170; repo:development-process.md:195; repo:plan-protocol.md:169 | unattended | |
| B-252 | Before a Stage hands off, delete obsolete artifacts from its registered temp child. | development-process.md:170; repo:development-process.md:135,196 | unattended | |
| B-253 | Before publication every registered temp path must be absent; result import and publication refuse leftovers. | development-process.md:170-171; plan-protocol.md:170; repo:development-process.md:197; repo:plan-protocol.md:169 | unattended | |
| B-254 | Remove only explicit, inactive registered paths; never sweep `/tmp`, home or workspace roots. | development-process.md:171-172; plan-protocol.md:170; repo:development-process.md:197-198; repo:plan-protocol.md:169 | unattended | |
| B-255 | Temp root exists at import: promote the evidence, remove that registered path, retry. | plan-protocol.md:183; repo:plan-protocol.md:182 | unattended | |
| B-256 | An owner-response wait is runtime state, not prose. | development-process.md:137; plan-protocol.md:163-165 | unattended | |
| B-257 | Hand over a ready, mergeable PR — not "some commits"; a raw URL, branch name or "pushed" is not a Delivery. | development-process.md:176; git-workflow.md:93; repo:development-process.md:202; repo:git-workflow.md:151 | handoff | |
| B-258 | The primary handoff link is `[PR #N — title](GitHub URL)` as clickable Markdown. | development-process.md:179; git-workflow.md:86-90; plan-protocol.md:29,172; repo:development-process.md:203; repo:git-workflow.md:143-147; repo:plan-protocol.md:31,171 | handoff | |
| B-259 | The handoff also reports the plan `mdurl`. | development-process.md:180; git-workflow.md:92; plan-protocol.md:172; repo:development-process.md:203; repo:git-workflow.md:149; repo:plan-protocol.md:171 | handoff | |
| B-260 | The handoff reports the exact head SHA, green CI state and mergeable state. | development-process.md:181; git-workflow.md:92; plan-protocol.md:172; repo:development-process.md:203-204; repo:git-workflow.md:149; repo:plan-protocol.md:171 | handoff | |
| B-261 | The handoff reports predicted versus actual active/elapsed/wait time and usage, plus rework and gates bought. | development-process.md:182; plan-protocol.md:172; repo:development-process.md:204; repo:git-workflow.md:149-150; repo:plan-protocol.md:171 | handoff | forecast |
| B-262 | The handoff lists test and review receipts reused from that SHA. | development-process.md:183; git-workflow.md:92; repo:development-process.md:204; repo:git-workflow.md:150 | handoff | |
| B-263 | The handoff lists deviations, rework and unverified gaps explicitly. | development-process.md:184; git-workflow.md:92-93; plan-protocol.md:172; repo:development-process.md:204-205; repo:git-workflow.md:150; repo:plan-protocol.md:171 | handoff | |
| B-264 | The handoff confirms registered temp roots are absent. | development-process.md:185; plan-protocol.md:29,172; repo:development-process.md:205; repo:plan-protocol.md:31,171 | handoff | |
| B-265 | The owner must be able to merge without performing an agent step first. | repo:git-workflow.md:150-151 | handoff | |
| B-266 | A Task result reads "ID → sha; expected RED observed; named test passed; N predicted / M actual min; usage; deviation; temp root absent" — never "Done; tests green". | plan-protocol.md:62-63; repo:plan-protocol.md:63-64 | handoff | |
| B-267 | Every Delivery records predicted and actual active minutes. | development-process.md:12-14; repo:development-process.md:28-30 | forecast | forecast |
| B-268 | Every Delivery records elapsed time and external wait time. | development-process.md:15; repo:development-process.md:31 | forecast | forecast |
| B-269 | Every Delivery records credits/tokens when the runner exposes them; otherwise `unavailable`, never zero. | development-process.md:16; plan-protocol.md:63,102; repo:development-process.md:32; repo:plan-protocol.md:64,96 | forecast | forecast |
| B-270 | Every Delivery records rework commits, review rounds, gates bought, unauthorized scope changes and temp leftovers. | development-process.md:17-19; repo:development-process.md:33-35 | forecast | forecast |
| B-271 | Parallel work reduces wall time only when dependency paths and write ownership permit. | development-process.md:21-22; repo:development-process.md:37-38 | forecast | forecast |
| B-272 | Never divide total work by agent count and call that a forecast or wall time. | development-process.md:22; plan-protocol.md:102; repo:development-process.md:38; repo:plan-protocol.md:96 | forecast | forecast |
| B-273 | Each Task predicts active minutes and credits; the rendered story line ends with the minutes. | development-process.md:70-71; plan-format.md:171; plan-protocol.md:92-93; repo:development-process.md:80-81; repo:plan-format.md:134 | forecast | forecast |
| B-274 | Stage forecast = sum of Task forecasts + an explicit verification share, for minutes and credits; never guessed independently. | development-process.md:96-97; plan-format.md:110-113; plan-protocol.md:95-96; repo:development-process.md:95 | forecast | forecast; diverged: repo says "at least the sum of its Tasks" (no verification share) |
| B-275 | A Delivery reports aggregate active work, longest dependency path and external waits separately. | development-process.md:97-99; plan-format.md:171-173; plan-protocol.md:102; repo:development-process.md:95-96; repo:plan-format.md:134-136; repo:plan-protocol.md:96 | forecast | forecast |
| B-276 | The Delivery `Forecast:` line is derived by planctl on every put-stage, frozen by approve-plan, compared with Stage Results in the scorecard. | plan-format.md:50-54; repo:plan-protocol.md:156-160 | forecast | forecast; "scorecard" — no such section or command; the repo:plan-format template (43-47) has no Forecast line |
| B-277 | Forbidden: unscoped time estimates that omit profile, dependency path and waits. | plan-format.md:309; repo:plan-format.md:275 | forecast | forecast |
| B-278 | Stage metadata shows `Predict: N active min / M credits` and `Of which verification: …`. | plan-format.md:66-67; plan-protocol.md:73-74 | forecast | forecast; repo:plan-protocol.md:75 shows only `Predict: <min>/<credits>` |
| B-279 | History: "Judge-validated in the Stage 11 tournament" (criterion RESULT rule). | plan-format.md:118; repo:plan-format.md:83 | history | |
| B-280 | History: owner ruling 2026-08-24 on measured results in Results, with the unreachable "append the number" specimen. | plan-format.md:125-131; repo:plan-format.md:87-93 | history | |
| B-281 | History: closed-PR retro 2026-08-21 — seven of nine review blockers on the triggers branch were adversarial-case misses. | plan-format.md:135-138; repo:plan-format.md:97-100 | history | |
| B-282 | History: the pre-approval screen was adopted from the 2026-08-21 retro (every steering intervention fell into three categories). | plan-format.md:151-153,160; repo:plan-format.md:113-115,122 | history | |
| B-283 | History: mermaid parse bomb — "two plans hit it on 2026-08-20". | plan-format.md:208-209; repo:plan-format.md:170-171 | history | |
| B-284 | History: 2026-08-24 gate recursion reached ~eighty processes a second, twice, because the flag was written and never read. | plan-format.md:215-218; repo:plan-format.md:177-180 | history | |
| B-285 | History: the wrapped-criterion specimen "a clean merge runs nothing" could be flipped unopposed. | plan-format.md:230-233; repo:plan-format.md:192-195 | history | |
| B-286 | History: requiring APPROVED to END the line left six plans unfrozen — 18 before, 24 after. | plan-format.md:236-239; repo:plan-format.md:198-201 | history | |
| B-287 | History: two narrower merge-inheritance forms (byte copy; hand-built three-way) were tried and were wrong. | plan-format.md:248-254; repo:plan-format.md:210-216 | history | |
| B-288 | History: the owner's 2026-08-24 ruling «иначе агент не сможет ничего написать» on drafts. | plan-format.md:280-283; repo:plan-format.md:246-249 | history | |
| B-289 | History: the shape this rule answers is `ee92a86eb` — 244 plan lines moved inside a code commit while still DRAFT. | plan-format.md:285-293; repo:plan-format.md:251-259 | history | |
| B-290 | History: owner ruling 2026-08-21 — an AI-SDK branch had to edit a logging test's package list (inventory pin ban). | plan-format.md:306-307; repo:plan-format.md:272-273 | history | |
| B-291 | History: frontmatter `derived_from: magnis-process-pr-227`; classification "PR #227 supplies enforcement". | plan-format.md:1-8; plan-protocol.md:1-14; repo:plan-protocol.md:13-16 | history | |
| B-292 | History: the receipt audit baseline is `ef4994ee32…`; "baseline audit" means anchors were checked at that revision only. | repo:plans/README.md:18-21 | history | |
| B-293 | History: the tournament record showed judge panels agree within 0.3 points at this rubric. | repo:plan-format.md:284-287 | history | |
| B-294 | History: the nested-heading freeze hole is recorded in `stage-loop.md`'s Deviations; closing it is the owner's call. | repo:plan-format.md:220-224 | history | |
| B-295 | A Task says what is wrong, what changes, where, how observed; its `How` repeats every path; one RED command; predicted minutes/credits. | repo:development-process.md:77-81 | stale | diverged: describes the legacy five-line Task that plan-format.md:92 says is never generated |
| B-296 | Known gap: the current Sources Delivery predates typed planctl timings; treat it as the first qualitative pilot. | repo:development-process.md:225-227 | stale | pilot long past |
| B-297 | Known gap: Sources has not yet supplied timing, usage or rework evidence; optimize only after its first PR receipt. | repo:plan-protocol.md:187 | stale | pilot long past |
| B-298 | Known gap: the existing CI workflow predates the portable package API; measure the pilot before refactoring CI. | repo:git-workflow.md:157-159 | stale | pilot long past |
| B-299 | Known gap: existing project-specific commit checks exceed the portable minimum; measure their wall time before removing coverage. | repo:development-process.md:228-229 | stale | pilot long past |

## Counts

- Total rows: 299
- Rows per group:
  - lifecycle: 45
  - plan-writing: 49
  - plan-freeze: 38
  - planctl-command: 29
  - git: 26
  - verification: 29
  - tdd: 24
  - unattended: 16
  - handoff: 10
  - forecast: 12
  - history: 16
  - stale: 5
- Rows present in 2+ files: 219
- Rows marked diverged (note contains "diverged"): 17
