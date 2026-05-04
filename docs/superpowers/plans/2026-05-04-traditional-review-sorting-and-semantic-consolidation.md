# Traditional Review Sorting And Semantic Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared Traditional review sorting across the analyzed-product and experiment flows, and improve HYVE’s backend analysis so semantically duplicate themes, claims, and pros/cons are grouped, capped, and reprocessable for existing products.

**Architecture:** The frontend work adds one shared sort model and consistent controls for Traditional review lists, with sorting applied before pagination. The backend work extends the existing claim clustering pipeline with a semantic consolidation pass, adds a theme-level merge pass, exposes grouped outputs through analytics, and provides a safe single-product reprocessing entrypoint for existing data.

**Tech Stack:** React, TypeScript, TanStack Query, shadcn/ui, FastAPI, SQLAlchemy, pytest, OpenAI/Gemini APIs, existing HYVE clustering/dedup utilities.

---

## File Map

### Frontend

- Modify: `frontend/src/components/ExperimentMode.tsx`
  - Add Traditional review sort state and UI in the experiment flow.
  - Apply sorting before pagination and reset page on sort changes.
- Modify: `frontend/src/components/ExploreCore.tsx`
  - Add the same Traditional review sort UI and behavior to the normal analyzed-product Traditional view.
  - Keep the layout compact and mobile-safe.
- Create: `frontend/src/lib/traditionalReviewSort.ts`
  - Shared sort option definitions and review-sorting helper used by both Traditional review flows.

### Backend

- Modify: `backend/pipeline.py`
  - Introduce grouped-claim consolidation utilities into the existing clustering pipeline.
  - Add max-8 surfacing behavior.
  - Add single-product reprocessing routine.
- Modify: `backend/ai_engine.py`
  - Add theme-level semantic comparison/merge helper(s) using LLM-first semantics with existing embeddings as support/fallback.
- Modify: `backend/routers/analytics.py`
  - Return grouped/cleaner analytics outputs while preserving the current API contract as much as possible.
- Modify: `backend/schemas.py`
  - Add any grouped-output schema fields needed by the analytics endpoint or reprocessing route.
- Modify: `backend/routers/products.py` or the existing router that owns product-level actions
  - Add a product reprocessing endpoint if one does not already exist in the right place.

### Tests

- Create: `backend/tests/test_traditional_review_reprocessing.py`
  - Reprocessing existing products preserves reviews and rebuilds derived outputs.
- Create: `backend/tests/test_semantic_grouping_limits.py`
  - Mention counts, sentiment separation, max-8 output cap, and theme-merge behavior.
- Create: `frontend/src/lib/traditionalReviewSort.test.ts`
  - Unit tests for sort ordering.
- Create or modify: component-level frontend tests if the repo already has a stable pattern for them.

### Docs

- Update: `docs/superpowers/specs/2026-05-04-traditional-review-sorting-and-semantic-consolidation-design.md`
  - Only if implementation uncovers material changes to the approved design.

## Task 1: Build Shared Traditional Review Sorting Helper

**Files:**
- Create: `frontend/src/lib/traditionalReviewSort.ts`
- Test: `frontend/src/lib/traditionalReviewSort.test.ts`

- [ ] **Step 1: Write the failing unit tests for all four sort modes**

```ts
import { describe, expect, it } from "vitest";
import { sortTraditionalReviews } from "./traditionalReviewSort";

const sampleReviews = [
  { id: 1, helpful_votes: 2, star_rating: 5, created_at: "2026-05-01T00:00:00Z" },
  { id: 2, helpful_votes: 9, star_rating: 2, created_at: "2026-05-03T00:00:00Z" },
  { id: 3, helpful_votes: 9, star_rating: 4, created_at: "2026-05-02T00:00:00Z" },
];

describe("sortTraditionalReviews", () => {
  it("sorts by most helpful with newest tiebreaker", () => {
    expect(sortTraditionalReviews(sampleReviews, "most-helpful").map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it("sorts by most favorable", () => {
    expect(sortTraditionalReviews(sampleReviews, "most-favorable").map((r) => r.id)).toEqual([1, 3, 2]);
  });

  it("sorts by most critical", () => {
    expect(sortTraditionalReviews(sampleReviews, "most-critical").map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it("sorts by most recent", () => {
    expect(sortTraditionalReviews(sampleReviews, "most-recent").map((r) => r.id)).toEqual([2, 3, 1]);
  });
});
```

- [ ] **Step 2: Run the new unit test file to verify it fails**

Run: `npm run test -- traditionalReviewSort`

Expected: FAIL because the helper file does not exist yet.

- [ ] **Step 3: Implement the shared sort types and helper**

```ts
export type TraditionalReviewSort =
  | "most-helpful"
  | "most-favorable"
  | "most-critical"
  | "most-recent";

export const TRADITIONAL_REVIEW_SORT_OPTIONS = [
  { value: "most-helpful", label: "Most Helpful" },
  { value: "most-favorable", label: "Most Favorable" },
  { value: "most-critical", label: "Most Critical" },
  { value: "most-recent", label: "Most Recent" },
] as const;

export function sortTraditionalReviews<T extends {
  helpful_votes?: number | null;
  star_rating?: number | null;
  created_at?: string | null;
}>(reviews: T[], sort: TraditionalReviewSort): T[] {
  // Return a copied array and sort using the approved tie-break rules.
}
```

- [ ] **Step 4: Run the unit tests again**

Run: `npm run test -- traditionalReviewSort`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/traditionalReviewSort.ts frontend/src/lib/traditionalReviewSort.test.ts
git commit -m "Add shared traditional review sort helper"
```

## Task 2: Wire Shared Sorting Into The Normal Traditional Review View

**Files:**
- Modify: `frontend/src/components/ExploreCore.tsx`
- Reuse: `frontend/src/lib/traditionalReviewSort.ts`

- [ ] **Step 1: Write or add a failing UI-focused test if an existing component test pattern already exists**

If the repo already has frontend component tests, add one that verifies:

```tsx
// Pseudocode
render(<TraditionalReviewsView ... />);
changeSort("Most Critical");
expect(firstVisibleReview).toContain("1-star review text");
```

If the project does not have a stable component-test harness for this component yet, skip test creation here and verify through the shared helper plus build/manual validation.

- [ ] **Step 2: Add local sort state and connect it to the query result**

```tsx
const [sortMode, setSortMode] = useState<TraditionalReviewSort>("most-helpful");

const sortedReviews = useMemo(
  () => sortTraditionalReviews(reviews, sortMode),
  [reviews, sortMode],
);
```

- [ ] **Step 3: Add the compact sort control above the review cards**

Use the existing shadcn control style already used elsewhere in the app, such as `Select` or a compact segmented control. Keep the label and control responsive:

```tsx
<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
    Sort Reviews
  </p>
  <Select value={sortMode} onValueChange={(value) => setSortMode(value as TraditionalReviewSort)}>
    ...
  </Select>
</div>
```

- [ ] **Step 4: Make pagination consume the sorted list and reset page on sort changes**

```tsx
useEffect(() => {
  setPage(1);
}, [sortMode, productId]);
```

- [ ] **Step 5: Run the frontend build**

Run: `npm run build`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ExploreCore.tsx frontend/src/lib/traditionalReviewSort.ts
git commit -m "Add traditional review sorting to explore view"
```

## Task 3: Wire Shared Sorting Into The Experiment Traditional Flow

**Files:**
- Modify: `frontend/src/components/ExperimentMode.tsx`
- Reuse: `frontend/src/lib/traditionalReviewSort.ts`

- [ ] **Step 1: Add a failing assertion or at least a manual verification note for sort plus page-reset behavior**

Target behavior to verify:
- changing sort resets the current Traditional page to 1
- sorted reviews render in the same order logic as the normal Traditional view

- [ ] **Step 2: Add `sortMode` state to the Traditional experiment view**

```tsx
const [traditionalSortMode, setTraditionalSortMode] =
  useState<TraditionalReviewSort>("most-helpful");
```

- [ ] **Step 3: Sort the fetched review list before slicing for pagination**

```tsx
const sortedTraditionalReviews = sortTraditionalReviews(reviews ?? [], traditionalSortMode);
const paginatedReviews = sortedTraditionalReviews.slice(...);
```

- [ ] **Step 4: Reset Traditional pagination when sort changes**

```tsx
useEffect(() => {
  setTraditionalPage(1);
}, [traditionalSortMode, platform, product?.id, open]);
```

- [ ] **Step 5: Add the same sort control UI used in the normal Traditional view**

Place it near the review count header, without compromising the current study layout.

- [ ] **Step 6: Run the frontend build**

Run: `npm run build`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ExperimentMode.tsx frontend/src/lib/traditionalReviewSort.ts
git commit -m "Add traditional review sorting to experiment flow"
```

## Task 4: Add Backend Tests For Semantic Grouping And Output Limits

**Files:**
- Create: `backend/tests/test_semantic_grouping_limits.py`
- Read: `backend/pipeline.py`
- Read: `backend/ai_engine.py`

- [ ] **Step 1: Write failing backend tests for grouped-item behavior**

Cover:
- semantically similar claims are merged
- opposite sentiments are not merged
- grouped outputs expose `mention_count`
- surfaced items are capped at 8
- equivalent theme names can be merged into one canonical theme

Example test shape:

```python
def test_grouped_claims_merge_semantic_duplicates(monkeypatch):
    # Seed claims like "sound quality is good" and "audio quality is strong"
    # Mock LLM merge helper if needed
    # Assert one grouped item with mention_count == 2
```

- [ ] **Step 2: Run the new backend test file to confirm failure**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_semantic_grouping_limits.py -v`

Expected: FAIL because the grouping helpers and/or analytics fields do not yet satisfy the assertions.

- [ ] **Step 3: Commit the failing test only if your workflow prefers strict TDD checkpoints**

```bash
git add backend/tests/test_semantic_grouping_limits.py
git commit -m "Add failing tests for semantic grouped outputs"
```

## Task 5: Implement In-Theme Semantic Claim Consolidation

**Files:**
- Modify: `backend/pipeline.py`
- Possibly modify: `backend/ai_engine.py`
- Test: `backend/tests/test_semantic_grouping_limits.py`

- [ ] **Step 1: Refactor grouped-claim consolidation into a clear helper**

Create or reshape a helper that accepts raw theme claims and returns grouped output:

```python
def consolidate_theme_claims(theme_name: str, claims: list[models.Claim]) -> list[dict]:
    """
    Returns canonical grouped items with:
    - representative_text
    - sentiment
    - severity
    - mention_count
    - original_ids
    """
```

- [ ] **Step 2: Use LLM-first semantic grouping with conservative guardrails**

Rules the implementation must enforce:
- never merge positive with negative
- preserve `mention_count`
- compute representative severity as grouped average
- fall back to existing dedup behavior if the LLM/helper fails

- [ ] **Step 3: Cap grouped outputs at 8 items after sorting by mention count and severity**

```python
grouped_items = sorted(grouped_items, key=..., reverse=True)[:8]
```

- [ ] **Step 4: Run the semantic-grouping backend tests**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_semantic_grouping_limits.py -v`

Expected: PASS for the claim-grouping assertions.

- [ ] **Step 5: Commit**

```bash
git add backend/pipeline.py backend/tests/test_semantic_grouping_limits.py
git commit -m "Add in-theme semantic claim consolidation"
```

## Task 6: Implement Theme-Level Semantic Merge

**Files:**
- Modify: `backend/ai_engine.py`
- Modify: `backend/pipeline.py`
- Test: `backend/tests/test_semantic_grouping_limits.py`

- [ ] **Step 1: Add a helper for semantic theme equivalence**

```python
def merge_semantically_equivalent_themes(themes: list[dict], provider: str | None = None) -> list[dict]:
    """
    Compares theme labels plus representative grouped claims and returns
    canonical merged themes.
    """
```

- [ ] **Step 2: Make the merge conservative**

Rules:
- compare names plus grouped examples
- prefer one canonical theme name
- merge counts and grouped items
- retain stable ordering
- fall back to unmerged themes if the helper fails

- [ ] **Step 3: Run backend tests again**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_semantic_grouping_limits.py -v`

Expected: PASS for theme-level merge assertions.

- [ ] **Step 4: Commit**

```bash
git add backend/ai_engine.py backend/pipeline.py backend/tests/test_semantic_grouping_limits.py
git commit -m "Add semantic theme merge pass"
```

## Task 7: Expose Grouped Outputs Through Analytics

**Files:**
- Modify: `backend/routers/analytics.py`
- Modify: `backend/schemas.py`
- Modify: `frontend/src/components/ExploreCore.tsx`
- Modify: `frontend/src/pages/ProductDetails.tsx`

- [ ] **Step 1: Write or update backend response-model tests if analytics API tests already exist**

Assert the analytics payload can carry grouped outputs and that consumers still receive the existing top-level structure.

- [ ] **Step 2: Add grouped fields to analytics schemas**

Possible shape:

```python
class GroupedClaimOut(BaseModel):
    representative_text: str
    sentiment: str
    severity: float
    mention_count: int

class ThemeAnalytics(BaseModel):
    ...
    grouped_claims: list[GroupedClaimOut] = []
```

- [ ] **Step 3: Populate grouped outputs in `get_product_analytics`**

Make sure:
- grouped claims are limited to 8
- current aggregate theme stats still work
- the endpoint does not break existing callers that still rely on `theme_breakdown`

- [ ] **Step 4: Update the frontend to prefer grouped outputs where available**

In `ExploreCore.tsx` and any connected view:
- use grouped representative claims instead of repeated raw claims for node previews
- show mention counts when helpful
- keep the UI concise

- [ ] **Step 5: Run backend tests and frontend build**

Run:
- `backend/venv/Scripts/python.exe -m pytest backend/tests/test_semantic_grouping_limits.py -v`
- `npm run build`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/routers/analytics.py backend/schemas.py frontend/src/components/ExploreCore.tsx frontend/src/pages/ProductDetails.tsx
git commit -m "Expose grouped analytics outputs"
```

## Task 8: Add Single-Product Reprocessing For Existing Products

**Files:**
- Modify: `backend/pipeline.py`
- Modify: `backend/routers/products.py` or the appropriate product-action router
- Create: `backend/tests/test_traditional_review_reprocessing.py`

- [ ] **Step 1: Write the failing reprocessing test**

Test behavior:
- existing reviews remain
- derived artifacts are rebuilt
- product processing state updates correctly

```python
def test_reprocess_product_preserves_reviews_and_rebuilds_analysis(client, db_session):
    # Seed product + reviews + claims/themes
    # Call reprocess endpoint or function
    # Assert reviews are preserved and derived outputs change/rebuild
```

- [ ] **Step 2: Run the test to confirm failure**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_traditional_review_reprocessing.py -v`

Expected: FAIL because the reprocessing routine/endpoint does not exist yet.

- [ ] **Step 3: Implement the single-product reprocessing routine**

Shape:

```python
def reprocess_existing_product(product_id: int, db: Session) -> dict:
    # preserve reviews
    # clear derived theme assignments / summaries as needed
    # rerun clustering + consolidation
    # update processing state
```

- [ ] **Step 4: Add a backend endpoint to trigger reprocessing**

Prefer a product-level route that matches current admin/product patterns.

- [ ] **Step 5: Run the reprocessing test**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_traditional_review_reprocessing.py -v`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/pipeline.py backend/routers/products.py backend/tests/test_traditional_review_reprocessing.py
git commit -m "Add single-product analysis reprocessing"
```

## Task 9: End-To-End Verification

**Files:**
- Modify only if fixes are required during verification.

- [ ] **Step 1: Run focused backend tests**

Run:

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_semantic_grouping_limits.py backend/tests/test_traditional_review_reprocessing.py -v
```

Expected: PASS

- [ ] **Step 2: Run any existing related experiment/product analytics tests**

Run:

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_experiment_public_analytics_visibility.py backend/tests/test_experiment_export_fields.py -q
```

Expected: PASS, proving the new work did not regress adjacent analytics paths.

- [ ] **Step 3: Run the frontend production build**

Run:

```bash
npm run build
```

Expected: PASS

- [ ] **Step 4: Manually verify in the browser**

Check:
- Traditional sort control exists in both flows
- sort changes reset pagination
- a duplicate-heavy product shows fewer repeated themes/claims/pros/cons
- grouped items never exceed 8
- mention counts look believable
- reprocessing improves an already-ingested product without deleting its reviews

- [ ] **Step 5: Final commit for any verification fixes**

```bash
git add <any touched files>
git commit -m "Finalize traditional review sorting and semantic consolidation"
```

## Review Notes

- The writing-plans skill recommends a plan-review subagent loop, but this session is operating under a higher-priority restriction not to spawn subagents unless the user explicitly asks for delegation. Perform a local plan review before execution unless the user later asks for subagent-driven review or implementation.
