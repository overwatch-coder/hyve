# Traditional Review Sorting And Semantic Consolidation

## Context

Recent user feedback highlights two connected gaps in HYVE:

1. The Traditional review experience is harder to use than it should be because users cannot quickly sort reviews by common shopping intents such as the most helpful, the most positive, the most critical, or the newest.
2. HYVE's decision-tree analysis still surfaces duplicate or near-duplicate themes, claims, and pros/cons. Similar meanings expressed with different wording can appear as separate items, which weakens trust in the analysis and makes nodes noisy.

These issues affect both newly ingested products and products that have already been processed. The fix must therefore improve both the live UX and the backend derivation pipeline, while preserving original review rows and original extracted claims for traceability.

## Goals

- Add the same Traditional review sort experience to:
  - the normal analyzed-product review flow
  - the experimental study Traditional flow
- Support these user-facing sort options:
  - `Most Helpful`
  - `Most Favorable`
  - `Most Critical`
  - `Most Recent`
- Consolidate semantically similar claims, themes, and pros/cons so HYVE surfaces cleaner and more accurate node content.
- Limit surfaced node-level items to a maximum of 8 grouped items per section.
- Preserve mention counts so grouped items still reflect how commonly they appear.
- Support reprocessing existing products with the improved pipeline.

## Non-Goals

- Changing the raw review schema or deleting original review rows.
- Replacing the overall ingestion entrypoints or synthetic import flow.
- Removing raw claim records from the database.
- Changing study-result scoring behavior in the admin experiment workflow.

## Approach Options

### Option 1: Shared frontend sorting plus backend consolidation layer

Add a shared sort control for Traditional reviews and improve the backend after raw claim extraction by clustering, semantically merging, canonicalizing labels, counting mentions, and capping surfaced items.

Pros:
- Solves the UX and data-quality problems at the right layers.
- Keeps raw data intact for auditability.
- Can reprocess old products without changing source reviews.

Cons:
- Requires touching both frontend and backend.
- Reprocessing must be carefully scoped to derived artifacts.

### Option 2: Rewrite extraction prompts to prevent duplicates upfront

Push more responsibility into the first LLM extraction call so it tries to avoid duplicates before claims are stored.

Pros:
- Potentially simpler downstream logic.

Cons:
- Harder to make deterministic.
- Existing products still need a reprocessing strategy.
- Prompt-only dedup is less reliable than explicit consolidation.

### Option 3: Frontend-only dedup and display cleanup

Leave backend analysis mostly unchanged and only merge duplicates at render time.

Pros:
- Lower implementation effort.

Cons:
- Analytics and counts remain polluted underneath.
- Public analysis quality still suffers in APIs and downstream views.

### Recommendation

Use Option 1. It solves the underlying problem while preserving existing data and gives us a reprocessing path for old products.

## Design

### 1. Traditional Review Sorting

#### Scope

The sort control should behave the same way in both:

- `frontend/src/components/ExperimentMode.tsx`
- the normal analyzed-product review experience that renders Traditional-style review lists

The visual treatment should be compact, mobile-safe, and aligned with the current shadcn-style control set.

#### Sort Options

- `Most Helpful`
  - primary: `helpful_votes` descending
  - secondary: `created_at` descending
- `Most Favorable`
  - primary: `star_rating` descending
  - secondary: `helpful_votes` descending
  - tertiary: `created_at` descending
- `Most Critical`
  - primary: `star_rating` ascending
  - secondary: `helpful_votes` descending
  - tertiary: `created_at` descending
- `Most Recent`
  - primary: `created_at` descending

#### Behavior

- Sorting should happen before pagination.
- Pagination should reset to page 1 whenever sort changes.
- In the experiment Traditional flow, the existing 20-review pagination stays in place.
- The normal analyzed-product flow should use the same sort semantics and shared helper logic where practical.

### 2. Semantic Claim Consolidation

#### Existing State

The current pipeline already:

- extracts raw claims with LLMs
- clusters claim texts into themes using embeddings or LLM fallback
- performs some AI deduplication inside themes

But the current output still allows:

- duplicate or overlapping theme names
- too many repeated pros/cons
- semantically identical items with different wording
- more surfaced items than are useful in node UIs

#### New Consolidation Layer

After raw claim extraction and initial clustering:

1. Group claims by initial theme cluster.
2. Within each theme, semantically merge claims with the same meaning.
3. Generate one canonical representative statement per merged group.
4. Preserve:
   - mention count
   - average severity
   - supporting original claim ids
   - dominant sentiment
5. Never merge opposite sentiments into the same grouped item.

#### Canonicalization Rules

- Use LLM semantic grouping as the primary mechanism.
- Use embeddings or existing normalization utilities as support or fallback.
- Prefer one clear canonical statement for each group, written in plain product-analysis language.
- Maintain a mention count for how many raw claims contributed to the grouped item.

### 3. Theme-Level Semantic Merge

The pipeline should add a second pass that compares generated themes against each other to detect semantic duplicates such as:

- `Sound Quality` vs `Audio Quality`
- `Comfort` vs `Wear Comfort`
- `Connection Stability` vs `Bluetooth Reliability`

#### Merge Rules

- Compare theme labels plus grouped representative claims.
- Use LLM comparison first because the user explicitly wants meaning-based matching.
- Use embeddings or lexical heuristics only as fallback support.
- When themes are merged:
  - choose one canonical theme name
  - merge grouped items
  - recompute aggregated counts and ratios
  - keep a stable output order

### 4. Surface Limits

Each surfaced node section should show a maximum of 8 grouped items.

This applies to:

- grouped claims within a theme
- positive items / pros
- negative items / cons
- other node-level item lists that currently expose the raw repeated output

#### Ranking

Order grouped items by:

1. `mention_count` descending
2. `severity` descending when relevant
3. recent supporting evidence only as a final tiebreaker if needed

The goal is to show the most representative and frequent patterns first.

### 5. Existing Product Reprocessing

The system must support reprocessing existing products so historical analyses benefit from the new semantic consolidation logic.

#### Reprocessing Contract

- Preserve:
  - product rows
  - review rows
  - original raw claims unless a targeted re-extraction is explicitly chosen
- Rebuild:
  - theme assignments
  - grouped claim output
  - canonical theme labels
  - grouped pros/cons
  - downstream summaries derived from those artifacts

#### Recommended Reprocessing Mode

Support a backend action for reprocessing a single product first. This is safer than immediately designing a bulk all-products job.

If needed later, bulk reprocessing can be layered on top of the same single-product reprocessing routine.

### 6. Data Model Direction

To avoid breaking existing code that expects raw `Claim` and `Theme` rows:

- Keep raw extracted `Claim` rows as-is.
- Keep `Theme` rows, but improve how final theme names and grouped outputs are produced.
- Introduce grouped-output structures in the derived analytics layer rather than replacing raw records immediately.

This reduces migration risk and keeps the change compatible with the current API surface.

If storage of grouped results becomes necessary for performance, that can be introduced as a follow-up once the runtime behavior is validated.

### 7. API / Processing Shape

#### Frontend

- Add shared sort-state handling in the Traditional review UIs.
- Reuse the same sort-option definitions across both flows where practical.

#### Backend

- Extend the existing clustering / dedup pipeline in `backend/pipeline.py` and supporting AI helpers in `backend/ai_engine.py`.
- Add a reprocessing entrypoint for existing products using the improved derivation flow.
- Ensure current analytics endpoints return the cleaner grouped structures without breaking existing consumers.

### 8. Error Handling

- If semantic merge calls fail, fall back to the current clustering/dedup behavior rather than failing the entire product analysis.
- If theme-level merge fails, continue with initial clustered themes.
- Reprocessing should mark product processing status clearly if a rerun fails.
- Traditional review sorting must degrade safely if `helpful_votes` or `created_at` are missing by using sensible defaults.

### 9. Testing Strategy

#### Backend

- Add tests for:
  - semantic grouping preserving mention counts
  - opposite sentiments staying separate
  - max-8 surfaced item limit
  - theme-level merge of semantically equivalent names
  - reprocessing existing products without deleting reviews

#### Frontend

- Add tests for:
  - sort-option behavior
  - page reset on sort change
  - consistent behavior between the normal Traditional view and experiment Traditional view

#### Manual Verification

- Validate with a product that currently shows obvious duplicate labels such as comfort/audio-quality variants.
- Reprocess at least one already-ingested product and verify improved grouping in the decision tree and Traditional review flows.

## Risks

- LLM-based semantic grouping can over-merge distinct claims if prompts are too aggressive.
- Reprocessing can be expensive for products with many reviews.
- Existing analytics consumers may implicitly depend on current duplicated structures.

## Mitigations

- Keep raw claims unchanged.
- Use conservative merge rules with sentiment separation.
- Apply max-8 limits only to surfaced grouped outputs, not to the raw evidence base.
- Start with single-product reprocessing and validate quality before considering broader automation.

## Success Criteria

- Users can sort Traditional reviews the same way in both target flows.
- Duplicate or near-duplicate theme labels are meaningfully reduced.
- Node-level pros/cons and grouped claims are capped at 8 high-signal items.
- Each surfaced grouped item shows a believable mention count.
- Existing products can be reprocessed and visibly improve without re-ingesting reviews.
