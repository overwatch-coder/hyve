import logging
import os
import re
import requests as http_requests
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

logger = logging.getLogger("hyve.aliexpress")
from sqlalchemy import or_
from sqlalchemy.orm import Session
import schemas
import models
from database import get_db
from core.pagination import paginate

router = APIRouter(prefix="/aliexpress", tags=["AliExpress Catalog"])

RAPIDAPI_BASE = "https://aliexpress-datahub.p.rapidapi.com"
ITEM_SEARCH_ENDPOINTS = [
    "item_search_2",
    "item_search_3",
    "item_search_4",
    "item_search_5",
]
ITEM_REVIEW_ENDPOINTS = [
    "item_review",
    "item_review_2",
    "item_review_3",
]

# Process-local optimization: once an endpoint works, try it first on next calls.
_PREFERRED_ITEM_SEARCH_ENDPOINT = ITEM_SEARCH_ENDPOINTS[0]
_PREFERRED_ITEM_REVIEW_ENDPOINT = ITEM_REVIEW_ENDPOINTS[0]


def _to_int(value) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        digits = "".join(ch for ch in value if ch.isdigit())
        return int(digits) if digits else None
    return None


def _normalize_aliexpress_url(item_url: Optional[str], item_id: Optional[str] = None) -> Optional[str]:
    if not item_url:
        return f"https://www.aliexpress.com/item/{item_id}.html" if item_id else None

    candidate = str(item_url).strip()
    if not candidate:
        return f"https://www.aliexpress.com/item/{item_id}.html" if item_id else None

    # Some payloads return values like '/www.aliexpress.com/item/...'
    # Normalize any AliExpress domain-like value into a valid https URL.
    if candidate.startswith("/"):
        candidate = candidate.lstrip("/")
    if candidate.startswith("www.aliexpress.com"):
        return f"https://{candidate}"
    if "aliexpress.com" in candidate and not candidate.startswith("http"):
        return f"https://{candidate}"
    if candidate.startswith("http://"):
        candidate = candidate.replace("http://", "https://", 1)
    if candidate.startswith("https://"):
        # Fix double-domain: https://www.aliexpress.com//www.aliexpress.com/item/...
        # or https://www.aliexpress.com/www.aliexpress.com/item/...
        candidate = re.sub(
            r'^(https://(?:www\.)?aliexpress\.com)/+(?:www\.)?aliexpress\.com/',
            r'\1/',
            candidate,
        )
        return candidate

    if candidate.startswith("item/"):
        return f"https://www.aliexpress.com/{candidate}"

    return f"https://www.aliexpress.com/{candidate}"


def _extract_search_result_list(json_data: dict) -> list:
    result_obj = json_data.get("result", json_data)
    result_list = result_obj.get("resultList", []) or result_obj.get("results", [])
    if not result_list and "data" in json_data:
        result_list = json_data.get("data", {}).get("items", [])
    return result_list or []


def _fetch_search_results_with_fallback(params: dict, timeout: int = 15) -> list:
    """Try item_search_2..5 until one returns data.

    Optimizations:
    - Uses a preferred endpoint first based on previous successes.
    - Stops immediately on the first endpoint that returns non-empty data.
    - Calls additional endpoints only when prior ones fail or return empty lists.
    """
    global _PREFERRED_ITEM_SEARCH_ENDPOINT

    ordered_endpoints = [_PREFERRED_ITEM_SEARCH_ENDPOINT] + [
        endpoint for endpoint in ITEM_SEARCH_ENDPOINTS if endpoint != _PREFERRED_ITEM_SEARCH_ENDPOINT
    ]

    first_error: Optional[Exception] = None
    for endpoint in ordered_endpoints:
        try:
            resp = http_requests.get(
                f"{RAPIDAPI_BASE}/{endpoint}",
                headers=_rapidapi_headers(),
                params=params,
                timeout=timeout,
            )
            resp.raise_for_status()
            result_list = _extract_search_result_list(resp.json())

            if result_list:
                _PREFERRED_ITEM_SEARCH_ENDPOINT = endpoint
                return result_list
        except http_requests.RequestException as e:
            if first_error is None:
                first_error = e
            continue

    # Only surface an upstream error if all attempts failed due to request errors.
    if first_error is not None:
        raise HTTPException(status_code=502, detail=f"RapidAPI error: {first_error}")

    # All endpoints responded but none had data.
    return []

def _rapidapi_headers() -> dict:
    """Build RapidAPI headers with authentication."""
    key = os.getenv("RAPIDAPI_KEY", "")
    host = os.getenv("RAPIDAPI_HOST", "aliexpress-datahub.p.rapidapi.com")
    if not key:
        raise HTTPException(status_code=503, detail="RAPIDAPI_KEY is not configured on the server.")
    return {
        "X-Rapidapi-Key": key,
        "X-Rapidapi-Host": host,
    }

def _parse_aliexpress_product(item: dict, search_query: str | None = None) -> dict:
    """Normalize RapidAPI product response into our AliExpressProduct schema."""
    item_obj = item.get("item", item)  # Handle nested structure
    item_id = item_obj.get("itemId") or item_obj.get("id") or ""
    
    # Extract pricing
    sku = item_obj.get("sku", {})
    if isinstance(sku, dict):
        sku_def = sku.get("def", {})
        if isinstance(sku_def, dict):
            price = sku_def.get("price")
            promotion_price = sku_def.get("promotionPrice")
        else:
            price = None
            promotion_price = None
    else:
        price = None
        promotion_price = None
    
    # Extract image
    image_url = item_obj.get("image") or item_obj.get("mainImage")
    if isinstance(image_url, dict):
        image_url = image_url.get("url") or image_url.get("imgUrl")
    
    # Normalize image URL to full HTTPS URL
    if image_url and not image_url.startswith("http"):
        image_url = "https:" + image_url if image_url.startswith("//") else "https://" + image_url
    
    # Extract delivery info
    delivery = item.get("delivery", {})
    if isinstance(delivery, dict):
        free_shipping = delivery.get("freeShipping", False)
        shipping_fee = delivery.get("shippingFee")
    else:
        free_shipping = False
        shipping_fee = None
    
    # Build AliExpress URL
    item_url = item_obj.get("itemUrl")
    item_url = _normalize_aliexpress_url(item_url, item_id)
    
    return {
        "item_id": item_id,
        "title": item_obj.get("title") or item_obj.get("name") or "",
        "brand": item_obj.get("brand") or item_obj.get("brandName"),
        "category": item_obj.get("category") or item_obj.get("categoryName"),
        "image_url": image_url,
        "price": float(price) if price else None,
        "promotion_price": float(promotion_price) if promotion_price else None,
        "rating": item_obj.get("averageStarRate") or item_obj.get("rating"),
        "sales_count": _to_int(item_obj.get("sales")),
        "free_shipping": bool(free_shipping),
        "shipping_fee": float(shipping_fee) if shipping_fee else None,
        "aliexpress_url": item_url,
        "search_index": search_query,
    }

@router.get("/search", response_model=schemas.PaginatedResponse[schemas.AliExpressProductOut])
def aliexpress_search(
    q: Optional[str] = Query(None, description="Search term"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Search AliExpress products with caching. Cache-first strategy."""
    if not q or not q.strip():
        # Return recently saved AliExpress products, paginated
        query = db.query(models.AliExpressProduct).order_by(models.AliExpressProduct.id.desc())
        return paginate(query, page, size)

    cache_key = q.strip().lower()

    # Check cache first
    cached_query = db.query(models.AliExpressProduct).filter(
        or_(
            models.AliExpressProduct.search_index == cache_key,
            models.AliExpressProduct.title.ilike(f"%{cache_key}%"),
            models.AliExpressProduct.brand.ilike(f"%{cache_key}%")
        )
    )
    total_cached = cached_query.count()
    offset = (page - 1) * size

    if total_cached > offset:
        # Enough cached results to serve this page without hitting RapidAPI
        result = paginate(cached_query, page, size)
        if len(result["items"]) >= size and result["pages"] <= page:
            result["pages"] = page + 1
            result["total"] = max(result["total"], page * size + 1)
        return result

    # Cache miss - fetch from RapidAPI with endpoint fallback.
    result_list = _fetch_search_results_with_fallback(
        {
            "q": q,
            "page": page,
            "sort": "default",
            "region": "US",
            "locale": "en_US",
            "currency": "USD",
        },
        timeout=15,
    )

    parsed_items = []
    for item in result_list:
        data = _parse_aliexpress_product(item, cache_key)
        if data.get("item_id"):
            parsed_items.append(data)

    if not parsed_items:
        return {"items": [], "total": 0, "page": page, "size": size, "pages": 0}

    # Save to cache
    all_item_ids = [d["item_id"] for d in parsed_items]
    existing_by_id = {
        p.item_id: p
        for p in db.query(models.AliExpressProduct).filter(
            models.AliExpressProduct.item_id.in_(all_item_ids)
        ).all()
    }

    new_products = []
    for data in parsed_items:
        item_id = data["item_id"]
        if item_id in existing_by_id:
            existing = existing_by_id[item_id]
            if existing.search_index != cache_key:
                existing.search_index = cache_key
        else:
            new_product = models.AliExpressProduct(**data)
            db.add(new_product)
            new_products.append(new_product)

    if new_products or any(db.is_modified(p) for p in existing_by_id.values()):
        db.commit()
        for p in new_products:
            db.refresh(p)

    result = paginate(cached_query, page, size)
    has_more = len(parsed_items) >= size
    if has_more and result["pages"] <= page:
        result["pages"] = page + 1
        result["total"] = max(result["total"], page * size + 1)
    return result

@router.get("/categories", response_model=list[schemas.AliExpressCategoryGroupOut])
def get_aliexpress_categories():
    """Fetch AliExpress categories from RapidAPI using category_list_1.

    Returns main categories with nested subcategory IDs so the frontend can search
    by either main category ID or subcategory ID using item_search_2 + catId.
    """
    try:
        resp = http_requests.get(
            f"{RAPIDAPI_BASE}/category_list_1",
            headers=_rapidapi_headers(),
            timeout=15,
        )
        resp.raise_for_status()
    except http_requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"RapidAPI error: {e}")

    json_data = resp.json()
    result_list = json_data.get("result", {}).get("resultList", [])

    categories = []
    for cat in result_list:
        main_id = cat.get("id")
        main_name = cat.get("name")
        if main_id is None or not main_name:
            continue

        children = []
        for sub in cat.get("list", []) or []:
            sub_id = sub.get("id")
            sub_name = sub.get("name")
            if sub_id is None or not sub_name:
                continue
            children.append({"id": str(sub_id), "name": str(sub_name)})

        categories.append(
            {
                "id": str(main_id),
                "name": str(main_name),
                "children": children,
            }
        )

    return categories

@router.get("/category/{category_id}", response_model=schemas.PaginatedResponse[schemas.AliExpressProductOut])
def get_aliexpress_category_products(
    category_id: str,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Fetch products for a specific AliExpress category, paginated."""
    params = {
        "catId": category_id,
        "page": page,
        "sort": "default",
        "region": "US",
        "locale": "en_US",
        "currency": "USD",
    }

    result_list = _fetch_search_results_with_fallback(params=params, timeout=15)

    cache_key = f"category_{category_id}"
    parsed_items = []
    for item in result_list:
        data = _parse_aliexpress_product(item, cache_key)
        if data.get("item_id"):
            parsed_items.append(data)

    if not parsed_items:
        return {"items": [], "total": 0, "page": page, "size": size, "pages": 0}

    all_item_ids = [d["item_id"] for d in parsed_items]
    existing_by_id = {
        p.item_id: p
        for p in db.query(models.AliExpressProduct).filter(
            models.AliExpressProduct.item_id.in_(all_item_ids)
        ).all()
    }

    saved = []
    for data in parsed_items:
        item_id = data["item_id"]
        if item_id in existing_by_id:
            saved.append(existing_by_id[item_id])
        else:
            new_product = models.AliExpressProduct(**data)
            db.add(new_product)
            saved.append(new_product)

    db.commit()
    for p in saved:
        if p.id is None:
            db.refresh(p)

    has_more = len(saved) >= size
    estimated_total = page * size + (1 if has_more else 0)
    estimated_pages = page + (1 if has_more else 0)

    return {
        "items": saved,
        "total": estimated_total,
        "page": page,
        "size": size,
        "pages": estimated_pages,
    }

@router.get("/products/{item_id}", response_model=schemas.AliExpressProductOut)
def aliexpress_product_detail(item_id: str, db: Session = Depends(get_db)):
    """DB-first: returns cached product if available, else fetches from RapidAPI and caches."""
    cached = db.query(models.AliExpressProduct).filter(
        models.AliExpressProduct.item_id == item_id
    ).first()
    if cached:
        normalized_url = _normalize_aliexpress_url(cached.aliexpress_url, item_id)
        if normalized_url != cached.aliexpress_url:
            cached.aliexpress_url = normalized_url
            db.commit()
            db.refresh(cached)
        return cached

    try:
        resp = http_requests.get(
            f"{RAPIDAPI_BASE}/item_detail",
            headers=_rapidapi_headers(),
            params={"itemId": item_id},
            timeout=15,
        )
        resp.raise_for_status()
    except http_requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"RapidAPI error: {e}")

    data = _parse_aliexpress_product(resp.json())
    if not data.get("item_id"):
        raise HTTPException(status_code=404, detail="Product not found on AliExpress.")

    new_product = models.AliExpressProduct(**data)
    db.add(new_product)
    db.commit()
    db.refresh(new_product)
    return new_product

@router.get(
    "/products/{item_id}/reviews",
    response_model=schemas.PaginatedResponse[schemas.AliExpressReviewOut],
)
def get_aliexpress_reviews(
    item_id: str,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """
    Returns cached AliExpress reviews if available. If empty, fetches from RapidAPI and caches.
    """
    aliexpress_product = db.query(models.AliExpressProduct).filter(
        models.AliExpressProduct.item_id == item_id
    ).first()
    if not aliexpress_product:
        aliexpress_product = aliexpress_product_detail(item_id, db)

    # Fetch the requested page from RapidAPI and upsert into cache.
    # Tries multiple endpoint variants (item_review, item_review_2, item_review_3) until one
    # returns usable data. Falls back to DB cache if all endpoints fail.
    global _PREFERRED_ITEM_REVIEW_ENDPOINT
    ordered_review_endpoints = [_PREFERRED_ITEM_REVIEW_ENDPOINT] + [
        ep for ep in ITEM_REVIEW_ENDPOINTS if ep != _PREFERRED_ITEM_REVIEW_ENDPOINT
    ]

    def _parse_reviews_from_json(json_data: dict) -> list:
        result_obj = json_data.get("result", json_data)
        raw = (
            result_obj.get("resultList")
            or result_obj.get("reviews")
            or json_data.get("reviews")
            or []
        )
        seen_ids: set[str] = set()
        out = []
        for entry in raw:
            review_obj = entry.get("review", entry) if isinstance(entry, dict) else {}
            buyer_obj = entry.get("buyer", {}) if isinstance(entry, dict) else {}
            rid = (
                review_obj.get("reviewId")
                or review_obj.get("id")
                or review_obj.get("evaluationId")
            )
            if not rid:
                continue
            rid = str(rid)
            if rid in seen_ids:
                continue
            seen_ids.add(rid)
            body = (
                review_obj.get("reviewContent")
                or review_obj.get("reviewAdditional")
                or review_obj.get("body")
                or review_obj.get("reviewText")
                or review_obj.get("text")
                or ""
            )
            rating = (
                _to_int(review_obj.get("reviewStarts"))
                or _to_int(review_obj.get("rating"))
                or _to_int(review_obj.get("stars"))
                or 0
            )
            if not str(body).strip() and rating > 0:
                body = f"Buyer left a {rating}-star rating without written text."
            if not str(body).strip():
                continue
            helpful_yes = (
                _to_int(review_obj.get("reviewHelpfulYes"))
                or _to_int(review_obj.get("helpfulVotes"))
                or 0
            )
            buyer_title = buyer_obj.get("buyerTitle") if isinstance(buyer_obj, dict) else None
            buyer_country = buyer_obj.get("buyerCountry") if isinstance(buyer_obj, dict) else None
            reviewer_name = buyer_title or (f"Buyer ({buyer_country})" if buyer_country else "Anonymous")
            out.append({
                "rapidapi_id": rid,
                "title": None,
                "body": str(body),
                "rating": float(rating),
                "reviewer_name": reviewer_name,
                "helpful_votes": int(helpful_yes),
            })
        return out

    for endpoint in ordered_review_endpoints:
        try:
            resp = http_requests.get(
                f"{RAPIDAPI_BASE}/{endpoint}",
                headers=_rapidapi_headers(),
                params={"itemId": item_id, "page": page},
                timeout=20,
            )
            if resp.status_code != 200:
                logger.warning(
                    "[AliExpress reviews] %s returned HTTP %s for item_id=%s",
                    endpoint, resp.status_code, item_id,
                )
                continue

            normalized_reviews = _parse_reviews_from_json(resp.json())
            if not normalized_reviews:
                logger.info(
                    "[AliExpress reviews] %s returned 0 parseable reviews for item_id=%s (raw keys: %s)",
                    endpoint, item_id, list(resp.json().keys()),
                )
                continue

            # Found reviews — record preferred endpoint and upsert into DB.
            _PREFERRED_ITEM_REVIEW_ENDPOINT = endpoint
            id_set = {r["rapidapi_id"] for r in normalized_reviews}
            existing_ids = {
                row.rapidapi_id
                for row in db.query(models.AliExpressReview.rapidapi_id).filter(
                    models.AliExpressReview.rapidapi_id.in_(id_set)
                ).all()
            }
            inserted_any = False
            for r in normalized_reviews:
                if r["rapidapi_id"] in existing_ids:
                    continue
                db.add(models.AliExpressReview(
                    aliexpress_product_item_id=item_id,
                    rapidapi_id=r["rapidapi_id"],
                    title=r["title"],
                    body=r["body"],
                    rating=r["rating"],
                    reviewer_name=r["reviewer_name"],
                    helpful_votes=r["helpful_votes"],
                ))
                inserted_any = True
            if inserted_any:
                db.commit()
            break  # Stop trying more endpoints once one succeeds.
        except http_requests.RequestException as exc:
            logger.warning("[AliExpress reviews] %s request failed for item_id=%s: %s", endpoint, item_id, exc)
            continue

    query = db.query(models.AliExpressReview).filter(
        models.AliExpressReview.aliexpress_product_item_id == item_id
    ).order_by(models.AliExpressReview.helpful_votes.desc(), models.AliExpressReview.created_at.desc())

    return paginate(query, page, size)


# ---------------------------------------------------------------------------
# Native (community) reviews
# ---------------------------------------------------------------------------

@router.post(
    "/products/{item_id}/native-reviews",
    response_model=schemas.AliExpressNativeReviewOut,
)
def create_aliexpress_native_review(
    item_id: str,
    payload: schemas.AliExpressNativeReviewCreate,
    db: Session = Depends(get_db),
):
    aliexpress_product = db.query(models.AliExpressProduct).filter(
        models.AliExpressProduct.item_id == item_id
    ).first()
    if not aliexpress_product:
        raise HTTPException(status_code=404, detail="AliExpress product not found. Search for it first.")

    if not (1 <= payload.star_rating <= 5):
        raise HTTPException(status_code=400, detail="star_rating must be between 1 and 5.")

    if payload.device_id:
        existing = db.query(models.AliExpressNativeReview).filter(
            models.AliExpressNativeReview.aliexpress_product_item_id == item_id,
            models.AliExpressNativeReview.device_id == payload.device_id,
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="You have already submitted a review for this product.")

    review = models.AliExpressNativeReview(
        aliexpress_product_item_id=item_id,
        device_id=payload.device_id,
        author_name=payload.author_name or "Anonymous",
        star_rating=payload.star_rating,
        body=payload.body,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return review


@router.get(
    "/products/{item_id}/native-reviews",
    response_model=schemas.PaginatedResponse[schemas.AliExpressNativeReviewOut],
)
def list_aliexpress_native_reviews(
    item_id: str,
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    query = db.query(models.AliExpressNativeReview).filter(
        models.AliExpressNativeReview.aliexpress_product_item_id == item_id
    ).order_by(models.AliExpressNativeReview.created_at.desc())
    return paginate(query, page, size)


# ---------------------------------------------------------------------------
# AI Analysis triggers
# ---------------------------------------------------------------------------

def _run_aliexpress_ingestion_background(hyve_product_id: int, item_id: str, source: str):
    """Background worker: pipes AliExpress or native reviews into the HYVE AI pipeline."""
    import logging
    from database import SessionLocal
    from routers.ingestion import batch_ingest_reviews

    logger = logging.getLogger("hyve.aliexpress")
    db = SessionLocal()
    try:
        if source == "aliexpress":
            raw_reviews = db.query(models.AliExpressReview).filter(
                models.AliExpressReview.aliexpress_product_item_id == item_id
            ).all()
            review_items = [
                schemas.BatchReviewItem(text=r.body, source="aliexpress", star_rating=int(r.rating or 3))
                for r in raw_reviews if r.body and r.body.strip()
            ]
        else:  # native
            raw_reviews = db.query(models.AliExpressNativeReview).filter(
                models.AliExpressNativeReview.aliexpress_product_item_id == item_id
            ).all()
            review_items = [
                schemas.BatchReviewItem(text=r.body, source="native_hyve", star_rating=int(r.star_rating or 3))
                for r in raw_reviews if r.body and r.body.strip()
            ]

        if not review_items:
            logger.warning(f"[AliExpress ingestion] No review items to process for item_id={item_id} source={source}")
            product = db.query(models.Product).filter(models.Product.id == hyve_product_id).first()
            if product:
                product.status = "ready"
                product.processing_step = "Analysis Complete (no reviews found)"
                db.commit()
            return

        logger.info(f"[AliExpress ingestion] Starting pipeline for product_id={hyve_product_id}, {len(review_items)} reviews, source={source}")
        req = schemas.BatchIngestRequest(reviews=review_items)
        batch_ingest_reviews(hyve_product_id, req, db)

        product = db.query(models.Product).filter(models.Product.id == hyve_product_id).first()
        if product:
            product.status = "ready"
            product.processing_step = "Analysis Complete"
            db.commit()
        logger.info(f"[AliExpress ingestion] Completed for product_id={hyve_product_id}")
    except Exception as e:
        logger.error(f"[AliExpress ingestion] Failed for product_id={hyve_product_id} item_id={item_id}: {e}", exc_info=True)
        try:
            product = db.query(models.Product).filter(models.Product.id == hyve_product_id).first()
            if product:
                product.status = "error"
                product.processing_step = f"Analysis failed: {str(e)[:120]}"
                db.commit()
        except Exception as inner:
            logger.error(f"[AliExpress ingestion] Failed to set error status: {inner}")
    finally:
        db.close()


@router.post("/products/{item_id}/analyze-aliexpress")
def analyze_aliexpress_reviews(
    item_id: str,
    db: Session = Depends(get_db),
):
    """Pipes all cached AliExpress reviews through the HYVE AI pipeline."""
    from core.tasks import enqueue

    aliexpress_product = db.query(models.AliExpressProduct).filter(
        models.AliExpressProduct.item_id == item_id
    ).first()
    if not aliexpress_product:
        raise HTTPException(status_code=404, detail="AliExpress product not found.")

    review_count = db.query(models.AliExpressReview).filter(
        models.AliExpressReview.aliexpress_product_item_id == item_id
    ).count()
    if review_count == 0:
        raise HTTPException(status_code=400, detail="No AliExpress reviews collected yet for this product.")

    hyve_product = db.query(models.Product).filter(
        models.Product.name == aliexpress_product.title
    ).first()
    if not hyve_product:
        from pipeline import predict_product_category
        cat = aliexpress_product.category or predict_product_category(aliexpress_product.title)
        hyve_product = models.Product(
            name=aliexpress_product.title,
            category=cat,
            status="processing",
            ingest_type="aliexpress",
            processing_step="Analyzing AliExpress Reviews",
            image_url=aliexpress_product.image_url,
        )
        db.add(hyve_product)
        db.commit()
        db.refresh(hyve_product)
    else:
        hyve_product.status = "processing"
        hyve_product.processing_step = "Queueing AI Pipeline"
        if aliexpress_product.image_url and not hyve_product.image_url:
            hyve_product.image_url = aliexpress_product.image_url
        db.commit()

    enqueue(_run_aliexpress_ingestion_background, hyve_product.id, item_id, "aliexpress")

    return {
        "product_id": hyve_product.id,
        "item_id": item_id,
        "status": "processing",
        "message": "AI analysis of AliExpress reviews started in the background.",
    }


@router.post("/products/{item_id}/analyze-native")
def analyze_aliexpress_native_reviews(
    item_id: str,
    db: Session = Depends(get_db),
):
    """Pipes all native HYVE reviews for this AliExpress product through the AI pipeline."""
    from core.tasks import enqueue

    aliexpress_product = db.query(models.AliExpressProduct).filter(
        models.AliExpressProduct.item_id == item_id
    ).first()
    if not aliexpress_product:
        raise HTTPException(status_code=404, detail="AliExpress product not found.")

    native_count = db.query(models.AliExpressNativeReview).filter(
        models.AliExpressNativeReview.aliexpress_product_item_id == item_id
    ).count()
    if native_count == 0:
        raise HTTPException(
            status_code=400,
            detail="No native reviews to analyze yet. Be the first to leave a review!",
        )

    hyve_product = db.query(models.Product).filter(
        models.Product.name == aliexpress_product.title
    ).first()
    if not hyve_product:
        from pipeline import predict_product_category
        cat = aliexpress_product.category or predict_product_category(aliexpress_product.title)
        hyve_product = models.Product(
            name=aliexpress_product.title,
            category=cat,
            status="processing",
            ingest_type="native",
            processing_step="Analyzing Native Reviews",
            image_url=aliexpress_product.image_url,
        )
        db.add(hyve_product)
        db.commit()
        db.refresh(hyve_product)
    else:
        hyve_product.status = "processing"
        hyve_product.processing_step = "Queueing AI Pipeline"
        if aliexpress_product.image_url and not hyve_product.image_url:
            hyve_product.image_url = aliexpress_product.image_url
        db.commit()

    enqueue(_run_aliexpress_ingestion_background, hyve_product.id, item_id, "native")

    return {
        "product_id": hyve_product.id,
        "item_id": item_id,
        "status": "processing",
        "message": "AI analysis of native reviews started in the background.",
    }

