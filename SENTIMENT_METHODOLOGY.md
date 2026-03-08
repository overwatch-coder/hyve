# HYVE Sentiment Methodology

> A complete guide to how HYVE calculates and displays sentiment scores — from raw reviews to the Intelligence Matrix.

---

## Overview

HYVE uses a **multi-stage, theme-aware sentiment pipeline** that goes far beyond simple positive/negative word counting. The goal is to surface *what* consumers feel and *how strongly* they feel it, at the thematic level.

```text
Raw Reviews → LLM Claim Extraction → Clustering → AI Deduplication → Sentiment Scoring → Display
```

---

## Stage 1 — Claim Extraction (LLM)

Each raw review is processed by an LLM (GPT-4o-mini or Gemini 1.5 Flash) that extracts **structured atomic claims**.

Each claim contains:

| Field               | Description                                                      |
| ------------------- | ---------------------------------------------------------------- |
| `claim_text`        | The core insight extracted from the review                       |
| `evidence_text`     | The verbatim quote that supports it                              |
| `sentiment_polarity`| `"positive"`, `"negative"`, or `"neutral"`                       |
| `severity`          | Float 0.0–1.0 — how strongly the sentiment is expressed          |

**Why this matters:** Rather than rating the review as a whole, we extract many independent signals from a single review. A review that says *"The sound is amazing but the fit is terrible"* produces **two** claims with opposite polarities.

---

## Stage 2 — Semantic Clustering

Claims across all reviews are embedded and clustered using **K-means** (via scikit-learn). Each cluster becomes a **Theme** (e.g., "Battery Life", "Build Quality").

The LLM then names each cluster with a concise 2–3 word label and generates an actionable recommendation.

---

## Stage 3 — AI Deduplication

Within each theme cluster, an LLM groups similar/redundant claims and merges them into **representative claims**. The merged claim gets:

- **`mention_count`** — how many original claims were collapsed into it
- **`severity`** — the severity of the representative claim
- **`sentiment_polarity`** — the dominant sentiment of the group

This prevents inflated counts from near-identical reviews.

---

## Stage 4 — Sentiment Scoring

### Per-Theme `positive_ratio`

Calculated **after** deduplication using a severity-weighted formula:

```text
theme.positive_ratio = Σ(positive_claim.mention_count × positive_claim.severity)
                       ─────────────────────────────────────────────────────────
                       Σ(all_claims.mention_count × all_claim.severity)
```

This means **high-severity, frequently-mentioned** claims count more than low-signal noise.

- `positive_ratio = 1.0` → Theme is 100% positive by weighted signal
- `positive_ratio = 0.0` → Theme is 100% negative by weighted signal
- `positive_ratio = 0.5` → Mixed theme (balanced positive/negative signal)

### Product-Level `overall_sentiment_score`

Calculated as a **claim-count-weighted average** of all theme ratios, with an asymmetric penalty for highly negative themes:

```python
raw_score = Σ(theme.positive_ratio × theme.claim_count) / Σ(theme.claim_count)

# Penalty: themes with positive_ratio < 0.4 drag the score down harder
severe_neg_penalty = Σ((0.4 - theme.positive_ratio) × theme.claim_count for themes where ratio < 0.4)
                     ────────────────────────────────────────────────────────────────────────────────
                     Σ(theme.claim_count)

overall_sentiment_score = clamp(raw_score - severe_neg_penalty × 0.3, 0.0, 1.0)
```

**Why asymmetric?** Consumer trust is lost faster than it is gained. A severe complaint about safety or quality should depress the score more than an average negative review.

---

## Stage 5 — Display Rules (Frontend)

### Market Strengths vs. Market Risks

Themes are classified into **strictly non-overlapping** buckets:

| Bucket              | Condition                    | What it means                              |
| ------------------- | ---------------------------- | ------------------------------------------ |
| **Market Strength** | `positive_ratio >= 0.60`     | Majority of weighted signal is positive    |
| **Mixed** (hidden)  | `0.50 <= ratio < 0.60`       | No clear dominant sentiment — not shown    |
| **Market Risk**     | `positive_ratio < 0.50`      | Majority of weighted signal is negative    |

**A theme can NEVER appear in both sections.** The 0.5 threshold is the hard dividing line.

Each section shows up to **4 themes**, sorted by:

- Strengths → highest `positive_ratio` first
- Risks → lowest `positive_ratio` first (most negative first)

Each theme entry shows:

1. Theme name
2. A positive/negative bar indicating the ratio
3. The most representative claim (highest `mention_count × severity`)

### Sentiment Percentage (displayed in UI)

All percentages displayed in the UI represent `positive_ratio × 100`. So:

| Display | Meaning |
| --- | --- |
| **85% Positive** | 85% of weighted claim signal for this theme is positive |
| **72% Negative** | `positive_ratio = 0.28`, so `(1 - 0.28) × 100 = 72%` of signal is negative |

---

## How to Rerun/Recalculate Yourself

If you re-ingest reviews or want to recalculate scores for existing data:

### 1. Trigger re-clustering via the API

```bash
POST /products/{product_id}/cluster
```

This re-runs the full pipeline: clustering → dedup → theme naming → sentiment scoring.

### 2. Manually recalculate `positive_ratio` for a product (Python)

```python
from sqlalchemy.orm import Session
from database import SessionLocal
import models

db: Session = SessionLocal()
product_id = 1  # change this

themes = db.query(models.Theme).filter(models.Theme.product_id == product_id).all()

for theme in themes:
    claims = db.query(models.Claim).filter(models.Claim.theme_id == theme.id).all()

    total_weight = sum(max(c.mention_count, 1) * max(c.severity, 0.1) for c in claims)
    positive_weight = sum(
        max(c.mention_count, 1) * max(c.severity, 0.1)
        for c in claims if c.sentiment_polarity == "positive"
    )

    theme.positive_ratio = round(positive_weight / total_weight, 3) if total_weight > 0 else 0.0
    theme.claim_count = len(claims)
    print(f"  {theme.name}: {theme.positive_ratio:.1%} positive")

# Recalculate product overall score
total_claims_weight = sum(t.claim_count for t in themes)
weighted_pos = sum(t.positive_ratio * t.claim_count for t in themes)
raw_score = weighted_pos / total_claims_weight if total_claims_weight > 0 else 0.0

severe_neg_penalty = sum(
    (0.4 - t.positive_ratio) * t.claim_count
    for t in themes if t.positive_ratio < 0.4
) / total_claims_weight if total_claims_weight > 0 else 0.0

product = db.query(models.Product).filter(models.Product.id == product_id).first()
product.overall_sentiment_score = round(max(0.0, min(1.0, raw_score - severe_neg_penalty * 0.3)), 3)

db.commit()
db.close()
print(f"\nProduct overall sentiment: {product.overall_sentiment_score:.1%}")
```

### 3. Inspect what the DB currently has

```python
for theme in themes:
    print(f"{theme.name:30s} ratio={theme.positive_ratio:.2f} claims={theme.claim_count}")
```

---

## Design Rationale

| Decision | Why |
| --- | --- |
| Severity-weighted ratio (not raw count) | A claim mentioned 10× with high severity outweighs 20 low-severity mentions |
| Mutual exclusion at `positive_ratio < 0.5` | A theme with 48% positive is a risk, not a strength — clear line |
| Mixed zone (0.5–0.6) hidden from UI | Ambiguous themes confuse users — better to omit than mislead |
| Asymmetric product-score penalty | One severe negative theme shouldn't be fully neutralized by weak positives |
| Theme-level display (not claim-level) | Showing raw claims causes duplicates and confusing cross-contamination |

---

Last updated: March 2026 — HYVE Intelligence Platform
