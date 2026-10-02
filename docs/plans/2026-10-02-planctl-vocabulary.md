# Owner-approved vocabulary and type contracts through planctl MCP

Status: SPEC_DRAFT  
Spec lock: unlocked  
Outline lock: unlocked  
Implementation lock: unlocked  
Active Delivery: none  
Unattended decisions: allowed  

<!-- plan:spec:start -->
## The Goal

1. Give agents the approved vocabulary through planctl MCP: one English name, one precise meaning, and the canonical code definitions for each entity and type.
2. Require the owner's approval for every addition, removal, rename or meaning/type change. Show these changes together in the SPEC approval already used by the process.
3. Refuse an implementation that introduces an unapproved production type, changes its approved declaration or creates an unapproved alternate name for a registered entity.
4. Use TypeSafe Jev for short semantic checks against this vocabulary. Keep the result tied to the checked text and approved definition, with measured accuracy, latency and cost.

## Why now

On October 2, the owner asked for a vocabulary managed by the protocol, with each change approved like a type. The owner explicitly rejected another discovery skill or an advisory Sonnet reviewer.

The current `vocabulary` tool returns only synonym pairs. `synonyms` discards definitions and ignores a term when it has no forbidden synonym. Its project source is hard-coded to `docs/graph.md`; that Magnis document is historical and its table has a different shape, so it does not supply the expected entries. The type gate checks exported declaration names against the SPEC but does not establish an approved repository vocabulary or compare complete declarations.

The motivating case is `Entity`: introducing `RawEntity`, repeating its fields elsewhere, or calling the same thing by another word must require a visible decision. An existing external boundary can justify a distinct type, but that distinction must be described and approved.

## The target

### Read the complete vocabulary

Extend the existing MCP `vocabulary` tool and the authoring contract. Return canonical terms, meanings, forbidden alternatives, code definition references, the vocabulary revision and approval provenance. Preserve terms that have no aliases.

The process vocabulary remains `shared/code-production/vocabulary.md`. A consumer project uses one dedicated `docs/vocabulary.md`. Do not treat historical `docs/graph.md` as current authority. Seed a project's dictionary from selected current declarations and owner-approved definitions through the same proposed-change flow; discovering a name in old code does not approve it.

A code reference identifies its repository, file and declaration. Resolve another repository with the existing `deliveryRoot` configuration. Read the declaration at that reference; do not maintain another handwritten implementation of the type in the dictionary.

Ordinary English words are not vocabulary entries. The dictionary controls named concepts and production type declarations. Test-only fixtures and imported third-party declarations are not proposed as new project types.

### Propose and approve changes through the existing plan

`submit_spec` carries a Vocabulary changes section with exact before/after entries, the dictionary revision it was based on, and the reason for each change. Changed types also carry their complete proposed declarations in Interfaces. Draft proposals do not alter the approved dictionary.

The SPEC owner view shows this diff beside the intended behavior. `approve_spec` records the owner's word for those exact bytes and applies the approved dictionary changes through the existing mutation journal. Implementation decomposition still follows SPEC approval; implementation approval remains the second stop. Do not add approval of an outline or a third approval of vocabulary.

`amend` is the only way to change an approved proposal. Reusing an unchanged registered term needs no question. A stale dictionary revision or conflicting meaning produces a concrete diff for the author to reconcile before approval. An ordinary dictionary update must preserve unrelated entries.

Protect dictionary writes with the same approval provenance used for plans. An edit without the approved proposal is refused. Plan and dictionary updates must recover consistently after an interrupted write; an incomplete update must never appear approved. Show approval provenance separately from the canonical definition, so it cannot become a second source of meaning.

### Check the code against the approved contract

Extend the existing TypeScript declaration inspection and completion gate. Include new or changed named production type aliases and interfaces even when they are not exported. Compare the changed declaration with its approved Interfaces declaration and canonical location, ignoring formatting rather than ignoring fields.

Reusing an approved name is insufficient if its fields or meaning changed. A schema-derived type names its canonical schema as a dependency; changing that schema is a contract change too. Do not expand into a new general-purpose TypeScript compiler: use the repository compiler and its existing AST API.

Before implementation, plan lint checks proposed names and declarations against the dictionary. At completion, the existing commit inspection checks actual declarations and references. Both report the file, declaration, approved entry and mismatch. The agent can correct the implementation within the approved contract without asking the owner again.

### Ask Jev bounded questions

Pin `jev-1.13.0` and use the documented Noul primitive. Supply the relevant approved entries, the exact candidate text or declaration, and explicit binary criteria. Ask separately whether a candidate duplicates an existing concept, whether a term has its approved meaning, and whether authored prose is English. Quoted owner words and code are excluded from the language question.

Jev returns a probability for each supplied question. It does not generate replacement names, definitions, explanations or approval. Attach the supplied excerpt and dictionary entry to a finding; never invent a quotation from the model's response.

Calibrate thresholds on labelled examples before enabling semantic refusal. Use reviewed good examples and deliberate bad variants, including a real distinct boundary that must pass, a renamed duplicate that must fail, and an unchanged word used with a different meaning. Separate examples by source plan between calibration and evaluation. Record false refusals, missed defects, uncertain results, request count, elapsed time and token usage. Approved historical prose alone is not ground truth for every criterion.

Batch independent questions sharing the same context. Reuse an identical result only when the text, dictionary revision, rubric and model version match. Syntax, type comparison, revisions and approvals remain deterministic checks.

An uncertain answer or unavailable API is an explicit incomplete check, not success and not an owner-approval request. It must not prevent a running agent from continuing unrelated work already authorized by its approved plan. A required approval check remains incomplete until checked or explicitly resolved by the owner; do not silently bypass it or add another model as a fallback.

### Interfaces

Proposed dictionary and change shapes; these names are part of this SPEC approval:

```typescript
export interface VocabularyEntry {
  readonly term: string;
  readonly meaning: string;
  readonly forbidden: readonly string[];
  readonly definitions: readonly {
    readonly repository: string;
    readonly path: string;
    readonly name: string;
  }[];
}

export interface VocabularyChange {
  readonly before: VocabularyEntry | null;
  readonly after: VocabularyEntry | null;
  readonly reason: string;
}
```

An addition has `before: null`; a removal has `after: null`; both cannot be null. A prose-only term has an explicitly empty definitions list. Repository names resolve through the current repository/Delivery mechanism and do not embed machine paths.

Replace the synonym-only elements of `AuthoringContract.vocabulary` with these complete entries and expose the dictionary revision. Keep `GateViolation` as the finding shape. Record proposed type signatures in the approved SPEC rather than copying them into `VocabularyEntry`.

## Target tree

| Action | Path | Purpose |
|---|---|---|
| MODIFY | `planctl/src/mcp/server.ts` | Return complete vocabulary and connect existing submission, approval and amendment tools to it. |
| MODIFY | `planctl/src/core/plan-gate.ts` | Check approved vocabulary and changed type declarations through the current gate. |
| MODIFY | `planctl/src/core/plan-update.ts` | Bind vocabulary changes to the existing owner approval and mutation journal. |
| MODIFY | `planctl/src/core/spec-submission.ts` | Save proposed dictionary changes without approving them and return their checks. |
| CREATE | `planctl/src/core/vocabulary.ts` | Own dictionary parsing, revisions and approved changes for the MCP reader and gate. |
| CREATE | `planctl/src/core/jev.ts` | Own the one TypeSafe request, response validation and semantic-check result cache. |
| MODIFY | `shared/code-production/instruction-audit.ts` | Derive synonym checks from complete entries instead of dropping their meanings. |
| MODIFY | `shared/code-production/vocabulary.md` | Use the approved entry format for the existing process vocabulary. |
| MODIFY | `planctl/test/mcp.test.ts` | Prove proposed entries, owner approval, stale revisions and unchanged reuse. |
| MODIFY | `planctl/test/plan-gate.test.ts` | Prove unapproved names, changed signatures and canonical declaration reuse. |
| CREATE | `planctl/test/vocabulary.test.ts` | Prove dictionary integrity and approval-bound updates. |
| CREATE | `planctl/test/jev.test.ts` | Prove bounded requests, decoding, cache invalidation and incomplete-check behavior. |

This change implements the planctl mechanism. It does not rewrite application types, install another stack into consumer repositories, or turn old plans into approved dictionaries automatically. A consumer's first `docs/vocabulary.md` is created only with its reviewed seed entries.

## Invariants

- Reading a vocabulary preserves every term and its full meaning, including terms without aliases.
- A draft or an unapproved file edit cannot change the approved dictionary.
- One SPEC approval covers the visible vocabulary diff; unchanged reuse never needs another approval.
- Two repositories resolve canonical declarations in their own checkouts.
- A changed production declaration requires an approved name, location and declaration, including a private named type.
- A passing Jev result cannot approve a type or change a definition.
- The same semantic input reuses its result; changed text, dictionary, rubric or model invalidates it.
- An uncertain or failed semantic check is visible and never recorded as a pass.

The implementation contract will name one behavior test per invariant before implementation approval. No implementation Stages are proposed before SPEC approval.

## Reuse

Extend `vocabulary`, `authoringContract`, `submitSpec`, `lintedApproval`, `applyOwnerAmendment`, `mutatePlanFile`, `undeclaredExportedTypes` and `deliveryRoot`. Keep the two existing owner approvals and the existing findings format. Use the TypeScript AST already loaded by the gate and the project's `agent:*` scripts. Do not add a skill, a Sonnet reviewer, an observer service or a new verification runner.

## New names

| Name | Reason |
|---|---|
| `VocabularyEntry` | Names a complete dictionary entry; the current anonymous synonym pair has no meaning or declaration reference. |
| `VocabularyChange` | Names the exact before/after proposal approved with a SPEC. |
| `Jev` | TypeSafe's existing model name, explicitly requested by the owner. |

## Not verified

The TypeSafe request format and model availability were read in the official documentation. No live Jev call, latency measurement or classification evaluation has been performed. On October 2, the owner clarified that the API-key prohibition applies only to Claude and explicitly allowed the TypeSafe Jev API. Live evaluation requires TypeSafe credentials configured outside chat and the plan; the Claude subscription remains the authentication method for Claude.

Mechanical approval and declaration checks can be tested deterministically. Jev's semantic accuracy must be measured on the labelled evaluation examples; it cannot prove the absence of every possible conceptual duplicate.

References: https://docs.typesafe.ai/primitives/noul and https://x.com/karpathy/status/2105819303471976479. The controlled-language principle informs explicit definitions and consistent names; this proposal does not claim full ASD-STE100 compliance.
<!-- plan:spec:end -->

<!-- plan:implementation:start -->
## Implementation contract
<!-- plan:implementation:end -->

<!-- plan:execution:start -->
## Execution log
<!-- plan:execution:end -->
