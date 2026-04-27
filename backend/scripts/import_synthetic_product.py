"""
import_synthetic_product.py
----------------------------
Import a synthetic (non-Amazon) product and its reviews directly into the HYVE
Product + Review tables.  No ASIN, no Amazon tables involved.

Review JSON schema (array):
    [
      {
        "customer_name": "Jane D.",
        "rating": 4.5,
        "review_text": "Great sound quality, comfortable fit..."
      },
      ...
    ]

Usage examples
--------------
Local file:
    python scripts/import_synthetic_product.py \
        --name "Wireless Bluetooth Headphones" \
        --reviews-file /tmp/reviews.json \
        --run-analysis

From URL:
    python scripts/import_synthetic_product.py \
        --name "Wireless Bluetooth Headphones" \
        --reviews-url "https://example.com/reviews.json" \
        --run-analysis

Override auto-inferred category:
    python scripts/import_synthetic_product.py \
        --name "Wireless Bluetooth Headphones" \
        --category "Electronics" \
        --reviews-url "https://..." \
        --run-analysis
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import requests
from sqlalchemy.exc import SQLAlchemyError

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import models
from database import SessionLocal
from pipeline import (
    batch_process_reviews,
    cluster_product_claims,
    predict_product_category,
    process_review_sync,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_json(url: str | None, file_path: str | None) -> Any:
    """Load JSON from a URL or local file.  Exactly one must be provided."""
    if file_path:
        with Path(file_path).open("r", encoding="utf-8") as fh:
            return json.load(fh)
    if url:
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        return resp.json()
    return None


def _to_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _parse_reviews(payload: Any) -> list[dict[str, Any]]:
    """
    Accept a JSON payload that is either:
      - A list of review objects directly
      - A dict with a top-level 'reviews' / 'data' / 'results' key containing such a list
    """
    if isinstance(payload, list):
        nodes = payload
    elif isinstance(payload, dict):
        nodes = (
            payload.get("reviews")
            or payload.get("data")
            or payload.get("results")
            or []
        )
    else:
        nodes = []

    results: list[dict[str, Any]] = []
    for raw in nodes:
        if not isinstance(raw, dict):
            continue
        text = (
            raw.get("review_text")
            or raw.get("body")
            or raw.get("text")
            or raw.get("content")
            or ""
        ).strip()
        if not text:
            continue
        rating = _to_float(
            raw.get("rating") or raw.get("star_rating") or raw.get("stars"),
            default=0.0,
        )
        customer = (
            raw.get("customer_name")
            or raw.get("reviewer_name")
            or raw.get("author")
            or "Anonymous"
        ).strip()
        results.append(
            {
                "review_text": text,
                "rating": rating,
                "customer_name": customer,
            }
        )
    return results


# ---------------------------------------------------------------------------
# DB operations
# ---------------------------------------------------------------------------

def _get_or_create_product(db, name: str, category: str) -> models.Product:
    """
    Return an existing Product row with the same name, or create a new one.
    We match on exact name so re-running the script is idempotent.
    """
    product = (
        db.query(models.Product)
        .filter(models.Product.name == name)
        .first()
    )
    if product:
        print(f"[product] Found existing product id={product.id} — reusing it.")
        # Refresh category if it was blank/uncategorized before
        if not product.category or product.category.lower() in {"uncategorized", "undefined", "unknown"}:
            product.category = category
        product.ingest_type = "synthetic_manual"
        return product

    product = models.Product(
        name=name,
        category=category,
        status="ready",
        ingest_type="synthetic_manual",
        processing_step="Manual synthetic import",
        image_url=None,
    )
    db.add(product)
    db.flush()
    print(f"[product] Created new product id={product.id}  name='{name}'  category='{category}'")
    return product


def _upsert_reviews(
    db,
    product: models.Product,
    reviews: list[dict[str, Any]],
) -> tuple[int, list[int]]:
    """
    Insert reviews that don't already exist (deduplicate on original_text).
    Returns (count_inserted, list_of_new_review_ids).
    """
    source = "synthetic_manual"
    existing_texts: set[str] = {
        row[0]
        for row in db.query(models.Review.original_text)
        .filter(
            models.Review.product_id == product.id,
            models.Review.source == source,
        )
        .all()
    }

    inserted = 0
    new_ids: list[int] = []
    for r in reviews:
        if r["review_text"] in existing_texts:
            continue
        row = models.Review(
            product_id=product.id,
            original_text=r["review_text"],
            source=source,
            source_url=None,
            star_rating=r["rating"] if r["rating"] > 0 else None,
        )
        db.add(row)
        db.flush()
        inserted += 1
        new_ids.append(row.id)

    return inserted, new_ids


def _analyze_reviews(product_id: int, review_ids: list[int]) -> None:
    """
    Run claim extraction + theme clustering on the given review IDs.
    Opens its own DB session so it survives connection recycling.
    Falls back to per-review mode on transient SQLAlchemy errors.
    """
    db = SessionLocal()
    try:
        product = db.query(models.Product).filter(models.Product.id == product_id).first()
        if not product or not review_ids:
            return

        product.status = "processing"
        product.processing_step = "Distilling Insights"
        db.commit()
        print(f"[analysis] Extracting claims from {len(review_ids)} review(s)…")

        try:
            batch_process_reviews(review_ids, db)
        except SQLAlchemyError as exc:
            print(f"[analysis] Batch mode failed ({exc}); switching to per-review fallback…")
            db.rollback()

            pending_ids = [
                row[0]
                for row in db.query(models.Review.id)
                .outerjoin(models.Claim, models.Claim.review_id == models.Review.id)
                .filter(
                    models.Review.id.in_(review_ids),
                    models.Claim.id.is_(None),
                )
                .all()
            ]
            for rid in pending_ids:
                process_review_sync(rid, db)

        product = db.query(models.Product).filter(models.Product.id == product_id).first()
        if product:
            product.processing_step = "Harmonizing Patterns"
            db.commit()

        print("[analysis] Clustering themes…")
        cluster_product_claims(product_id, db)

        product = db.query(models.Product).filter(models.Product.id == product_id).first()
        if product:
            product.status = "ready"
            product.processing_step = "Analysis Complete"
            db.commit()

        print("[analysis] Done.")
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Main import function
# ---------------------------------------------------------------------------

def import_synthetic_product(
    name: str,
    category: str | None,
    reviews_url: str | None,
    reviews_file: str | None,
    run_analysis: bool,
) -> None:
    # 1. Load review payload
    payload = _load_json(reviews_url, reviews_file)
    if payload is None:
        raise ValueError("No reviews source provided.  Use --reviews-url or --reviews-file.")

    reviews = _parse_reviews(payload)
    if not reviews:
        raise ValueError("No parseable reviews found in the provided payload.")

    print(f"[load] Parsed {len(reviews)} review(s) from source.")

    # 2. Resolve category
    resolved_category = category.strip() if category else None
    if not resolved_category:
        print("[category] Predicting category from product name…")
        resolved_category = predict_product_category(name)
        print(f"[category] Inferred: '{resolved_category}'")

    # 3. Persist product + reviews
    db = SessionLocal()
    try:
        product = _get_or_create_product(db, name.strip(), resolved_category)
        inserted, new_ids = _upsert_reviews(db, product, reviews)
        print(f"[reviews] Inserted {inserted} new review(s)  (skipped {len(reviews) - inserted} duplicate(s))")

        # If re-running, pick up any unanalyzed reviews even if none were just inserted
        analysis_ids = list(new_ids)
        if run_analysis and not analysis_ids:
            analysis_ids = [
                row[0]
                for row in db.query(models.Review.id)
                .outerjoin(models.Claim, models.Claim.review_id == models.Review.id)
                .filter(
                    models.Review.product_id == product.id,
                    models.Review.source == "synthetic_manual",
                    models.Claim.id.is_(None),
                )
                .all()
            ]

        db.commit()

        if run_analysis:
            if analysis_ids:
                _analyze_reviews(product.id, analysis_ids)
            else:
                print("[analysis] All reviews already have claims — nothing to analyse.")

        # Final summary
        from sqlalchemy import func
        claim_count = (
            db.query(func.count(models.Claim.id))
            .join(models.Review)
            .filter(models.Review.product_id == product.id)
            .scalar()
        ) or 0
        theme_count = (
            db.query(func.count(models.Theme.id))
            .filter(models.Theme.product_id == product.id)
            .scalar()
        ) or 0

        print()
        print("=" * 70)
        print("Synthetic product import completed")
        print("=" * 70)
        print(f"Product name   : {product.name}")
        print(f"Category       : {product.category}")
        print(f"Product ID     : {product.id}")
        print(f"Reviews parsed : {len(reviews)}")
        print(f"Reviews inserted: {inserted}")
        print(f"Claims total   : {claim_count}")
        print(f"Themes total   : {theme_count}")
        print(f"AI analysis    : {'yes' if run_analysis else 'no'}")
        print(f"Status         : {product.status}")
        print("=" * 70)

    finally:
        db.close()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Import a synthetic (non-Amazon) product and its reviews into the HYVE database. "
            "Reviews JSON must be an array of objects with keys: "
            "review_text (required), rating, customer_name."
        )
    )
    parser.add_argument(
        "--name",
        required=True,
        help='Product name, e.g. "Wireless Bluetooth Headphones"',
    )
    parser.add_argument(
        "--category",
        default=None,
        help=(
            "Product category, e.g. Electronics.  "
            "If omitted the category is auto-inferred from the product name."
        ),
    )
    parser.add_argument("--reviews-url", help="URL returning a reviews JSON array")
    parser.add_argument("--reviews-file", help="Local path to a reviews JSON file")
    parser.add_argument(
        "--run-analysis",
        action="store_true",
        help="Run AI claim extraction + theme clustering on the imported reviews",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if not args.reviews_url and not args.reviews_file:
        parser.error("Supply at least one of --reviews-url or --reviews-file")

    import_synthetic_product(
        name=args.name,
        category=args.category,
        reviews_url=args.reviews_url,
        reviews_file=args.reviews_file,
        run_analysis=args.run_analysis,
    )


if __name__ == "__main__":
    main()
