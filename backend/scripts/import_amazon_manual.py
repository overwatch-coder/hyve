from __future__ import annotations

import argparse
import hashlib
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


def _load_json_from_source(url: str | None, file_path: str | None) -> Any:
    if file_path:
        with Path(file_path).open("r", encoding="utf-8") as f:
            return json.load(f)

    if url:
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        return resp.json()

    return None


def _to_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.replace("$", "").replace(",", "").strip()
        if not cleaned:
            return default
        try:
            return float(cleaned)
        except ValueError:
            return default
    return default


def _to_int(value: Any, default: int | None = None) -> int | None:
    if value is None:
        return default
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        digits = "".join(ch for ch in value if ch.isdigit())
        if not digits:
            return default
        return int(digits)
    return default


def _parse_product_payload(payload: Any, asin: str) -> dict[str, Any]:
    # Handles multiple shapes: direct product object, Rainforest-like wrappers, or GraphQL-style data nodes.
    node = payload

    if isinstance(node, dict) and "request_info" in node and "product" in node:
        node = node["product"]
    elif isinstance(node, dict) and "data" in node and isinstance(node["data"], dict):
        data = node["data"]
        node = data.get("amazonProduct") or data.get("product") or data

    if not isinstance(node, dict):
        raise ValueError("Unsupported product JSON shape")

    images = node.get("images") or node.get("image_urls") or []
    image_url = None
    if isinstance(images, list) and images:
        first = images[0]
        image_url = first.get("link") if isinstance(first, dict) else str(first)
    if not image_url and isinstance(node.get("image"), dict):
        image_url = node["image"].get("link") or node["image"].get("url")

    title = (
        node.get("title")
        or node.get("name")
        or node.get("product_title")
        or f"Amazon Product {asin}"
    )

    description_parts: list[str] = []
    if node.get("description"):
        description_parts.append(str(node["description"]))
    feature_bullets = node.get("feature_bullets") or node.get("bullet_points")
    if isinstance(feature_bullets, list) and feature_bullets:
        description_parts.extend(str(x) for x in feature_bullets[:8])

    description = "\n".join(p.strip() for p in description_parts if str(p).strip()) or None

    return {
        "asin": asin,
        "title": title,
        "brand": node.get("brand") or node.get("manufacturer"),
        "category": node.get("category") or node.get("department") or node.get("main_category"),
        "description": description,
        "image_url": image_url,
        "price": _to_float(node.get("price") or node.get("price_amount"), default=None),
        "rating": _to_float(node.get("rating") or node.get("stars"), default=None),
        "review_count": _to_int(node.get("ratings_total") or node.get("ratings") or node.get("reviews_total"), default=None),
        "amazon_url": node.get("link") or node.get("url") or f"https://www.amazon.com/dp/{asin}",
    }


def _extract_reviews(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return payload

    if not isinstance(payload, dict):
        return []

    candidates = [
        payload.get("reviews"),
        payload.get("data"),
        payload.get("results"),
    ]

    if isinstance(payload.get("data"), dict):
        data = payload["data"]
        candidates.extend(
            [
                data.get("reviews"),
                data.get("items"),
                data.get("amazonProduct", {}).get("topReviews") if isinstance(data.get("amazonProduct"), dict) else None,
            ]
        )

    for candidate in candidates:
        if isinstance(candidate, list):
            return candidate

    return []


def _normalize_review(raw: dict[str, Any], asin: str, index: int) -> dict[str, Any] | None:
    body = (
        raw.get("body")
        or raw.get("review_text")
        or raw.get("text")
        or raw.get("content")
        or raw.get("review")
    )
    if not body or not str(body).strip():
        return None

    reviewer = raw.get("reviewer")
    reviewer_name = None
    if isinstance(reviewer, dict):
        reviewer_name = reviewer.get("name")
    else:
        reviewer_name = raw.get("reviewer_name") or raw.get("author")

    rid = raw.get("id") or raw.get("review_id")
    if not rid:
        digest_input = f"{asin}|{raw.get('title') or ''}|{body}|{reviewer_name or ''}|{raw.get('date') or ''}"
        rid = f"manual_{hashlib.sha1(digest_input.encode('utf-8')).hexdigest()[:20]}"

    return {
        "canopy_id": str(rid),
        "title": (raw.get("title") or "")[:500] or None,
        "body": str(body).strip(),
        "rating": _to_float(raw.get("rating") or raw.get("stars") or raw.get("star_rating"), default=0.0),
        "reviewer_name": reviewer_name,
        "verified_purchase": bool(raw.get("verifiedPurchase") or raw.get("verified_purchase") or raw.get("is_verified")),
        "helpful_votes": _to_int(raw.get("helpfulVotes") or raw.get("helpful_votes"), default=0) or 0,
        "order": index,
    }


def _upsert_amazon_product(db, product_data: dict[str, Any]) -> models.AmazonProduct:
    existing = db.query(models.AmazonProduct).filter(models.AmazonProduct.asin == product_data["asin"]).first()
    if existing:
        for key, value in product_data.items():
            setattr(existing, key, value)
        return existing

    created = models.AmazonProduct(**product_data)
    db.add(created)
    return created


def _ensure_hyve_product(db, amazon_product: models.AmazonProduct) -> models.Product:
    product = db.query(models.Product).filter(models.Product.name == amazon_product.title).first()
    if product:
        if amazon_product.image_url and not product.image_url:
            product.image_url = amazon_product.image_url
        if not product.category or product.category.lower() in {"uncategorized", "undefined"}:
            product.category = amazon_product.category or predict_product_category(amazon_product.title)
        product.ingest_type = "manual_amazon"
        return product

    category = amazon_product.category or predict_product_category(amazon_product.title)
    product = models.Product(
        name=amazon_product.title,
        category=category,
        status="ready",
        ingest_type="manual_amazon",
        processing_step="Manual import complete",
        image_url=amazon_product.image_url,
    )
    db.add(product)
    db.flush()
    return product


def _upsert_reviews(db, asin: str, reviews: list[dict[str, Any]], hyve_product: models.Product, source_url: str | None) -> tuple[int, int, list[int]]:
    existing_amz = {
        r.canopy_id: r
        for r in db.query(models.AmazonReview).filter(models.AmazonReview.amazon_product_asin == asin).all()
    }

    created_amz = 0
    for raw in reviews:
        rid = raw["canopy_id"]
        if rid in existing_amz:
            row = existing_amz[rid]
            row.title = raw["title"]
            row.body = raw["body"]
            row.rating = raw["rating"]
            row.reviewer_name = raw["reviewer_name"]
            row.verified_purchase = raw["verified_purchase"]
            row.helpful_votes = raw["helpful_votes"]
        else:
            db.add(
                models.AmazonReview(
                    amazon_product_asin=asin,
                    canopy_id=rid,
                    title=raw["title"],
                    body=raw["body"],
                    rating=raw["rating"],
                    reviewer_name=raw["reviewer_name"],
                    verified_purchase=raw["verified_purchase"],
                    helpful_votes=raw["helpful_votes"],
                )
            )
            created_amz += 1

    source = f"amazon_manual_{asin}"
    existing_texts = {
        r.original_text
        for r in db.query(models.Review).filter(
            models.Review.product_id == hyve_product.id,
            models.Review.source == source,
        ).all()
    }

    created_hyve = 0
    new_review_ids: list[int] = []
    for raw in reviews:
        if raw["body"] in existing_texts:
            continue
        row = models.Review(
            product_id=hyve_product.id,
            original_text=raw["body"],
            source=source,
            source_url=source_url,
            star_rating=raw["rating"] if raw["rating"] > 0 else None,
        )
        db.add(row)
        db.flush()
        created_hyve += 1
        new_review_ids.append(row.id)

    return created_amz, created_hyve, new_review_ids


def _analyze_reviews_with_fallback(product_id: int, review_ids: list[int]) -> None:
    db = SessionLocal()
    try:
        product = db.query(models.Product).filter(models.Product.id == product_id).first()
        if not product or not review_ids:
            return

        product.status = "processing"
        product.processing_step = "Distilling Insights"
        db.commit()

        try:
            # Fast path: single batched extraction + insert.
            batch_process_reviews(review_ids, db)
        except SQLAlchemyError as exc:
            # Fallback path: recover from transient DB connection failures by
            # processing each review independently (smaller commits).
            print(f"Batch processing failed ({exc}); falling back to per-review mode...")
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

        cluster_product_claims(product_id, db)

        product = db.query(models.Product).filter(models.Product.id == product_id).first()
        if product:
            product.status = "ready"
            product.processing_step = "Analysis Complete"
            db.commit()
    finally:
        db.close()


def import_amazon_data(
    asin: str,
    product_url: str | None,
    reviews_url: str | None,
    product_file: str | None,
    reviews_file: str | None,
    run_analysis: bool,
) -> None:
    product_payload = _load_json_from_source(product_url, product_file)
    reviews_payload = _load_json_from_source(reviews_url, reviews_file)

    if product_payload is None:
        raise ValueError("No product source provided. Use --product-url or --product-file.")
    if reviews_payload is None:
        raise ValueError("No reviews source provided. Use --reviews-url or --reviews-file.")

    product_data = _parse_product_payload(product_payload, asin)
    review_nodes = _extract_reviews(reviews_payload)
    normalized_reviews = []
    for idx, raw in enumerate(review_nodes):
        if not isinstance(raw, dict):
            continue
        nr = _normalize_review(raw, asin, idx)
        if nr:
            normalized_reviews.append(nr)

    # Some exports include duplicate review IDs across pages/chunks.
    unique_reviews: dict[str, dict[str, Any]] = {}
    for r in normalized_reviews:
        unique_reviews[r["canopy_id"]] = r
    normalized_reviews = list(unique_reviews.values())

    if not normalized_reviews:
        raise ValueError("No parseable reviews found in the provided reviews payload.")

    db = SessionLocal()
    try:
        amazon_product = _upsert_amazon_product(db, product_data)
        db.flush()

        hyve_product = _ensure_hyve_product(db, amazon_product)
        db.flush()

        created_amz, created_hyve, new_review_ids = _upsert_reviews(
            db,
            asin=asin,
            reviews=normalized_reviews,
            hyve_product=hyve_product,
            source_url=product_data.get("amazon_url"),
        )

        if run_analysis:
            analysis_review_ids = list(new_review_ids)
            if not analysis_review_ids:
                source = f"amazon_manual_{asin}"
                analysis_review_ids = [
                    row[0]
                    for row in db.query(models.Review.id)
                    .outerjoin(models.Claim, models.Claim.review_id == models.Review.id)
                    .filter(
                        models.Review.product_id == hyve_product.id,
                        models.Review.source == source,
                        models.Claim.id.is_(None),
                    )
                    .all()
                ]

            if analysis_review_ids:
                db.commit()
                _analyze_reviews_with_fallback(hyve_product.id, analysis_review_ids)

        db.commit()

        print("=" * 70)
        print("Manual Amazon import completed")
        print("=" * 70)
        print(f"ASIN: {asin}")
        print(f"Amazon product ID: {amazon_product.id}")
        print(f"HYVE product ID: {hyve_product.id}")
        print(f"Amazon reviews processed: {len(normalized_reviews)}")
        print(f"Amazon reviews created/updated: {created_amz} created")
        print(f"HYVE reviews newly inserted: {created_hyve}")
        print(f"AI analysis executed: {'yes' if run_analysis else 'no'}")
        print("=" * 70)

    finally:
        db.close()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Manually import an Amazon product and reviews into HYVE DB tables."
    )
    parser.add_argument("--asin", required=True, help="Amazon ASIN, e.g. B085DVHQ57")
    parser.add_argument("--product-url", help="URL returning product JSON")
    parser.add_argument("--reviews-url", help="URL returning reviews JSON")
    parser.add_argument("--product-file", help="Local product JSON file path")
    parser.add_argument("--reviews-file", help="Local reviews JSON file path")
    parser.add_argument(
        "--run-analysis",
        action="store_true",
        help="Run AI claim extraction + clustering on newly inserted HYVE reviews",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    import_amazon_data(
        asin=args.asin.strip().upper(),
        product_url=args.product_url,
        reviews_url=args.reviews_url,
        product_file=args.product_file,
        reviews_file=args.reviews_file,
        run_analysis=args.run_analysis,
    )


if __name__ == "__main__":
    main()
