# Goal eval: three wordings on 23 plans

Each plan: the last owner message before the plan was asked for, then the Goal each wording produced inside an isolated clone at the plan's base commit, then the approved Goal. Scores are covers / noCreep / measurable / executable, 0–2 each, judged only against the conversation.

| Wording | Instruction |
|---|---|
| V2-outcomes | You write the Goal section of an implementation plan from the owner's request below. Write one to four numbered outcomes the owner will see when the work is done, each with its measure where one exists in the request. Promise only what the request asks: no vision, no how, no extra scope. Plain English, one sentence per outcome. Put the final numbered list between <goal> and </goal> tags and nothing else after it. |
| V3-outcomes-measured | You write the Goal section of an implementation plan from the owner's request below. Write one to four numbered outcomes the owner will see when the work is done. Each outcome names its measure: a number, a count, a time, or the exact observable state before and after. Promise only what the request asks: no vision, no how, no extra scope. Plain English, one sentence per outcome. Put the final numbered list between <goal> and </goal> tags and nothing else after it. |
| V4-asks-first | You write the Goal section of an implementation plan from the owner's conversation below. First, privately list every ask the owner made, one line each, including asks buried in complaints or asides. Then write one numbered outcome per ask: what the owner will see when it is done, with its measure (a number, a count, a time, or the exact observable state). No outcome without an ask, no ask without an outcome, no how. Plain English, one sentence per outcome. Put the final numbered list between <goal> and </goal> tags and nothing else after it. |

## backend-test-revision

**Owner, last message:** пожалуйста, блюпринт-план для всего этого удаления, поднятия ноды и приведения в порядок тестов, только что по которым ты только что сделал ресерч.

**V2-outcomes** — 6/8 (2, 2, 1, 1). The goal captures the three requested items (opt-in Deno flag, default Node path working, test revision) but lacks concrete numbers/counts or explicit completion criteria for the test revision task.

1. Deno-based ("isolated") plugin execution runs only when an explicit opt-in environment flag enables it — no automatic or homegrown detection substitutes for that flag — and by default the plugin host stays disabled/on the trusted (Node) profile.
2. The default trusted (Node) plugin-host path builds and runs successfully.
3. The tests already covered by the prior research are revised: tests asserting incorrect behavior are fixed, redundant tests are removed, and tests that can be simplified are simplified.

**V3-outcomes-measured** — 8/8 (2, 2, 2, 2). The goal precisely matches the three asks (Deno opt-in flag ban, node-launch verification, and full test-suite revision) with concrete measurable flags and counts.

1. Deno builds or runs only when both explicit env flags are set (the app: `MAGNIS_PLUGIN_HOST_PROFILE=isolated` plus `MAGNIS_DENO_PLUGIN_HOST_PATH`; tests: `MAGNIS_TEST_ISOLATED_PLUGIN_HOST=1` plus `MAGNIS_DENO_PLUGIN_HOST_PATH`) — no script, CI step, or doc left in the repo can build or start it any other way.
2. The plugin-host node actually started in every launch shape (local, desktop, hosted, CI tests) is confirmed correct: `trusted` (bun self-spawn) by default everywhere, `isolated` (Deno) only where the hosted stack sets the flag pair explicitly, with the node starting cleanly wherever each profile is exercised.
3. All 376 backend test files (`backend/test/**/*.test.ts`) are reviewed against the code they test: each test found to assert a false claim is corrected, each redundant or duplicate test is removed or merged, and the full backend suite still passes afterward.

**V4-asks-first** — 8/8 (2, 2, 2, 2). The goal maps directly to the requested opt-in Deno gating, cleanup of leftover always-on Deno code, and a test-suite revision, with observable pass/fail and presence/absence conditions for each point

1. With no environment flag set, the Deno-based plugin host never starts or builds at all; it runs only when the owner explicitly sets that one optional flag — the choice is never made automatically.
2. Running the project's standard build and test gate with no Deno flag set finishes with zero build or startup failures, on Bun as the sole default runtime.
3. With the opt-in flag explicitly set, the isolated Deno-based plugin host still starts successfully and its tests still pass.
4. None of the code or configuration left over from the old always-on Deno setup remains anywhere in the repository.
5. Every test remaining in the backend suite asserts something true and is not a duplicate of another test's coverage; none were found to be redundant or simplifiable without being fixed or removed.

**Approved Goal:**

After the merge, one push to a backend branch costs **1 500 test-seconds
of backend suite on the CI runner instead of 2 301**, and the four shards
finish in **3.5 minutes of wall time instead of 5.5**, with every test still
proving a behaviour a caller can observe. Measured the same way as today:
the sum of per-test durations in the `Backend tests (shard i of 4)` job
logs, and the wall time from the workflow's first job to `CI gate`.

Three numbers that must hold on the day this merges:

- backend test-seconds per CI run: 2 301 → **≤ 1 500**;
- CI wall time to green: 5.5 min → **≤ 3.5 min**;
- tests that pin structure instead of behaviour (a file exists, a string
  appears in source, a hand-kept list, `true` equals `true`, a status the
  test itself wrote): **0**, down from 23 whole files and about 35 cases.

Every GitHub action in the workflows runs on Node 24, so the runner prints
no deprecation warning.

---

## dataset-dump-orchestrator

**Owner, last message:** покажи как ты планируешь реализщовать класс и существенно сокрашщение кода в сервисе, которые экспори рует данные в датасет путем реализации нового интерйефса. Мне кажется, что ты пошел нетуда

**V2-outcomes** — 6/8 (2, 2, 1, 1). Covers the three asks well but lacks concrete numbers/counts for the interface migration and merge verification, leaving completion criteria somewhat fuzzy.

1. Stage 3 (the types-and-constants sweep) ships and merges as its own pull request, completed before the Dataset work begins.
2. The service(s) that export data into the dataset implement the new shared snapshot interface in place of their hand-written export/import code, substantially cutting the code in those services.
3. document.ts's size limit, and any split off it (such as the invariants block), is justified solely by the plan's single file-size ceiling of 1200 lines, replacing the now-invalid 500-line rationale.

**V3-outcomes-measured** — 5/8 (1, 1, 2, 1). The candidate presents verified metrics for the dataset consolidation and 500 vs 1200-line ceiling but doesn't actually show the class design or new interface implementation the owner explicitly asked

1. `backend/src/services/dataset` — verified today at 20 files and 4,543 lines — reaches the dataset-service-simplification plan's own approved target of 5 files (`dataset-document.ts`, `dataset-time.ts`, `dataset-schema-annotations.ts`, `dataset.service.ts`, `dataset.module.ts`) totaling ~1,020 lines.
2. `document.ts` and `document-invariants.ts` — currently 2 files (304 + 410 = 714 lines) held apart by the capability's own 500-line structural test (`tst_bts_dataset_structure_001`), a split the plan's Decision R18 and the repository's general 1200-line ceiling (`docs/backend/nest-architecture.md:470`) both call for ending — are governed by one stated ceiling instead of two disagreeing numbers.

**V4-asks-first** — 8/8 (2, 2, 2, 2). The goal captures all three asks—merge Stage 3 first, fix the invariants file's stated ceiling to 1200, and get owner sign-off on the interface/class/line-reduction design before further stages—each s

1. Stage 3 of the dataset-service-simplification plan ships and merges as its own pull request before work resumes on any stage after it.
2. document-invariants.ts's stated reason for sitting apart from document.ts cites the single correct ceiling of 1200 lines, replacing its current claim of a 500-line limit.
3. Before any code for the stages after Stage 3 is written, the owner has reviewed and confirmed a specific design — the new interface, the class implementing it, and the exact number of lines it removes from DatasetService.

**Approved Goal:**

**Currency: deleted lines under the export/import machinery, and fence entries
returned.** Every stage pays a stated share; its receipt records the measured
payment.

- **3 308 → ≤ 1 450 lines** across the five capabilities' export code, the
  orchestrator, and `core/snapshot.ts`. The pass line comes from the target
  tree's own arithmetic, not from a round number: 260 (orchestrator) + 400
  (machinery) + 770 (five transferables) = 1 430, and the 20 lines of slack are
  the estimate's, stated rather than hidden. The stage ledger is the second,
  independent estimate and lands nearby rather than exactly: +60 in Stage 1,
  then −340 −700 −420 −450, which is 1 456 from the same baseline. Two
  estimates 26 lines apart is what estimates do; the pass line is the `wc` at
  close, not either of them — the last counted because moving work
  into it is not shrinking. Measured by the command in
  [Today](#today-measured-against-that).
- **Eight methods per capability → three.** A capability declares five facts
  and implements `export`, `import`, `validate`. The four ceremony methods —
  allocation, the object list, key validation, three constant getters — stop
  existing, because they are functions of the declarations.
- **Five fence entries returned, none spent: 35 → 30.** Counted in
  `backend/eslint.ratchet.json`, not from memory — the four participants
  (`episodes-snapshot.participant.ts`, `groups/snapshot.ts`,
  `identity/snapshot.ts`, `memory-snapshot.participant.ts`) plus
  `w

---

## episodes-canonical-service

**Owner, last message:** .claude/skills/blueprint Смотри, мы занимаемся отстройкой всякого рода вещей по улучшениям сервисов после перехода с Rust на TypeScript: https://github.com/0xmikko/magnis-app/pull/159. Сейчас работает агент, он только-только ещё выносит все типы и прочее, но я бы хотел тебя попросить заняться сложной проблемой, на которую мы можем сделать очень глубокий research и вообще понять как нам правильно и идеоматически сделать nest сервисы, покрыть тестами и так далее. Изучи пожалуйста все планы которые есть в этой папке, пойми изначальный план, в чем он состоит, структуру и так далее. После этого сде

**V2-outcomes** — 6/8 (2, 2, 1, 1). The goal captures rework, cleanup, tests, and frontend verification as requested, but lacks concrete numbers/counts (e.g. no test coverage target, no defined 'done' criteria for canonical/idiomatic), 

1. The episodes service (`backend/src/services/episodes/` and the core/transport code it owns) is reworked into an idiomatic, canonical NestJS service.
2. Unnecessary leftover code in the episodes service is removed.
3. The episodes service is covered by tests.
4. The frontend is confirmed to still work correctly against the episodes service after the change.

**V3-outcomes-measured** — 6/8 (1, 1, 2, 2). The candidate is precise and testable but the conversation asked for a deep research-driven idiomatic NestJS overhaul of the episodes service (removing cruft, canonical structure) whereas the goal nar

1. The episodes backend's structural guard (`tst_bts_episodes_structure_001` in `backend/test/tst_bts_episodes_structure.test.ts`, covering all 28 files under `backend/src/services/episodes/`) reports zero violations throughout, and the shared `denyUnknownFields`/`.strict()` mechanism it and `memory`, `groups`, `identity` all reuse — which today makes `tst_bts_episodes_snap_031` fail (expects "unknown field", gets zod's default "Unrecognized key(s)…") — is corrected once at its one shared definition, not patched separately inside episodes.
2. All 8 existing episodes test files plus any test added for a changed behavior pass together in one `bun run check:backend` run at the end of the work.
3. Every current caller of the episodes surface keeps passing without its own code being changed: the 4 `test-e2e/episodes-*.spec.ts` specs, the 3 CLI hooks (`useEpisodeTodo`, `useEpisodeUsage`, `useEpisodeRegionCounts`), and the frontend/CLI files that import episode-related types from `@magnis/client-core`.
4. No file already inside the parallel de-rust-typescript agent's open work or the colleague's client-core SDK standardization is edited by this effort; any overlapping cleanup found along the way is recorded as deferred instead of duplicated.

**V4-asks-first** — 5/8 (1, 1, 2, 1). The candidate invents precise but unverifiable numbers (29 docs, 28 files, 4,066 lines, 123 references) not present in the conversation, which reads as fabricated specificity rather than owner-request

1. Before any change lands, the owner has a written account of what idiomatic NestJS service design and test coverage look like in this codebase, grounded in its own existing patterns.
2. The owner sees confirmation that all 29 documents in docs/plans were read, with the original migration plan (de-rust-typescript.md) and its stage structure correctly summarized.
3. The owner sees the episode service — all 28 files, 4,066 lines under backend/src/services/episodes — finished, with no file left half-reworked.
4. The owner sees every file in backend/src/services/episodes pass the repository's own structural test (tst_bts_episodes_structure.test.ts) with zero violations, and no Rust-port duplication or dead logic left behind.
5. The owner sees that nothing the parallel type-extraction agent or the colleague's shared-SDK work already removes or standardizes gets rebuilt here — any such gap is recorded as a deferred item for after those merge, not duplicated.
6. The owner sees the full backend gate (bun run check:backend) pass green with zero new failures after the episode service rework, despite the size of the change.
7. The owner sees the 123 frontend and client-core files that currently reference episodes still build, type-check, and pass their tests against the reworked service and the parallel agent's changes.

**Approved Goal:**

Build the backend's canonical Agent execution core and make Episodes its
durable working memory. The Agent is the CPU: it accepts work from a user or a
trigger, assembles the smallest sufficient workspace, runs one of three Agent
implementations, commits effects and remains the owner across `idle`, `active`
and `needs_input` until the Episode itself is closed. Graph is long-term memory; an Episode is one durable short-term
reasoning chain and is also a Graph entity; Triggers are work sources;
the AI Models component is a hidden compute peripheral used only by
`MagnisAgent` through its narrow `LLM_RUNTIME` port.

This plan deliberately removes both **Engine** and the ambiguous generic
**runtime** from the Agent abstraction. Magnis, Codex and Claude are three
implementations of the same `AgentAdapter` port. Codex and Claude own native
loops and sessions; Magnis owns the in-process loop and calls
`LLM_RUNTIME` when it needs an LLM. Provider, local/remote routing, credentials,
pricing and the private `CreditService.authorize/charge` path remain behind
AI Models and are not concepts in Agents or Episodes. Reservation and
settlement are removed rather than renamed.

Measured outcomes:

- **One Agent CPU.** `AgentService` owns every long-lived Episode-agent and
  continuously manages the set whose durable state is `active`. User messages
  address one existing Episode; every Trigger firing creates a new child
  Episode. Both enter the same Agent loop only after those distinct ingres

---

## fix-agents-blueprint

**Owner, last message:** откатываем все и пишем план по /blueprint с учетом помих пожеланий и bug который ты нашел

**V2-outcomes** — 6/8 (2, 2, 1, 1). The goal captures all four asks (isolated instance, agent/skill/MCP bug fixes, Models tab regression, plus menu behavior) without adding scope, but lacks concrete numbers or specific pass/fail criteri

1. The owner has an isolated Magnis instance to smoke-test the Codex and Claude Code agents, running independently of the other Codex instance currently fixing Telegram loading.
2. Codex and Claude Code load the correct models, the correct agent, and only this project's own skills and MCP servers — with each bug the owner reports from smoke testing tracked and fixed.
3. The Models settings tab again lists the full ai-models service catalog, not just the models scoped to the built-in Magnis Agent.
4. The chat composer's "+" menu offers the agent/model choice before a chat starts, and narrows to model-only choice once the chat has started.

**V3-outcomes-measured** — 6/8 (2, 2, 1, 1). The goal captures the isolated smoke-test environment, agent bug fixes, models page restoration, and chat plus-menu behavior without adding scope, but it lacks concrete numbers/counts or explicit drif

1. Smoke testing of the Codex and Claude Code agents runs in its own worktree/branch, separate from the worktree currently fixing telegram loading, so the owner can test both agents without the two colliding.
2. Every Agents defect the owner reports while smoke testing — an agent offering the wrong model list, the wrong Agent list, or a skill/MCP server that belongs to another project — is fixed, so Codex and Claude Code each show only this project's own models, Agents, and skills/MCP servers.
3. The Models settings page again reflects the full catalog the ai-models service manages, instead of being limited to only the models enabled for the Magnis Agent.
4. The chat's "+" menu again offers both Agent and model selection before a chat has started, while a chat that has already started keeps offering only model selection, unchanged.

**V4-asks-first** — 7/8 (2, 1, 2, 2). Covers all stated asks with measurable, checkable outcomes, but adds specifics (e.g., 'same starting questions as before the port', fixed-agent-after-first-message rule) beyond what the owner explicit

1. The owner can run this project's Codex and Claude Code work in an instance separate from the other running Codex process (the one fixing telegram upload), with both running at the same time and zero conflicts between them.
2. The owner can open and use this separate instance themselves, without needing anyone else to run it, to try each Agent directly and note what is still broken.
3. When using Codex or Claude Code, every skill shown belongs to this project only — zero skills from another project appear.
4. When using Codex or Claude Code, every MCP connection shown belongs to this project only — zero MCP connections from another project appear.
5. Codex and Claude Code open a new chat asking the same relevant starting questions they asked before the Rust-to-TypeScript port, not irrelevant ones.
6. Each Agent (Magnis, Codex, Claude Code) offers the correct, complete list of models it can use, drawn from the single existing AI Models service as its one source.
7. The full, correct set of Agents (Magnis, Codex, Claude Code) appears everywhere an Agent is chosen — none missing, none wrong.
8. The Models settings tab again lists and configures models for every Agent (Magnis, Codex, and Claude Code), not only the Magnis agent.
9. In a chat with no messages yet, pressing the composer's + button lets the owner choose both the Agent and the model.
10. Once a chat has at least one message, pressing the composer's + button offers only the model choice — no Agent choice is offered, 

**Approved Goal:**

Restore Agent and model selection after the TypeScript migration, through the existing AI Models service, with local acceptance evidence the owner can inspect.

The delivered behavior is:

1. Settings **Models** contains only Magnis language models, grouped by their actual provider connections, including local Ollama.
2. Before the first message, **+ → Agent → model** selects a draft pair. After creation, the Agent is fixed and **+ → Model** lists only its models.
3. Effort, Thinking and reasoning budget are separate controls derived from the exact model and execution route. A small muted Agent/model/reasoning caption sits **below the input border**.
4. The selected configuration reaches execution and survives Episode reopening without changing global defaults or another chat.
5. Codex and Claude use their own catalogs and intended skills/MCP. Questions, read tools and delayed write approvals survive the actual native lifecycle.
6. Saved Ollama addresses, credentials, model mappings and defaults are preserved. A clean smoke database is not presented as recovered personal configuration.
7. A user browses the **full Ollama library inside Magnis**, selects a family and variant, and clicks **Download & add** without typing a tag. Only verified installation and registration make it usable in Magnis.

Success is measured by completed local acceptance stories, actual request/state receipts and a gallery of real frontend screenshots. Test count and a successful build are not product 

---

## graph-service-refactoring

**Owner, last message:** pls conitnue - the blueprint phse

**V2-outcomes** — 6/8 (2, 2, 1, 1). The goal faithfully captures the PR-159 fixes, the Graph/Search boundary, and the single-PR scope without adding extras, but lacks concrete counts or checks (e.g., no specific file/naming targets) nee

1. The Graph module (backend/src/services/graph) is refactored to fix the problems flagged in PR #159 — too many files, inconsistent naming, leftover/excess logic, and non-idiomatic NestJS code — each one resolved.
2. The refactored Graph module implements Magnis's authoritative typed graph — Entity, Link, provenance, actor/audit, lifecycle, and module-owned contracts — exposing only deterministic operations on Entities and relationships whose identity the caller already knows; identity discovery and relevance-ranking stay excluded, as Search's responsibility in a separate effort.
3. The work ships as a single PR titled "Graph Service refactoring," scoped only to Graph's architecture and refactoring, with no changes made to Search.

**V3-outcomes-measured** — 5/8 (1, 1, 2, 1). The goal is highly measurable and specific but invents precise numeric targets (41→16 files, 8,768→5,700 lines, 1,200-line ceiling) not evidenced in the conversation, and omits the broader asks (modul

1. services/graph shrinks from today's measured 41 files / 8,768 lines to the documented 16-file / ~5,700-line target tree, with no file exceeding the 1,200-line ceiling.
2. Every file in services/graph is named for its single export: the 7 files currently suffixed `helpers`, `tokens`, `runtime` or `error` (e.g. `graph-batch.helpers.ts`, `link-contract-registry.error.ts`, `runtime-link-contract-registry.ts`) are gone.
3. The Rust-ported DI ceremony is replaced with idiomatic NestJS wiring: `GraphRootModule`, the `GRAPH_NATIVE_CONTRACTS` injection token, and the four single-implementation store interfaces (`EntityStore`, `LinkStore`, `EventLog`, `SchemaCatalog`) go from present today to zero references anywhere in the repo.
4. The Graph/Search boundary becomes structural: the 10 search-only files currently mixed into services/graph (`graph-search-sql.ts`, `graph-search.repository.ts`, `search-decl-parse.ts`, `search-declaration.ts`, `search-declared.ts`, `search-registry.ts`, `search-resolve.ts`, `search-tool-defs.ts`, `search-tools.ts`, `search-wire.ts`) move out, leaving services/graph holding only operations over already-identified Entity and Link data.

**V4-asks-first** — 4/8 (1, 1, 1, 1). The candidate invents specific numeric targets (16 files, 5,700 lines, 45 files, 8,240 lines) not present anywhere in the conversation, fabricating measurability rather than deriving it from the sourc

1. The plan's tasks and files sit only inside Graph's own module, with zero tasks naming Search's discovery or ranking capability.
2. The problems the plan sets out to fix match exactly what PR 159 already recorded for Graph — a starting count of 45 files and about 8,240 lines in `services/graph/` — with none added beyond that record.
3. This phase's deliverable is one written specification of the Graph transformation, containing no test-environment or test-setup section.
4. The specification states the exact shape Graph reaches once transformed: 16 files and about 5,700 lines, down from the current 45 files and about 8,240 lines.
5. The specification names a fix for each of the four flagged problems: the file count, the name of every surviving file, the logic being dropped as excess, and the code no longer carrying Rust-shaped structure but Nest's own module/provider shape instead.
6. The specification's problem list and target tree match the notes already handed over from the other agent, with nothing in them re-derived from scratch.
7. The pull request carrying this work is titled, word for word, "Graph Service refactoring."
8. The specification names Graph as the one authoritative home for five kinds of data — Entity, Link, provenance, actor/audit trail and lifecycle state — and limits every Graph operation to entities and relationships the caller already identifies.
9. The specification draws exactly one boundary rule: a caller that already knows an Entity's identity is 

**Approved Goal:**

Graph becomes the authoritative, typed persistence boundary for already-known
Magnis entities and relationships. Identity discovery and relevance belong to
Search. The currency is the size and safety of the Graph-owned surface:

- Reduce the Graph-owned implementation from **31 files / 6,170 lines** to
  **13 files / at most 5,200 lines** after the Search-owned files have moved in
  the parallel Search plan. At least 18 Graph satellites and 970 lines leave.
- Reduce `GraphService` from **57 public async methods** to **at most 20**
  known-identity operations. No `ForUser` twins, unscoped variants, name
  search, relevance, index-state mutation, or repository-shaped pass-throughs
  remain.
- Reduce `GraphModule` from **8 exported providers** to **2**:
  `GraphService` and `GraphContractRegistry`. All five repositories remain
  internal class-token providers.
- Reduce the seven known mutation paths that can commit a projection without
  its event (or an event without its final projection) to **zero**. Entity,
  link, hypothesis, batch, and merge writes commit with actor/provenance/audit
  in one PostgreSQL transaction.
- Reduce caller-side ownership preflight followed by an unscoped mutation to
  **zero**. Every ID-addressed Graph operation takes `userId` at the service
  boundary and gives missing, foreign, and archived records the same
  non-disclosing result.
- Reduce Graph-to-Search runtime dependencies to **zero**. Graph commits
  authoritative state only; the parallel Ind

---

## graph-substrate-bench

**Owner, last message:** Base directory for this skill: /home/dev/.claude/skills/blueprint  # Blueprint  Produce one plan at docs/plans/<slug>.md. This skill is repository-agnostic: project commands come only from package.json scripts named agent:*, and all plan mutations go through planctl.  ## SPEC  1. Create feat/<slug> from origin/staging in its own worktree. Run:         planctl init docs/plans/<slug>.md --title "<title>"     Commit the plan immediately. 2. Explore existing code before proposing new mechanisms. Agree on the Goal,    user flows, success metrics, constraints, reuse and testable invariants. 3. Write

**V2-outcomes** — 6/8 (2, 2, 1, 1). The Goal captures all four asks without adding scope, but lacks concrete numbers/counts and clear done/drift signals for phases like profiling and the self-improving loop.

1. The July search-benchmark research comparing Magnis's graph-based search against plain search tools is restored, runs again on the current codebase with real data, and the existing evaluation work behind it is put in order.
2. A self-improving search loop — the agent forms hypotheses and uses them to search better — runs end to end for the first time, rather than as unfinished pieces.
3. Profiling produces a quantified measurement of how much Magnis's graph-based search exceeds plain search tools, and that measurement is used to improve the product's search metrics.
4. The benchmark and its results are published on Magnis in Python notebook format.

**V3-outcomes-measured** — 5/8 (1, 0, 2, 2). The Goal is precise and testable but invents specific artifacts (exact PR numbers, file paths, dates) not present in the conversation and omits the broader asks (research loop that improves itself, Py

1. A written inventory states, for each of the three existing graph-vs-flat search studies — the July 26, 2026 `prepared-context-benchmark` run (PR #90), the unexecuted `P1–P5 Synthetic Graph Advantage Study` plan, and the August 22, 2026 `Typed Search retrieval ablation` (PR #193) — whether its harness still runs unmodified against this commit's TypeScript backend, and exactly what fails where it does not.
2. At least one of the two existing benchmark harnesses (`cli/src/runner/paired-mcp-proof.ts` or the search-ablation CLI/service) completes one full run against real ingested workspace data instead of the synthetic P1/P235 fixtures, producing one freshly dated, checked-in result file with graph-based versus flat/direct retrieval metrics that becomes the current baseline, replacing the stale July 26 and August 22 numbers.

**V4-asks-first** — 7/8 (2, 1, 2, 2). Covers all conversation asks with measurable, verifiable outcomes but item 2's checksum-verification and item 4's exact percentage-point margin on real data add specificity beyond what the owner expli

1. The owner can run the July 2026 search/graph-substrate benchmark (published in PR #90, commit `21b00bcee`, dated 2026-07-26) start to finish against today's TypeScript backend and get one complete, dated result, whereas today it has not been re-run since the backend's Rust-to-TypeScript rewrite.
2. The benchmark's reference corpus is verified and internally consistent, with its checksums matching exactly, instead of resting on today's single, unverified 2026-07-26 seed.
3. The search-quality metrics tracked by the July benchmark and the closed typed-retrieval ablation (pass rate, tool calls, tokens, NDCG@10, forbidden hits) show a recorded improvement over their currently recorded baseline numbers.
4. A published, quantified result states exactly how many percentage points, or an equivalent measured margin, Magnis's graph-based search beats an equally-provisioned flat/ordinary search baseline on real data, not only on the existing synthetic corpus.
5. The benchmark loop runs against real data, and the agent's own generated and tested search hypotheses appear in the run record as a counted list, rather than zero as today.
6. At least one full cycle of benchmark, analysis, product change, and re-benchmark completes end to end with before-and-after scores recorded, closing the gap where today many stages exist but no cycle finishes.
7. All eval scoring and orchestration for this work runs through the Python `evals` package, and none of this eval traffic passes through the Axi

**Approved Goal:**

Magnis search — above all the agent's search over Magnis — is **10× better
than ordinary tools**: the vendors' own Gmail, Telegram and X servers plus a
capable agent with a shell and time to prepare.

Checked on the July business questions:

| question | wrong answer looks like |
|---|---|
| P1 — where does this person work now, when four accounts share no field? | the old employer |
| P2 — what did winning this account cost, with the rows? | a total short by a leg |
| P3 — who wrote to us and never got an answer on any channel? | someone answered on Telegram listed as ignored |
| P5 — do we already know anyone at this company, and whose relationship? | "nobody" |

The standard holds on a question when Magnis answers exactly, with evidence,
inside the budget, and the ordinary agent either fails inside the budget or
needs 10× the tool calls.

Today: one July pilot, one seed, Codex, 60 calls. Magnis 4/4, ordinary 1/4;
fewer calls by 20× (P1), 15× (P2), 2.7× (P5); P3 a tie. Standard holds on 2
of 4. The pilot's harness is on a dead branch and cannot run on today's
product.

**This plan, v1:** a thin Python library, one notebook, and the same test as
July run once on today's product — the baseline. Nothing else: no product
change, no hypothesis work, no diagnosis tooling. Those follow, gated by
this baseline (the hypothesis list and the research behind it:
[search-loop research note](http://u3775:6420/marketing/search-loop-research-2026-09-09)).
P4, the exact-key control, waits f

---

## hermetic-test-runner

**Owner, last message:** Слушай, отличная первая цель, но помимо этого я сделал бы цель вынести PG Lite из backend. И правильный момент. Вторая история – это ускорить выполнение тестов и эволов, потому что если теперь тесты сами управляют тем, как мы запускаем PG Lite и сколько делать параллельно копий, когда их стирать и так далее, мы можем добиться некоторой оптимизации. И наконец третье, сделать возможность использовать frontend как часть того, что доступно мне в Python блокнотах. То есть я же могу тоже создать какой-нибудь датасет, могу его загрузить в Python блокнотах, например. Это же у нас стандартный тумбл. Во

**V2-outcomes** — 6/8 (2, 2, 1, 1). The candidate captures all three PR 202 asks without adding scope, but lacks concrete numbers/thresholds (e.g., speedup target, parallelism count) that would let an agent detect completion or drift ob

1. The backend no longer implements or depends on any database engine — it only accepts a database URL to reach one — and PGlite exists solely in the dev/test build, never in the local or server build.
2. Tests and evals run faster because they start, run in parallel, and clean up their own PGlite instances on their own schedule, instead of that lifecycle being handled automatically for them by shared backend code.
3. The existing `eval` command can run a database-backed query and return the result to stdout without starting a full server, by adding a database configuration to `EvalConfig` — making it usable as a stand-alone runner, including from Python notebooks.

**V3-outcomes-measured** — 6/8 (1, 1, 2, 2). Goals 1 and 2 are well specified and measurable, but the third promises eval stdio/notebook integration whose scope (Python notebook usability, dataset creation) goes beyond and doesn't fully match th

1. PGlite is fully out of the backend: today 15 files under `backend/src` reference `PGlite` (including the ephemeral-database path in `db/bootstrap.ts` that production, tests, and eval all import); after this work, `backend/src` has zero `PGlite` references and the backend only ever accepts a database connection URL.
2. Tests and evals control PGlite instance count and cleanup themselves instead of going through the backend: today `backend/test/harness/shared-database.ts` forces every `bun test` process onto exactly one shared PGlite instance opened via the backend's own `createEphemeralDatabase`; after this work, tests and evals create and tear down as many PGlite instances as they choose, on their own, independent of the backend.
3. The `eval` command can run a single request against a caller-supplied database and return its result over stdio instead of only writing to `--out`: today `eval-runtime-config.ts` builds no `database` config group (eval always creates its own throwaway PGlite); after this work, `eval-config` accepts a database config that lets `eval` run that way without entering server mode, so it is callable from a Python notebook.

**V4-asks-first** — 8/8 (2, 2, 2, 2). The candidate goal captures all the PR 202 asks (PGlite removal, no test-mode flag/eval reuse, parallel test runner, unchanged launch command, faster tests, notebook usage, Tauri exclusion) with concr

1. Outside the dev/test build, the backend holds zero direct references to PGlite (down from 16 files today) and only ever receives a ready-made database connection string, never knowing or caring how that database was started.
2. No backend file carries a global test-mode flag, and no test-specific controller or endpoint exists in the app (down from 5 files today); any test-specific control runs through the existing eval command instead of a new one.
3. A separate test runner can create and independently tear down at least four isolated database instances at the same time, and none remain running once a test or eval run ends.
4. The launch command the owner already relies on today keeps working exactly as it does now, unchanged by the simplification.
5. The backend test suite, which takes about 370 seconds today, finishes in half that time or less because the runner, not the backend, decides how many database instances run in parallel and when they get cleared.
6. From a Python notebook, the owner can ask for a dataset to be built or an agent to be run and get the result back directly, without the app ever starting in server mode.
7. This plan contains no Tauri or desktop-packaging work — that has been split out into its own separate plan (PR 200), while this one (PR 202) covers only the database and test-runner simplification.

**Approved Goal:**

This plan pays three outcomes through one strict ownership boundary:

1. **PGlite leaves the backend.** Every Magnis backend launch receives an
   external PostgreSQL URL. Server and packaged desktop builds use real
   Postgres; only the development/test runner may import or start PGlite.
2. **Tests and evals gain explicit, measurable parallelism.** PGlite lives in
   disposable child processes. The caller chooses how many workers exist and
   which run receives each worker; the plan then reports the actual green
   wall-clock result before and after, without inventing a required speedup.
3. **A complete Magnis stand becomes usable from a Python notebook.** A
   researcher can pin a dataset, explicitly create four PGlite workers, map
   four model configurations onto them, run the variants concurrently and
   open the frontend for any selected worker.

There is no hidden pool, lease queue, scheduler, singleton runner or
`test-runtime` module in Nest. The caller first starts N visible
`PGliteWorker` instances, then starts one `MagnisRunner` against each chosen
worker. The relationship is explicit and 1:1; a runner never creates, selects
or replaces a database.

The backend never needs to know that the URL belongs to PGlite. The existing
`EvalConfig` gains a required `database: DatabaseConfig`, and
`magnis-server eval` stays a bounded command: start normal Magnis against that
database, perform one request, emit one JSON result to stdout and exit.

**Currency: green backend test

---

## install-by-sources

**Owner, last message:** (Re-invocation of /blueprint — the skill instructions were previously loaded; the arguments or dynamic output below are new.)

**V2-outcomes** — 6/8 (2, 2, 1, 1). The candidate captures the requested paradigm shift accurately without adding scope, but lacks concrete, testable specifics (e.g., which UI screens, dependency resolution logic, or how required/source

1. In the installation wizard, the admin picks only which Sources to install — there is no separate step for picking modules.
2. Every module a chosen Source requires is installed automatically from that choice, with no separate module selection by the admin.

**V3-outcomes-measured** — 8/8 (2, 2, 2, 2). The goal directly matches the requested paradigm shift (sources drive module installation, no separate module step) with concrete, verifiable outcomes.

1. The installation wizard's separate "modules" screen is removed: the admin's step count drops from 4 to 3 (name, sources, model), with no independent module checkboxes anywhere in the flow.
2. Every module a chosen Source requires installs automatically with it — before, the admin ticked modules and sources as two independent lists; after, picking a Source is the only module-affecting choice, and the installed module set is exactly what the picked Sources require.

**V4-asks-first** — 8/8 (2, 2, 2, 2). The candidate goal directly captures the requested paradigm shift (source-only selection, module derivation, no hardcoding, 3-step wizard) with concrete, checkable conditions and no extraneous scope.

1. On the workspace installation screen, the admin picks from exactly one list — data sources — with no "required" checkbox and no per-module "source" field left to puzzle over, because modules are no longer offered as separate items to pick.
2. What the installation screen tells the admin about a chosen source is plain — this source needs these modules — not the channel's curation judgment, so the earlier confusion over that word has nothing left to attach to.
3. The modules installed for a chosen source always equal what the channel's own published data lists for that source, with zero hardcoded module-per-source lists anywhere in the code.
4. The installation wizard has 3 steps (name, sources, model) instead of today's 4 (name, modules, sources, model), and a finished installation leaves active exactly the modules the chosen sources require plus the workspace's always-installed set — nothing more, nothing less.

**Approved Goal:**

Installing a workspace asks three questions: what it is called, which accounts
it pulls from, and which model searches it. It does not ask which modules to
run — that answer is already published: every account names the modules it
feeds, and every module names what it needs. The server reads that and
installs the set.

Nothing on any screen is named or drawn by the product. The catalog publishes
a title, a summary and an icon for every package, before and after
installation, and the screens show exactly those. No map from an id to a
brand, a glyph or a name survives anywhere in the app.

---

## launch-assembly

**Owner, last message:** Внимание, стажинг извинился, скачайте последнюю версию. Дальше ночной режим, я не смогу ответить. Работаем до исполнения плана без остановок и вопросов.

**V2-outcomes** — 6/8 (2, 2, 1, 1). The goal captures sync/rebuild, completing all 6 stages unchanged, and a DRY/SOLID review, but lacks concrete measurable/verifiable checkpoints (e.g., what 'rebuilds cleanly' or 'stage complete' means

1. The branch is synced with the latest `staging` — including its SDK-related type moves — and rebuilds cleanly, so remaining work continues from the current, up-to-date state.
2. The approved `idiomatic-foundation` plan reaches all 6 stages complete (Stages 4–6: billing, dataset, close), with its already-approved scope left unchanged.
3. A short DRY/SOLID review of the current implementation is produced, giving the owner a clear read of what's built against the plan to present.

**V3-outcomes-measured** — 8/8 (2, 2, 2, 2). The candidate translates the owner's demand to finish all 6 stages without deviation into concrete, numeric file/line/gate targets for stages 4-6 plus the required ledger update, matching the conversa

1. Stage 4 (billing) is executed: `backend/src/services/billing/` shrinks from its current 12 files (~2,601 lines, including `metering.service.ts`, `spool.ts`, `seed.ts`, and the credit/HTTP helper satellites) to the plan's 5-file shape (module, service, repository, controller, `types.ts`, ~2,320 lines), and the billing suite passes with no database.
2. Stage 5 (dataset) is executed: `backend/src/services/dataset/` shrinks from its current 19 files (~4,529 lines, including the `dataset-service.types.ts` satellite) to the plan's 10-file shape (~4,300 lines), and the dataset suite passes with no database.
3. Stage 6 (close) is executed: the three gates the plan flips — zero `*.types.ts`/`*.schema.ts`/`*.tokens.ts` satellites under `services/`, the named-constant location pin, and the src→test zero-import pin — each fail on a planted violation and pass clean, and the closing `bun run check:backend` wall-clock is recorded at or below the opening one.
4. `docs/plans/README.md`'s idiomatic-foundation ledger row and this plan's verdict section are updated to record all 6 stages as done, including Stage 3's wave-2 merge (PR #179) that the row does not currently mention.

**V4-asks-first** — 7/8 (2, 1, 2, 2). The goal covers essentially every ask across the conversation and is concretely measurable/executable, but it adds extra granular commitments (e.g. explicit zero-code-change confirmation on merged sta

1. The owner has a plain yes/no verdict on whether the idiomatic-foundation redesign is more complex than the code needed, with every cited complexity point either justified or removed.
2. The owner has the concrete reason recorded for why the code was redesigned instead of patched.
3. The owner has a stage-by-stage count of what the idiomatic-foundation plan's 6 stages actually deliver right now — done items versus open ones, matching the plan ledger on disk.
4. The owner has a short written review listing every DRY and SOLID violation found in the affected code, or stating plainly that none remain.
5. The owner holds a written plan for finishing the plan's remaining stages, ready to hand off for execution today with no further design discussion needed.
6. The owner confirms the plan's already-merged stages carry zero code changes from the review or from the remaining work.
7. The owner sees the affected code with every duplicated mechanism collapsed to one owner — zero duplicate copies left standing.
8. The owner sees the code that was unmanageable now passing the project's full backend check gate end to end.
9. The owner sees all 6 stages of the idiomatic-foundation plan recorded as done in the plan ledger.
10. The owner has the review, the plan, and the stage results ready to present before today, 2026-09-24, ends.
11. The owner sees the working branch carrying every commit from the latest staging branch, including the relocated SDK types, with none missing.
12. The owner

**Approved Goal:**

**The application is extended by DECLARING, never by editing assembly.** A
capability states which launches it belongs to, next to itself, and assembly
never names it. Adding a launch is one interface extending `BaseConfig`, one
arm of a union, and that string appearing in the capabilities that serve it —
no branch, no switch, no per-kind module list to keep in step.

**Assembly is a function of the resolved config.** `assemble(config, …)` is a
filter over declared capabilities, not a hand-written list, so the container a
launch gets follows from what it declared itself to be.

That is what buys the coverage: a suite can stand up exactly the container its
subject needs instead of the whole application. A workspace-export test pays
for the workspace closure and no socket, where today every test that boots
pays for thirty-seven root imports and a bound port.

**Currency: how much of assembly is declared rather than hand-written.**
Measured on `7fab4bd48`, with the unit stated so the same measurement can be
re-run:

| | today | done |
|---|---|---|
| capability modules chosen by the resolved config (of 37 direct root imports) | 1 | all of them |
| dynamic-module declarations — `static forRoot` (12) + `static register` (5) | 17 | 0 |
| executable call sites — `.forRoot(` (14) + `.register(` (5) | 19 | 0 |
| `DynamicModule` literals in `backend/src` | 16 files | 2 (app root, CLI root) |
| direct readers of a config group their launch may not have | 49 | 0 |
| services a command re

---

## link-end

**Owner, last message:** ты можешь добавить нужный API в граф: а я скажу аенту как доделать телеграмм

**V2-outcomes** — 6/8 (2, 2, 1, 1). The goal captures the invalid-marking API and its exposure for Telegram but lacks concrete, verifiable success criteria like specific method names or test counts.

1. The Graph service gains an operation to close an existing link — mark it invalid rather than deleting the row — so a link's history stays intact after it is closed.
2. That closing operation is reachable by module/agent code the same way the Graph's other link operations already are, so the owner can point the Telegram module at it afterward.

**V3-outcomes-measured** — 6/8 (2, 2, 1, 1). Correctly scopes to adding an invalidate-link API on the existing graph-ops surface without extending into telegram module changes, but lacks concrete measurable specifics like method signature, namin

1. The graph gains a callable API to close an existing link by marking it invalid instead of deleting it — today a link can only be added or hard-deleted, with no way to mark one invalid while keeping the row.
2. That close/invalidate capability is exposed through the same plugin-runtime graph-ops surface that already carries add-link and delete-link, so module code (such as the telegram module) can call it the way it already calls those two.

**V4-asks-first** — 7/8 (2, 1, 2, 2). The candidate addresses every question raised (valid/invalid property, closing a link, agent instructions, existing method check, Telegram integration, new API) with measurable checkpoints, but bakes 

1. The owner can see a documented, accurate answer to whether a link already has a valid/invalid property: today only an agent-authored link carries a validUntil end date, while a canonical link carries none.
2. The owner can close any link so it becomes invalid, observable as that link's open-ended validity now having an end.
3. The owner has one written instruction sheet, ready to hand to the agent, naming the exact graph method to call and the exact call to make to close a link.
4. The owner has a confirmed answer, checked before any code is written, that no method to close a link exists yet anywhere in the graph.
5. The owner has a settled decision on how the Telegram module will reach the link-closing capability, with the Telegram-side wiring itself explicitly left to a separate instruction the owner gives later.
6. The graph exposes one new API that closes a link, confirmed by closing one real link through it and reading that link back as invalid.

**Approved Goal:**

A link can end. Today the graph knows when a fact began (`validFrom`) and
can only forget a fact that stopped being true by deleting it; the telegram
module, when a chat drops out of the account's list, calls
`set_link_status(id, "decayed")` — a method the plugin SDK declares and the
host never implemented, so the membership silently keeps holding. After this
plan one verb, `end`, closes a link at a date and keeps the row, for the two
callers that need it: a module whose source says a membership stopped, and
an agent whose reading says a fact stopped. «Who is in the chat now» and
«who worked at Acme in March» both answer from the same rows.

Measured outcomes:

- `GraphService.end` closes an agent link and a canonical link with
  `validUntil`; the row stays; a "current" condition (`valid_until IS NULL`)
  stops returning it; an "as of" condition before the date still does.
- A plugin calls `graph.end_link(id, valid_until)` inside a sync page and
  the link ends under the module's link-write capability, foreign ids read
  as missing — the same gate `delete_link` has. The telegram module's decay
  path has something to call.
- The agent has `link.end` beside `link.add`; ending a canonical link
  through it is refused.
- Nothing is deleted or re-added to end a fact; `set_link_status` stays
  unimplemented and is deleted from the plugin SDK by the module's owner.

---

## plugin-one-module-files

**Owner, last message:** У меня единственный вопрос. Я все смерчу. Спасибо огромное. А ты сделал все файлы каноническими. У нас есть правило, что один классный, один файл, и так далее. Посмотри, пожалуйста, его и проверь все те файлы, которые ты засунул в PR, этот огромный. Соответствуют ли они этому? Если нет, то можно открыть draft и сделать это простую механическую работу.

**V2-outcomes** — 8/8 (2, 2, 2, 2). The goal precisely scopes the one-module-per-file audit to PR #170's files, uses the existing gate, and ships fixes on a separate draft PR as requested.

1. Every `backend/src` file added or modified by the merged extension/plugin-boundary work (PR #170) is checked against the repository's one-module-per-file rule, using the existing `check:one-module` gate, and the owner gets a clear pass/fail list.
2. Any file found in violation is restructured to comply — one class per file, nothing else at top level, no behavior change — until the gate reports zero violations for those files.
3. The fix (if any is needed) ships as commits on a new draft PR, separate from the already-merged #170.

**V3-outcomes-measured** — 8/8 (2, 2, 2, 2). The goal precisely scopes the one-class-per-file audit to the merged PR's files, gives concrete before/after counts, and specifies delivering a separate draft PR as the owner requested.

1. All 225 `backend/src` files that the merged extension-plugin-boundary PR (#170) added or modified are checked against the project's one-class-per-file gate (`cd backend && bun run check:one-module`), which today names 18 of them as violations, carrying 93 of the gate's tree-wide 442 flagged declarations.
2. Those 18 files pass the gate cleanly (zero violations among them), taking the backend-wide count from 442 violations in 114 files down to 349 violations in 96 files.
3. The fix lands as its own draft PR, separate from the already-merged #170, open for the owner's review before it merges.

**V4-asks-first** — 7/8 (2, 1, 2, 2). The goal covers all asks with measurable checkpoints, but the draft-PR delivery for item 4 wasn't clearly requested (owner only suggested it as a possibility) and item 5's push conflicts with the owne

1. The owner sees a plain-English explanation of what `@magnis/eval-worker` is and why the `bun run typecheck:eval-worker` step failed, tied to the exact `EpisodeState.linkedEntities` type error shown in the CI log.
2. That `bun run typecheck:eval-worker` step passes with 0 TypeScript errors.
3. The owner sees a count of how many files added or changed in the large PR violate the repository's "one module per file" rule (a DI-surface file declaring anything besides its class, or any file declaring more than one class) out of the total files touched.
4. Every file in that PR found to violate the rule is split so the same check reports 0 violations among the PR's files, with the fix delivered as a draft PR.
5. Within 8 hours of this request, the owner receives a completed, pushed, ready-to-review PR, produced without the run pausing or stopping in between.

**Approved Goal:**

Every surviving backend TypeScript file touched by PR #170 satisfies the
owner's one-module-per-file rule without changing a plugin, extension, source,
RPC, configuration, or boot behavior.

- The exact PR surface moves from **88 true shape violations in 16 files to
  zero**. The other 109 surviving `backend/src` files touched by PR #170 are
  already clean under the rule.
- The standing census becomes honest: its two intended ESLint rules report
  **435 violations in 110 files** on this base, not 442/114 inflated by seven
  unrelated inline-disable diagnostics.
- With this base held fixed, the whole-tree distance falls from 435/110 to
  **347 violations in 94 files**. That remaining historical debt is not part
  of this plan.
- No wire shape, database query, lifecycle transition, route, provider token,
  or launch membership changes.

Currency: **true one-module violations on the PR #170 file surface**.

---

## process-overhaul

**Owner, last message:** Так же необходимо сказать, что проважность документации, потому что сейчас она не уходит. И хочу получить ответ про то, а правда ли, что условно говоря, нам нужно хранить все эти планы, которые сбиваются. То есть мне кажется, сейчас есть огромный ворох старых каких-то решений, еще с расто и так далее, которые могут ставить агентов в тупик. Так же у нас есть совершенно бессмысленный лонж E2E скилл, который надо выкинуть. И собственно говоря, уже в текущей версии в Package и Sony прописает нормально все команды для старта и развертывания, поскольку мы работаем в монорепозитории front-end, back-e

**V2-outcomes** — 6/8 (2, 2, 1, 1). Covers all raised asks (old plans, stage-based process, permissions-level merge grant, e2e skill removal + docs) without adding unrequested scope, but lacks concrete numbers/thresholds (e.g. what 'min

1. Old planning documents in `docs/plans/` are reviewed: content still worth keeping is preserved, obsolete or confusing material is removed, and the plan records a recommendation on whether historical plans need to keep being retained going forward.
2. Plans are written to a simplified stage-based process: each stage runs only its own minimal set of tests (not the full suite) plus one mandatory test run at the end of the stage, and commits happen only at stage boundaries, not more often.
3. Agents can merge any branch except `staging` and `main`, with that permission granted in the `.claude/permissions.yml` permissions configuration rather than only described in CLAUDE.md.
4. The `launch-e2e` skill is removed, and accurate start/deployment commands for the frontend and backend, including their test variants, are documented together in one visible place for the monorepo.

**V3-outcomes-measured** — 8/8 (2, 2, 2, 2). The goal addresses all four requested items (old plans cleanup, stage-based test/commit process, merge permissions, E2E skill deletion plus command consolidation) with concrete, checkable outcomes and

1. `docs/plans/` (145 files today, 129 of them describing the retired Rust/Cargo backend) is reviewed; plans that no longer match the current TypeScript codebase are archived or deleted, anything still useful is carried forward, and the owner gets a clear answer on whether piling up every old plan indefinitely is worth keeping doing.
2. The plan-writing and plan-execution skills are rewritten so a plan's stages each end with a mandatory, minimal-scope test run (not the full suite) and a commit, with no more than one commit per completed stage.
3. Agents can run `git merge` on any branch except into `staging` or `main` without being blocked or having to ask, with that exception enforced through the permission/hook configuration instead of only as a sentence in CLAUDE.md.
4. The unused long-running E2E launch skill is deleted, and the monorepo's frontend/backend/backend-test start and deploy commands are gathered into one place visible to agents.

**V4-asks-first** — 8/8 (2, 2, 2, 2). The candidate goal translates every request in the rambling conversation (legacy plan cleanup, template with fixed stages, test scoping, per-stage commits, permissions-level merge grant, living docume

1. Every file currently in docs/plans/ has a documented keep-or-delete decision, with any content worth keeping copied out before deletion, so no leftover legacy plan material remains to confuse an agent.
2. New plans follow a short template with a small, fixed number of stages instead of an open-ended list of decisions, and each plan's description of how the goal will be achieved is written before any stage's implementation begins.
3. A single small change no longer triggers the full roughly-2500-test suite; only the tests scoped to that change's stage run.
4. Every plan states its stages explicitly, and one test run is required and performed after each stage before the next stage starts.
5. The commit history shows at most one commit per completed stage, with no extra commits made between stages.
6. An agent merging any branch other than staging or main completes the merge without stopping for a permission prompt, because that permission is granted directly in the permissions configuration rather than only described in CLAUDE.md.
7. Every plan going forward includes a written explanation of what changed and why, kept up to date rather than added only at the end or skipped.
8. The long E2E skill file is removed from the skills directory, leaving zero references to it.
9. One visible file (e.g. package.json) lists the exact run/start/deploy commands for all four monorepo parts — frontend, backend, backend with tests, and the backend's other run variant — so an agent can execu

**Approved Goal:**

Speed up production, cut the owner's time per feature, and raise code
quality. Measurably:

- **Faster stages**: one work commit per stage (scorecard metric 1 ≤ 1.2)
  and a single full-suite run per plan — against today's 1.6 full runs and
  ~6 gate calls per commit.
- **Less owner time**: plans verifiable by a gate (receipts + machinable
  criteria re-run mechanically) instead of by reading; merges unblocked
  feature↔feature so agents stop stalling on a deny rule; lost branches
  surfaced by audit instead of by accident.
- **Higher code quality and typing discipline**: duplication is a
  review-blocking defect measured by a clone scan (metric 6 ≤ 0); every
  stage ships RED-first named tests; typing holds through the per-stage
  typecheck gate and the cop's `any` ban; drift from the plan is caught at
  the stage boundary, not in the owner's review.
- **No poisoned context**: zero dead plan bodies in an agent's search path,
  and a first page (CLAUDE.md) with nothing stale on it.

Non-goals: changing CI jobs, the PR docs gate (landed via PR #144), or the
global `~/.claude` skills.

---

## public-desktop-runtime

**Owner, last message:** Буду оставить комментарии по ходу. Наша задача первая сделать цель программу, которую мы можем распространять. И такая сборка в публичной репетитории это плюс. Вторая история. Это улучшить тестовое покрытие в плане скорости, если мы выносим запуск пиджи-лайта в отдельный модуль, который не линкуется с бэкэндом. Бэкэнд становится проще, и соответственно у нас больше нет этих жестких подвязок. Мы можем лучше проверить и умнее выполнять. Третье. Мы получаем историю, когда тестовый пэкэнд включается как стенд, и можем его преиспользовать в различных эвалах. Это как бы дополнительный плюс. глядя на

**V2-outcomes** — 6/8 (2, 1, 2, 1). The goal captures the split-plan's desktop-move scope but adds unasked specifics (FastEmbed omitted but Ollama 'only when required' condition and PostgreSQL 'exactly as today' claim) that go beyond wh

1. The Tauri desktop app currently living in the private repository moves, together with its history, into the public `magnis` repository, giving the owner a Magnis desktop build they can distribute publicly.
2. The moved desktop app keeps starting its own embedded PostgreSQL for local runs exactly as it does today.
3. The desktop app gains the ability to start and manage a local Ollama process, launching it only when the local AI model the user selected requires it.

**V3-outcomes-measured** — 6/8 (1, 1, 2, 2). It nails the Tauri-to-public-magnis migration with concrete metrics but adds an unrequested Ollama-lifecycle-ownership requirement while omitting the PGlite/test-runtime split the conversation also as

1. The Tauri desktop shell — 101 tracked files including 4,442 Rust lines, currently only in this private repository — moves with its git history into the public `magnis` repository, leaving 0 desktop files tracked in this private repository.
2. The local launcher gains ownership of the Ollama process it does not start today: it starts, health-checks and stops a pinned Ollama instance whenever the selected local AI provider is Ollama, and fails instead of silently continuing when that requirement can't be met.
3. The public `magnis` repository can build and run the local desktop app (embedded PostgreSQL already included) end to end from its own public source, which it cannot do today since the desktop code exists only in this private repository.

**V4-asks-first** — 4/8 (1, 1, 1, 1). The candidate correctly scopes the split-out Tauri-move plan but adds an unrequested FastEmbed commitment and drops the explicit 'keep the L command working' requirement while lacking measurable, veri

1. The Magnis desktop app (the Tauri shell) has its source, history, and build moved out of the private `magnis-app` repository into the existing public `magnis` repository, while the Magnis backend and core logic stay only in the private `magnis-app` repository.
2. When a user picks a local AI model, the desktop app starts and stops the Ollama process it needs by itself, with no separate manual Ollama setup step.
3. When the local build is measured to need it, the desktop app also runs FastEmbed for local embeddings by itself, with no separate manual setup step.
4. The owner can hand another person the public build of the desktop app as a working, installable program, not just source code.

**Approved Goal:**

Build, install and run local Magnis from the public `0xmikko/magnis`
repository without checking out private application source. The public
Tauri/headless shell owns local process orchestration: embedded real
PostgreSQL, ports, paths, health and tray. When the user selects a local
Ollama model, it discovers a local daemon and offers one explicit install or
start action when that daemon is unavailable. The private repository publishes
an opaque, versioned runtime artifact containing the closed backend and
compiled web application.

**Currency: a public checkout can produce the user-facing local program.**

| Payment | Today at `143f6e847` | Done |
|---|---:|---:|
| tracked desktop files owned privately | 101, including 4,358 Rust lines | 0 after a history-preserving move |
| public desktop applications | 0 | 1 Tauri app plus one headless launcher |
| Tauri build hooks that compile private backend/frontend source | 2 | 0; exact artifact input only |
| runtime selections accepted without version + target + SHA-256 | possible | 0 |
| local database engines | embedded real PostgreSQL | remains exactly embedded real PostgreSQL |
| local Ollama setup path | absent | discover existing daemon; explicit user install/start only |
| clean public-checkout build receipts | 0 | one per Stage 0-supported target |

The user gets one installable desktop application. It starts PostgreSQL and
one verified runtime, waits for health and opens the compiled UI. When the
user selects a local Ollama m

---

## remove-dead-leftovers

**Owner, last message:** $blueprint подготовить план и удалить хвосты

**V2-outcomes** — 5/8 (2, 2, 0, 1). Covers the plan-then-remove request without adding scope, but lacks any concrete counts, file lists, or verifiable completion criteria.

1. An implementation plan for removing the dead/leftover code and artifacts named in remove-dead-leftovers.md is written and ready for the owner's approval.
2. The dead/leftover code and artifacts identified in that plan are removed from the codebase.

**V3-outcomes-measured** — 8/8 (2, 2, 2, 2). The goal cleanly binds to the brief's 43 findings, requires green gates, restricts scope via the Appendix, and specifies a concrete verifiable PR outcome without adding unrequested work.

1. Every item across the brief's 18 groups (43 findings) is resolved: each dead file, route, config key, script or comment is deleted, or left in place with its skip reason stated in the PR body.
2. The backend, frontend and docs check gates all stay green after the changes, confirming no behavior changed.
3. No file listed in the brief's Appendix is touched, and the result is a draft PR from branch `chore/remove-dead-leftovers` into `staging`, left unmerged.

**V4-asks-first** — 4/8 (1, 1, 1, 1). The candidate invents specific numeric details (18 groups, 43 findings, exact scopes like Google OAuth rotation) not verifiable from the brief text shown, since the conversation only references an ext

1. Every one of the 18 leftover groups the brief lists (43 distinct findings in total) ends up either deleted from the repository or left in place with a stated reason recorded in the pull request body.
2. Every item that is deleted is fully gone, with no shim, deprecation notice, or "kept for compatibility" code left behind in its place.
3. Every test that only pinned a deleted item is deleted along with it, while every test that pins live behavior still passes unchanged.
4. None of the files the appendix lists, the catalog repository, live code that names a specific plugin, `.github/workflows/`, or `infrastructure/` are touched.
5. The three groups the brief marks as the owner's call — the desktop bundle-secrets script, the desktop bundle-plugins script, and the `.claude` governance files — are changed only if the owner's launch message says so, and otherwise stay untouched and are listed in the pull request body as not done.
6. The credential-bearing files named in the brief have their contents never printed, copied, or quoted anywhere, and the pull request body tells the owner to rotate the Google OAuth client secret in Google Cloud.
7. All the work lands as one draft pull request, from one dedicated branch into staging, that stays unmerged throughout.
8. After the work, the backend suite, the frontend suite, and the docs check all still pass, and the final pull request verification also passes.
9. The pull request's commit history shows exactly one commit per resolved gr

**Approved Goal:**

Remove dead files and code left by the Rust backend and the in-app plugin tree,
without changing the supported application behavior. Deliver one reviewed PR into
`staging`; the owner merges it.

The currency is removed files and non-documentation lines, with a complete
explanation for every item in the supplied 18-group brief:

- **18/18 groups accounted for**, including every nested finding and duplicate;
  each final PR entry says removed, already absent, or skipped with a reference.
- **33 whole-file removal candidates** on the pinned base, listed below. Any live
  caller found during execution converts that removal into a documented skip.
- **Zero edits to the 280 Appendix entries**, the additional struck-out
  `scripts/eval/link-induction-l2.ts`, the catalog checkout, `.github/workflows/`,
  `infrastructure/`, or agent governance files.
- **Zero new runtime mechanisms, shims, fallback paths, or compatibility code.**
- Scoped behavior checks, documentation verification, and one complete local
  `agent:verify:pr` gate on the finished Delivery pass. CI verifies the published
  head independently. Record actual deleted files/lines, active and elapsed time,
  external waits, rework and credits/tokens if exposed; otherwise `unavailable`.

This is the **SPEC approval draft**, not an approved implementation contract.
The owner's request on 2026-09-15 is to prepare the plan and remove the leftovers.
Implementation follows approval of this SPEC and then its concrete Stage/Task gra

---

## search-indexing-foundation

**Owner, last message:** тогда покажи мне обновленный план того что мы делаем я вытащил эту сессию в отдельную сессию кодекса и больше мы этим не занимаемся так что теперь хочу увидеть тебя

**V2-outcomes** — 6/8 (2, 2, 1, 1). The candidate faithfully scopes to search/indexer, embeds the AI-boundary decision, and requires documented interfaces/methodology, but the deliverables are documents whose completion criteria (conten

1. This plan covers only the Search and indexer capabilities; Graph's entity and link operations (save, delete, and the rest) are out of scope and remain with the separate session the owner already split off to redo the graph.
2. The boundary between Search and the AI Models service for generating embeddings takes a module id and a list of text strings and returns only a list of number vectors — no usage, provider metadata, headers, body, or warnings cross it — because token and billing metering is recorded entirely inside the AI Models service.
3. The search/vector-search service that backs the graph has one documented interface, including how its active embedding model is replaced over its lifecycle.
4. How an entity is chunked for indexing, and how it is found again across multiple search criteria beyond plain full-text, is written down as one documented methodology.

**V3-outcomes-measured** — 7/8 (2, 1, 2, 2). The goal covers the boundary/interface/chunking/embedding asks well but item 4's strict no-metadata rule and prose-documentation specifics go beyond what was explicitly requested, adding slight scope 

1. The plan states the responsibility boundary of the Graph, Search and Indexer services in one sentence each, and drops every Graph entity/link/traversal/hypothesis/archive-mutation stage from its scope, leaving that work entirely to the separate Graph session already opened.
2. The plan shows one Search-service interface — method signatures only, no bodies — covering query/index calls and the embedding-model lifecycle (selection, swap, versioning, readiness).
3. The plan documents, in prose, how an Entity is split into chunks for indexing and how a chunk is retrieved by more than one search criterion (e.g. fulltext plus vector) together.
4. The plan fixes the embedding-call boundary as moduleId plus an array of strings in, an array of numbers out only, with no usage, provider metadata, headers, body or warnings crossing it, since token/billing accounting stays inside the AI-service machinery.

**V4-asks-first** — 5/8 (1, 1, 2, 1). The candidate correctly captures most asks with concrete, checkable detail but overreaches on specifics not stated in the conversation (e.g. 'exactly three services', 'more than one other criterion', 

1. The owner sees the embedding call take just a module ID and a list of strings and hand back nothing but a list of numbers, with zero usage, token, or billing fields anywhere in the response.
2. The owner receives an explicit keep-or-drop decision for each of the four disputed embedding-result fields — provider metadata, headers, body, and warnings — leaving none undecided.
3. The owner sees the full interface of the search service that the graph relies on, including exactly how its embedding model gets swapped and every state of its lifecycle, shown as an interface only with no implementation.
4. The owner sees, in the chat, the complete path from how an Entity is split into chunks, through how those chunks are indexed on more than one search criterion (full-text plus at least one other), to how a search then retrieves them.
5. The owner sees one written responsibility for each of exactly three services — Graph, Search, and Indexer — with no responsibility claimed by more than one of them.
6. The owner sees the plan's scope open with search rather than graph, and the boundary stated in one line: Graph only saves, deletes, and otherwise persists data; Search only lets the agent query it.
7. The owner sees the agreed approach carried into the plan unchanged: entities remain correctly chunked, and the agent can still search across more than one field through tools.
8. The owner sees the search, embedding, and indexing work already broken into a numbered list of distinct parts

**Approved Goal:**

Search exists so an agent receives the smallest sufficient, current and
evidence-backed context for a business task without reconstructing that context
from a flat pile of documents. Modules make Entity fields, collections and
relationships an executable domain language; Graph remains the authoritative
store; Search uses that language together with lexical and semantic evidence to
discover useful entities; the indexer keeps the derived material ready without
making a Graph write wait for a model.

The product hypothesis is deliberately narrower than “graphs beat RAG”:
**for repeated tasks over a large, heterogeneous personal corpus,
module-declared Entity types and relationships applied before the retrieval
limit will improve useful-context retrieval over an equally provisioned flat
hybrid RAG baseline.** This is an explicit inductive bias and query contract,
not a learned neural-network layer. It should win on typed predicates,
cross-source identity and relationship questions; it may tie or lose on small
corpora and open-ended semantic questions.

The currency of this plan is **one canonical product explanation plus 7
useful-context journeys**: six deterministic agent behaviours and one
reproducible product ablation. Before implementation changes Search, Stage 0
publishes the product explanation as a standalone target document: why Magnis
uses typed Entities and modules, what competitors already prove, how agent,
indexing and query flows work, what is implemented today and w

---

## sources-canonical-service

**Owner, last message:** $blueprint Мы работаем над улучшением бэк-энда Magnis. Ты можешь увидеть последние пиары и те агенты, которые сейчас работают. Каждый из них накладывает огромное улучшение по бэк-энду. Мы сейчас уже запустили исправление системы геогенов и extension-каталога, эпизодов, графа поиска триггеров. Осталась огромная область, которая сделана, с моей точки зрения, еще совершенно некорректной. Называется она SOURCES и взаимодействие с внешними поставщиками сигнал, что является core-fetch. Поэтому, поскольку я очень доволен кодексам, прошу тебя в этой ветке начать работу над этой задачей. Она суперважна

**V2-outcomes** — 6/8 (2, 2, 1, 1). The candidate covers research, plan, and documentation as requested without adding scope, but lacks concrete counts or checkpoints to verify completeness or detect drift.

1. The sources capability as it exists today — package loading, connections, authentication, sync routing and how it reaches external providers — is fully researched, with every flow and every current gap written down.
2. An implementation plan for the sources capability is drafted in docs/plans/, at the same depth and completeness as the repository's other capability plans, covering every flow the research found, ready for the owner's review and approval.
3. The sources capability's documentation is brought into order to match the research findings, leaving no open question for whoever carries out the later implementation.

**V3-outcomes-measured** — 8/8 (2, 2, 2, 2). The candidate faithfully translates the owner's ask (deep research on SOURCES, a plan document modeled on the episodes plan, and a documentation drift check) into concrete, numbered, checkable outcome

1. Every current SOURCES flow — source descriptor, runtime, publication, envelope, dataset contract, credential providers, and the MCP subsystem (profile, runtime, credential resolution, admissibility, binding pool, manifest loading) across all 42 TypeScript files (4,634 lines) in `backend/src/sources` — is read and recorded, with each flow's current behavior and each defect found pinned to its file and line.
2. One new plan document exists in `docs/plans/` for the SOURCES area, written in the current-state/target-state/staged form the repo's other approved refactor plans already use, complete enough that implementation can begin stage by stage without further research.
3. The existing SOURCES documentation (`docs/backend/sources.md`, `docs/source-mcp-bridge.md`, `docs/architecture/contracts/sources-modules.md`, `docs/plans/module-driven-mcp-sources.md`) is checked against the code recorded in outcome 1, and every place a doc no longer matches the code is named as a drift.

**V4-asks-first** — 6/8 (2, 2, 1, 1). The goal faithfully covers the requested research-then-plan scope for SOURCES without adding extras, but its outcomes rely on qualitative phrases like 'zero open design questions' rather than concrete

1. On this branch, the owner finds SOURCES work already under way in the form of one produced plan document, not a deferred promise.
2. The owner can read a single research section that lays out everything SOURCES currently does today — the source catalog, its connectors, credential and auth handling, sync routing, and the live-provider certification layer — before any change is proposed.
3. Every flow the research turns up inside SOURCES is paired one-for-one with a named improvement in the plan, with zero of the found flows left unaddressed.
4. The finished SOURCES plan and its documentation leave zero open design questions, so whoever implements it next has only execution steps left, nothing still to decide.

**Approved Goal:**

Make every external signal provider enter Magnis through one typed, certified
Source capability. Installation, credentials, account identity, child-process
lifetime, sync delivery, actions, health and user-visible status must each have
one named owner and one fail-closed contract.

The primary currency is **seven unsafe ownership paths reduced to zero**:

1. `SourceService` both publishes definitions and manages live pools.
2. replacement activation retires old pools with an unawaited shutdown.
3. a cancelled/timed-out MCP request can remain in `pending` until close.
4. malformed profiles and fetch results silently become valid defaults.
5. auth persists connection/account/sync state separately from its credential.
6. one bad envelope can be skipped while provider progress still advances.
7. catalog packages release through a directory loop, not an artifact-bound
   certification receipt; Telegram has a separate dispatcher and `x-mcp` is
   outside the connector gate.

Measured outcomes:

- **One control plane.** `SourceService` is the application façade.
  `ExtensionService` remains PR #170's sole immutable artifact/install/enabled
  owner. `SourceDefinitionRegistry` owns definitions,
  `SourceRuntimeSupervisor` owns processes, and `SyncService` owns workers.
- **One explicit protocol lane.** Every artifact declares exactly one version
  and authority: `module_sync` or `tools_only`. Production versus development
  fixture and poll versus push are orthogonal declarations. Exi

---

## stage-loop

**Owner, last message:** я бы не гонял полный suit на коммит - а гонял бы его на стадию. Может быть просить push после каждой стадии?

**V2-outcomes** — 8/8 (2, 2, 2, 2). The goal accurately captures both requested changes—running full suite per stage and pushing after each stage—without adding unrequested scope, and both are observable/verifiable.

1. The full test suite runs once per completed plan stage instead of on every commit.
2. Each stage's commit is pushed right after that stage completes, instead of waiting until the whole plan finishes.

**V3-outcomes-measured** — 8/8 (2, 2, 2, 2). The goal directly captures the two changes the owner requested—run full suite per stage not per commit, and push immediately after each stage—without adding scope, and each item is stated as an observ

1. The full test suite (currently ~2,200+ backend tests, ~9-10 minutes, as seen running on a single commit) runs exactly once per completed plan stage instead of on individual commits within a stage.
2. Each completed stage's branch is pushed immediately after that stage's commit, instead of pushes being withheld and batched for a later trigger.

**V4-asks-first** — -/8 (-, -, -, -). 

1. For every stage, the stage micro-review reads that stage's plan section and its commit, and flips the stage's checkbox only when the commit's actual work names the same stage and covers every part of that stage's Tasks and Acceptance criteria (for example, both backend and frontend when both are listed); any mismatch or missing part is named and the checkbox stays open.
2. When the owner changes the open plan while stages are still unfinished, that change appears as exactly one Amendments line credited to the owner, separate from any agent Deviations line, and every stage reviewed afterward is judged against the updated text.
3. Once a stage's own commit and its named checks pass, zero further verification steps (such as a contract gate triggered only by a fresh staging merge) run before that stage's branch is pushed.
4. The full backend suite runs exactly once at the close of each stage, not once for the whole plan and not a second time on a later commit, such as a merge commit, inside the same stage.
5. Each stage that closes is followed by exactly one push of the branch, instead of pushes being held until the whole plan finishes.

**Approved Goal:**

A stage should close honestly and cheaply. Today it does neither: the full
backend suite is charged per commit, and a box closes on nothing but the
executing agent's own edit.

- **The stage is the unit that pays, and the unit that LANDS.** One full
  backend run per backend-touching stage push — down from one per
  shared-path commit (measured 559.4s) plus a second at plan end; a stage
  that touches no backend source runs none. And the stage ends in a real,
  mergeable PR: the agent merges current staging in, pushes, and hands the
  owner something they can read and merge before the next stage starts
  (owner rulings, 2026-08-23 and 2026-08-24). Target: **a plan of N stages
  produces N landed PRs**, not one branch that meets its merge conflicts at
  the end — the state PR #167 is in today.
- **No box closes without proof.** A machinable criterion closes only
  when its command was re-run against the committed tree and passed; a
  prose box closes only against a verdict naming this plan, this stage,
  that box and the commit. Target: **0 boxes closed by a bare edit**.
- **No plan text changes without the owner's word.** Target: **0
  unauthored edits** to a plan's Goal, target file tree, stage headings
  or acceptance criteria after approval — today unbounded.

Currency, in two parts, each stage paying a stated share: **measured
seconds of gate time per stage**, and **the count of closures and plan
changes that carry no proof** (target: zero).

**The barrier is a stated pro

---

## system-settings-admin-boundary

**Owner, last message:** $blueprint Смотри, сейчас ряд админских вещей управляется через WebSocket, что недопустимо. Что я предлагаю? Я предлагаю собрать каталог Settings, в него засунуть контроллер, который позволяет менять ключевые вещи в нашем бэкэнде, менять, например, модель, ставить AP ключи и прочее. Все, что является админскими вещами, сделать поверх этого легкий контроллер и сервис, и все, что идет с админскими привилегиями, начнем с этого, идет через этот контроллер, где каждую функцию мы подписываем, или сам контроллер, admin only. Этот админ контролируется через nest-middleware. Проверь, пожалуйста, папку 

**V2-outcomes** — 6/8 (2, 2, 1, 1). Covers the requested scope accurately without adding extras, but lacks concrete counts/verification criteria to be fully measurable and executable.

1. All system-wide, admin-only backend settings — such as the default AI model/provider and API keys — are read and changed exclusively through one admin-only Settings controller and service, no longer via WebSocket.
2. The mechanism that enforces admin-only access on this controller is reviewed and, wherever it isn't idiomatic NestJS, brought in line with the rest of the backend.
3. The `backend/src/nest` folder is reviewed and any non-idiomatic code found in it is cleaned up.
4. Every other backend service or controller loses its own ability to change these system-wide settings; that configuration is removed from them and reachable only through the Settings service.

**V3-outcomes-measured** — 8/8 (2, 2, 2, 2). The candidate translates the owner's request into concrete, numbered, verifiable outcomes (consolidating the 9 admin controllers, reviewing the 9 nest files, removing 12 inline requireAdmin calls) tha

1. Every system-wide admin configuration action — today 36 HTTP operations spread across 9 separate `admin-*.controller.ts` files in 9 different service directories (agents, ai-models, billing, credits, extensions, module-settings, search, sources, users) — becomes reachable through one Settings-owned controller and service, so the owner can find and audit every admin-only backend configuration action in one place instead of nine.
2. The admin/auth boundary — the 9 files in `backend/src/nest/` plus the HTTP admin guard that enforce "admin only" — is reviewed against idiomatic NestJS practice, with every non-idiomatic pattern found either fixed or logged, replacing today's unverified suspicion with a confirmed, idiomatic implementation.
3. The 12 inline `requireAdmin()` calls duplicated inside service code (11 in `ai-model-management.service.ts`, 1 in `credit.service.ts`), on top of each controller's own admin guard, are removed so "admin only" is enforced by one mechanism instead of two.

**V4-asks-first** — 7/8 (2, 1, 2, 2). The candidate covers the conversation's asks with measurable, checkable outcomes, but items 6 and 7 (reviewing every file in the nest folder and the guard chain for idiomaticity) overreach the request

1. No system-wide backend setting — the deployment's AI model, API keys, or any other admin-controlled value — can be changed over WebSocket; the count of admin write operations reachable through WebSocket is zero.
2. A single settings catalog lists every system-wide setting an admin can change, naming the AI model and API keys among them, so the owner can see the full set of admin-configurable values in one place.
3. Every admin-privileged configuration change is made through one lightweight controller and one backing service, not directly against the individual services that own the values.
4. Every operation that changes a system-wide setting requires a verified admin, with zero such operations left unprotected, whether the check is applied function-by-function or to a whole controller at once.
5. Admin authorization for these changes is checked by one shared, reusable mechanism rather than separate ad hoc checks duplicated per service.
6. Every file in the backend's `nest` folder has been reviewed, and none of them is flagged as non-idiomatic NestJS code.
7. The admin-authorization guard chain has been reviewed for exactly how it works, and any non-idiomatic part of it has been rewritten to be idiomatic.
8. No service outside the settings controller still contains its own code path for changing system-wide configuration — that capability has been removed from all of them.
9. Per-episode model changes are left exactly as they are today, untouched by this work.
10. User-lev

**Approved Goal:**

Magnis has one auditable backend entrypoint for system-wide configuration and
production administration: every such operation uses an SDK-described
`/api/settings/*` REST contract, reaches one admin-only `SettingsController`,
then one thin `SettingsService`, then the capability service that owns the
behavior. WebSocket remains the transport for authenticated user work and safe
discovery; it is not an administration plane.

The currency is **legacy production-admin entrypoints removed**. Measured on
`a69a475d66d68693d634157bf7515f3e6380008f` (`origin/staging` after PR #196),
this plan delivers:

- **37 → 0 legacy admin routes**: all 36 `/api/admin/*` contracts and the
  administrative `PATCH /api/workspace` are replaced by 37
  `/api/settings/*` contracts; no alias, redirect, RPC fallback or dual
  registration remains;
- **10 → 1 controller owners** for those 37 operations: nine
  `admin-*.controller.ts` classes plus the admin method on
  `WorkspaceController` collapse into `SettingsController`;
- **10 files / 543 lines → 1 SDK catalog**: the nine
  `packages/sdk/src/http/admin-*.ts` groups and `admin.ts` aggregate become
  `system-settings.ts` with one `systemSettingsHttpContracts` authority;
- **1 file / 44 lines and 14 consumers → 0 settings-specific HTTP wrappers**:
  `adminHttp.ts`, `AdminHttpError`, manual token reads and the wrapper-only
  frontend test disappear; TanStack Query hooks call the existing typed
  `AppTransport.http(contract, input)` port directly;
- **34 

---

## telegram-fast-sync-proof

**Owner, last message:** ИСПРАВОЯЙ ПОКА НЕ БУДЕТ РАБОТАТЬ БЫСТРО

**V2-outcomes** — 6/8 (2, 2, 1, 1). The goal addresses the sync-from-scratch check, pause removal, proper flood-wait handling, and speed, but 'measurably faster' and 'no errors' lack concrete numeric thresholds making drift detection so

1. A full Telegram sync run from scratch completes successfully with no errors, confirming Telegram sync works correctly end to end.
2. Telegram requests are no longer held back by an artificial fixed pause between them (the multi-second gap currently seen disappears) — calls proceed back to back except when Telegram itself is rate-limiting.
3. When Telegram returns a flood-wait/429 response, the service reads the wait time from that response itself and resumes automatically once it elapses, with no hardcoded or guessed cooldown standing in for it.
4. With the artificial pause removed and flood-wait handling corrected, Telegram sync runs measurably faster than it does now.

**V3-outcomes-measured** — 6/8 (1, 1, 2, 2). The candidate addresses flood-wait timing correctness and adds a test, but omits the explicit request to check/restore the Rust-referenced prior implementation and does not address the 'sync from scra

1. Between Telegram sync calls, the only wait is one computed from Telegram's own reported flood/429 limit for that call (its exact reported duration) — before this work, a pause of more than three seconds occurred that did not correspond to any such reported limit.
2. When Telegram reports no flood/429 limit in effect, consecutive Telegram sync calls run back-to-back with zero added delay.
3. One passing automated test demonstrates a Telegram account syncing its chats and messages to completion from a clean, no-history state, including a run that hits and correctly recovers from a Telegram flood/429 response.

**V4-asks-first** — 6/8 (2, 1, 2, 1). Covers the flood-wait and speed asks well but adds unrequested scope like matching the old implementation exactly and full-empty-state sync, and lacks concrete baseline numbers for drift detection.

1. Owner watches a Telegram account sync run from a completely empty local state all the way to a fully synced, error-free status, with zero unresolved errors along the way.
2. When Telegram sends a flood-wait (429) response, the next Telegram request waits exactly the number of seconds Telegram specified in that response, never a longer invented pause such as the two-hour wait seen before.
3. Outside of an active flood-wait, Telegram requests run back to back with zero added artificial delay between them.
4. After a flood-wait/429 event, sync resumes on its own once the specified wait elapses, with zero manual restarts or interventions by the owner.
5. The flood-wait/429 handling is fully finished, with no partially-built piece left outstanding.
6. Telegram's flood-wait/429 handling behaves identically to the original pre-port implementation, with zero unexplained differences between the two.
7. A full Telegram sync is measured to complete in less wall-clock time than today's baseline, limited only by Telegram's real rate limits.

**Approved Goal:**

Prove the already owner-approved fast Telegram correction through the real Source, SDK, host, Nest scheduler, module and native PostgreSQL Graph. This is the backend proof portion of the catalog telegram-fast-sync SPEC; the owner directed immediate implementation on 2026-09-15 ("ИСПРАВОЯЙ ПОКА НЕ БУДЕТ РАБОТАТЬ БЫСТРО").

Metrics: exact durable message identity set, truthful progress from committed data, no artificial request spacing, no request before a real provider deadline, bounded continuation, and no false completion after failure. Three coherent journeys, not mock Source outputs.

---

## telegram-sync-integration

**Owner, last message:** Делаем МОК на тест, и МОК на синхронизационные вещи, полностью покрываем интеграцию все кейсы. Синхронизация ломает, неправильно присылает, нужно не миллион тестов, а подробно проработанную вещь. Поднимается Source, включается подписка на МОК Телеграмма. Телеграмм переходит в разные стадии, и сообщает разные вещи, и ты покрываешь все возможные сценарии. Для этого сначала рисуется граф возможных состояний на бумажке, подробно в мермейде, что может пойти не так. Стартовали, отработало, подписались на сообщение, пришло два сообщения, синхронизировался момент, упали, прошло какое-то время, время у

**V2-outcomes** — 6/8 (2, 2, 1, 1). The goal captures the diagram-first, single-comprehensive-test, and readable-assertions asks without adding scope, but it lacks concrete counts or thresholds (e.g. which states/cases must appear, batc

1. A Mermaid state diagram covers every sync-worker state and transition a source can go through (startup, live subscription, message arrival, backfill progress, crash/restart, gaps, time passing) for the owner to review before any test is written.
2. One comprehensive NestJS integration test, driving a mock source runtime through every state in that diagram, replaces the current scattered sync unit tests — not a large batch of small ones.
3. The owner can see in plain, readable language what that test actually checks at each state, instead of the current terse per-case identifiers.
4. That test proves the sync worker's backfill and live-subscription behavior genuinely works end-to-end, closing the gap between claimed test coverage and real behavior.

**V3-outcomes-measured** — 7/8 (2, 1, 2, 2). The goal captures the diagram, single mock harness, and Nest-based integration test the owner demanded, but introduces unrequested specifics (exact file paths, '~20' and '37' file counts, ScriptedRunt

1. A Mermaid state diagram exists documenting the sync scenarios the owner named (startup, live subscribe, message arrival, sync checkpoint, crash and restart, elapsed time, clock drift) as one reviewable artifact, where no such diagram exists in the repository today.
2. One mock source, built on the existing `ScriptedRuntime` test-harness mechanism (`backend/test/harness/sync.ts`), can be driven through every scenario in that diagram, replacing the one-off scripted responses each of the ~20 `tst_bts_sync_*` test files currently authors for itself.
3. One integration test boots the sync path through Nest's `TestingModule` — the mechanism already used in 37 other backend test files — drives that mock through every scenario in the diagram, and passes, where today every `tst_bts_sync_*` test constructs `SyncWorker`/`SyncRouter` by hand without Nest's module wiring.

**V4-asks-first** — 7/8 (2, 1, 2, 2). The goal thoroughly covers every ask but adds significant unrequested implementation detail (e.g. picking a specific fastest batch size, fixed 2-hour steps) not clearly asked for as a goal outcome, on

1. The owner can correctly state, in one sentence, what a chat's "total unknown" status means and what has to happen before it shows a known number instead.
2. The owner has an accurate, owner-confirmed description of exactly how messages are currently fetched from Telegram and stored, covering every step end to end.
3. The owner has a definitive, correct answer to whether Telegram reports a total message count per chat the way Gmail reports a cursor.
4. Chats are backfilled by cycling through them in equal-size batches, using whichever of 50, 100, or 200 messages per batch was measured to be fastest.
5. Each fetched batch of messages is written to the database in one transaction, not one transaction per message.
6. Any Telegram message that arrives after a chat's sync starts appears in production data immediately, without waiting for backfill to reach it.
7. The live catch-up window advances in fixed 2-hour steps forward from the current time.
8. Every historical gap in a chat's message history eventually gets filled by backfill, leaving zero permanently missing ranges.
9. After the sync process crashes and restarts, it resumes on its own and finishes with zero missing or duplicated messages.
10. The sync behavior already written up in the docs is actually running and observable end to end, not only described on paper.
11. The sync test suite fails whenever the described sync behavior is genuinely broken, so a passing suite means the behavior truly works.
12. Every sync test

**Approved Goal:**

One integration test verifies the Magnis Source synchronizer across Pull/Poll, Push carrying data, and Push carrying change notifications—not Telegram alone. Telegram and Gmail run concurrently through real NestJS and PostgreSQL, while controlled mocks represent the external world. The normal lifecycle comes first, followed by distinct failure chapters with understandable causes and outcomes.

This extends the existing Telegram SPEC at the owner's request; it is not a second plan. The filename is retained. This draft defines the contract and test, without rewriting the synchronizer, adapters, installation flow, or UI. Passing the future test establishes the enumerated obligations, not mathematical immunity to every future provider failure.

Measurable outcomes:

- After each normal or recovery sweep, the database's current entities, content, deletions, and relationships match an independent mock-provider journal for the declared synchronization scope.
- History does not stop at the first 50 messages. Unfinished chats receive round-robin turns; new data and a second source do not wait for the first source's entire history.
- Subscription, notification, page continuation, committed checkpoint, and coverage are verified independently. Progress never runs ahead of persisted data, including during abrupt process failure.
- Counts distinguish chats, messages, emails, threads, attempts, and persisted unique objects. Completion does not require an exact provider total.
- The report a

---

## unified-client-react-runtime

**Owner, last message:** $blueprint Итак, задача для блюпринта, который мы сейчас начнем делать по фронт-энду, это создание провайдера, вынос всех хуков оптимальной конфигурации, как мы обсудили, для того чтобы эпизод работал безупречно, ну и дальше в целом, да, как бы сделать оба приложения максимально идентичными и переиспользовать по максимуму. Соответственно, задачу, которую мы только что обсудили, она будет включать в себя изменения в SDK клиенте, возможно небольшие изменения в SDK core, это надо обсуждать, чтобы фронт-энду код не оказался доступным в бэк-энду, он там не нужен. И собственно говоря CLI и фронт-энд

**V2-outcomes** — 6/8 (2, 2, 1, 1). The goal captures the provider/hook consolidation, app parity, SDK boundary, and staging merge/auth unification asks without adding scope, but lacks concrete numbers or checkpoints an agent could use 

1. A single shared provider (no nested per-entity providers) exposes a composable set of hooks — for episode messaging, linked context, todo and the rest — that carry all episode data fetching, subscriptions and login logic, so a screen in either app draws only the hooks it needs and is left doing rendering only.
2. The frontend and the Ink CLI become maximally identical on top of that shared layer, with the CLI limited to rendering episodes only while still supporting every tool.
3. The plan states exactly which pieces move into the client SDK and which, if any, move into SDK core, so frontend-only code never becomes reachable from the backend.
4. After merging the latest staging, including its user- and workspace-access history, the plan clarifies and unifies the authentication/workspace approach shared by both apps, resolving the frontend's currently uncertain implementation.

**V3-outcomes-measured** — 7/8 (2, 2, 1, 2). The candidate captures the shared provider/hooks architecture, package split, auth alignment, and the architecture-only scope without adding unrequested work, though its outcomes are mostly named arti

1. An approved architecture document in `docs/plans/` defines one shared provider and a flat set of episode-scoped hooks (messaging, context, to-do) for `frontend/src` and `cli/src` to both consume, replacing today's two separate layers — the frontend's `AppRuntimeProvider` with its per-module stores, and the CLI's standalone hooks in `cli/src/hooks/` — with a single named interface.
2. The document states which package each new client-side piece belongs in, `@magnis/client-core` (0 backend imports today) or `@magnis/sdk` (52 backend imports today), so the plan leaves no frontend/CLI-only code destined for the package the backend shares.
3. The document states how `frontend/src` session and auth state will be brought into line with the `Workspace`/`UserProfile` contract already merged via the `workspace-user-access-boundary` plan, naming the specific places `frontend/src` currently diverges from that contract.
4. The deliverable stops at architecture and interface: the document contains no stage-by-stage implementation or test breakdown, matching the owner's request to get the design approved before scoping delivery.

**V4-asks-first** — 5/8 (2, 1, 1, 1). The candidate captures nearly every discussed point but adds substantial elaboration/interpretation beyond what was explicitly stated and lacks concrete numeric or verifiable completion criteria for a

1. The owner will see one client SDK/provider package that the Ink CLI app and the React frontend app both actually run their episode screens on, replacing today's client SDK, which the owner considers not fully formed.
2. The owner will see every screen in both apps reduced to rendering only, with all data-fetching, subscription and login logic living in the shared provider/hook layer instead of being duplicated inside each app.
3. The owner will see the shared layer give the CLI full tool-card, todo and memory support even though the CLI keeps rendering only the episode surface, with no Telegram-text, email or other module "operational history" view required from it.
4. The owner will see the plan settle on one specific shape — an extended SDK, a set of providers, and one Provider-wrapped app that reaches everything through hooks — in place of the single flat client object with namespaced methods shown in the earlier sketch.
5. The owner will see a clear yes-or-no answer, recorded in the plan, on whether one top-level Provider (not nested per-entity providers) can supply every hook, with each app's own router handing an entity id such as the episode id to hooks like `useEpisode(id)`.
6. The owner will see the hook surface named the way he asked: an `useEpisodeMessaging` hook for sending and stats in place of an `EpisodeScreen`/"episode actions" API, plus separate hooks for episode data, episode context (linked entities), and todos.
7. The owner will see this hook set checke

**Approved Goal:**

Make the frontend and Ink CLI render the same client-owned behaviour through
one `MagnisProvider` and one set of capability hooks. Route components supply
an Episode id; transcript, composer, context, Todo, usage and tool components
read their own slice directly instead of receiving a screen-sized state bag.

The plan's currency is **client capabilities with more than one application
owner**. Nine capabilities are currently assembled in renderer code:

1. workspace connection discovery and selection;
2. authentication, pair-bound token and current profile;
3. WebSocket lifecycle and connection status;
4. Episode collection, creation and metadata;
5. Episode messaging and streaming;
6. tool-call projection, prompts and approval;
7. live linked-entity context;
8. Episode Todo;
9. Episode usage, cost and context-window statistics.

The target is **9 → 0 renderer-owned client capabilities**: each has one
framework-neutral owner in `@magnis/client-core`, one React hook surface in
`@magnis/client-react`, and renderer-specific components in frontend and Ink.

Measured supporting outcomes:

- **one public `MagnisProvider` per React tree and zero resource providers**;
  there is no `EpisodeProvider`, `EntityProvider`, `TodoProvider` or nested
  provider hierarchy;
- **7 → 0 public `AgentChatStore` operations that require callers to pass an
  `AppTransport`** after the store has already been constructed;
- **4 → 0 production consumers constructing `AgentChatStore` directly**;
  `Magnis

---

## user-onboarding-wizard

**Owner, last message:** [Image #20][Image #21] Смотри, как правильно сделать аварии на самом деле. Сейчас делаем пуш того, что есть, и сделаем еще один уточняющий блюприум для того, чтобы до конца реализовать. У нас, соответственно, есть две задачи<unk> есть вот этот вот документ, который делает установку. И когда он заканчивается все как бы, да, считая установка готова, следующий момент это онбординг нового юзера и планбординг нового юзера, я бы тоже сделал так, что мы сначала запрашиваем некоторые документы, потом заставляем план и потом у каждого визора хранится стадия либо это новый юзер, потом, соответственно, о

**V2-outcomes** — 6/8 (2, 2, 1, 1). The goal captures the setup/onboarding, source auth, and stage-persistence asks from the final messages without adding scope, but it lacks concrete numeric or state-based acceptance criteria to make c

1. When the single local user finishes workspace setup, every module and Source they selected is installed for them directly, with no separate onboarding screen making them choose again.
2. Any user added after that setup instead goes through an onboarding flow that starts from what the admin already installed, letting each new person pick which of those modules and Sources they personally want.
3. When someone picks a Source during setup or onboarding, they are prompted right then to authenticate it, with a Skip option to do it later.
4. Setup and onboarding progress is saved stage by stage, so restarting the app returns each user to the exact step they left off on, showing one clear screen at a time instead of confusing nested windows as more Sources are added.

**V3-outcomes-measured** — 2/8 (0, 0, 1, 1). The candidate addresses only one narrow UI detail (auth sign-in layout) while ignoring nearly all the conversation's asks (default core modules, per-page scrolling, model selection/fastembed visibilit

1. In the onboarding wizard's "Connect your accounts" step, choosing a source to sign in (e.g. Telegram or Google) shows only that source's sign-in screen in place of the source list, replacing today's layout where the sign-in fields appear in a box nested inside the source-list card within the same wizard dialog.

**V4-asks-first** — 3/8 (0, 1, 1, 1). The candidate goal captures only the nested-connection-window fix while ignoring nearly all other asked items (default core modules, per-page scrolling, model selection language/list issues, fastembed

1. When a person connects a source during onboarding — Telegram today, and any source such as Google added later — they see exactly one connection window, not two nested ones.

**Approved Goal:**

A person's onboarding becomes what the installation already is: a document
they submit, a plan the server derives from it, and a step the server
records. The browser walks that plan instead of inventing it; a restart or a
reload resumes on the recorded step; each thing being set up gets its own
screen instead of a panel drawn inside a list row; and the screen that signs
an account in is the SAME component Settings uses, mounted differently.

Concretely, on the stand today: the wizard computes its own sequence in the
browser, so the record cannot say what is left; connecting Telegram opens a
card inside the row it belongs to, and with Google beside it the screen has
two nested boxes and no room; and a ceremony that loses its component state
answers `RPC error 409: auth ceremony expected phone`, because the state the
ceremony needs lives in a component that a list re-render can unmount.

---

## workspace-transfer-unification

**Owner, last message:** $blueprint У нас есть старое наследие от метода data set, который позволяет делать импорт и экспорт графа и других данных. Ты можешь посмотреть сейчас в параллельной секции с клодом на этой машине. Я заканчиваю создание метода transferable, и он должен сделать, что в сервисах, которые импортируют и экспортируют данные, будет решён формат transferable, то есть импорт и экспорт графа. В целом это звучит хорошо, но есть этот момент, который нужно будет тебе доделать после того, как я закоммичу PR#194. Посмотри последние вещи в этой сессии и давай сделаем следующее Я предлагаю сейчас, после того к

**V2-outcomes** — 6/8 (2, 2, 1, 1). The candidate captures all four requested outcomes without adding extras, but lacks concrete numbers/counts or explicit drift signals to make completion and deviation objectively verifiable.

1. The dataset service's import/export capability is merged into workspace and workspace snapshot: graph import and export run as one workspace capability, using the transferable format from PR #194, and the standalone dataset service module no longer exists.
2. A workspace client can trigger graph import and export through workspace's own interface, the same way it reaches workspace's other capabilities.
3. A workspace client can load a standard transferable file into its workspace, sourced from a designated standard user, through that same import mechanism.
4. Creating a new user automatically copies the standard user's data into the new user's workspace, through that same mechanism.

**V3-outcomes-measured** — 6/8 (2, 2, 1, 1). The goal captures all three asks (merge dataset into workspace/snapshot, standard-file load via client, new-user copy) without adding scope, but lacks concrete numbers/counts and clear pass/fail check

1. Before: graph/data import and export logic lives in a separate `dataset` service, independent of `workspace` and `workspace-snapshot`. After: that logic is merged into `workspace`/`workspace-snapshot`, so importing and exporting a workspace's graph and other data is a native operation of the workspace service, in the transferable format, with no standalone dataset module left.
2. Before: a workspace's user client has no function to load a predefined "standard" file into a workspace. After: the workspace client exposes a function that loads a chosen standard file, described in the same transferable format, into the workspace.
3. Before: new-user provisioning materializes at most one hardcoded, deployment-wide dataset via the dataset onboarding provisioner. After: creating a new user copies data from the configured standard file(s) into that user's new workspace automatically, using the same transferable import mechanism as manual loading.

**V4-asks-first** — 6/8 (2, 2, 1, 1). The goal captures all requested asks (merge dataset into workspace/snapshot, import/export as workspace feature, standard-file loading, new-user copying, DRY single mechanism) without adding extras, b

1. The dataset service no longer exists as its own separate service: the workspace service, together with the workspace snapshot service, is the single place in the codebase that owns graph import and export.
2. Importing and exporting a workspace's data works as a normal, available part of using that workspace, with no separate dataset-only entry point needed to reach it.
3. From the client, a user can load a chosen standard file into their workspace in one action, using the same file format the workspace already uses for its own export and import.
4. Every newly created user already has the data from the assigned standard file present in their workspace at the moment their account is created, with no manual import step required.
5. Exactly one mechanism reads and writes the transferable format everywhere it is used — workspace export, workspace import, standard-file loading, and the new-user copy — with no duplicate copy of that logic left anywhere in the codebase.

**Approved Goal:**

One Workspace capability owns the complete path by which a user's data leaves
Magnis and comes back. The same canonical document and the same import method
serve four callers: the authenticated client, `magnis db dump/restore`, new-user
template provisioning, and eval seeding.

The plan's currency is the **legacy transfer surface** measured after PR #194:

- three owners (`DatasetService`, `WorkspaceSnapshotService`,
  `WorkspaceService`) become one Workspace capability; the first two class
  names and both legacy capability directories disappear;
- 38 TypeScript files / 5,685 lines across `services/dataset/`,
  `services/workspace-snapshot/`, and `services/workspace/` become at most 12
  transfer-owning files / 4,800 lines across their honest owners, with no
  second codec, catalog, lifecycle, or transaction coordinator;
- 48 inbound source-file/directory edges into the two legacy directories become
  zero;
- the three `dataset.*` RPC methods stop being the user-facing import/export
  surface: Workspace gets two SDK-described authenticated HTTP operations, and
  the one eval-only action moves to Eval;
- the four known post-#194 integrity gaps are closed before any new caller is
  allowed onto the format: nullable graph values and entity aliases round-trip,
  export refuses dangling references, and repositories no longer type-import
  upward from their transfer service.

The standard-user journey is concrete: an operator signs in as any deliberately
curated user, exports that

---

