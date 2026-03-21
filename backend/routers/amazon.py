import os
import requests as http_requests
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
import schemas
import models
from database import get_db
from core.pagination import paginate

router = APIRouter(prefix="/amazon", tags=["Amazon Catalog", "Native Reviews"])

CANOPY_BASE = "https://rest.canopyapi.co"

def _canopy_headers() -> dict:
    key = os.getenv("CANOPY_API_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="CANOPY_API_KEY is not configured on the server.")
    return {"API-KEY": key}

def _parse_canopy_product(item: dict, search_query: str | None = None) -> dict:
    """Normalise a Canopy API product dict into our AmazonProduct schema."""
    p = item.get("product", item)
    asin = p.get("asin") or item.get("asin") or ""

    price_raw = p.get("price", {})
    if isinstance(price_raw, dict):
        price = price_raw.get("value") or price_raw.get("current_price")
    else:
        price = float(price_raw) if price_raw else None

    images = p.get("images") or p.get("image_urls") or []
    image_url = images[0] if images else (p.get("image") or {}).get("url")
    if not image_url:
        image_url = p.get("mainImageUrl")

    return {
        "asin": asin,
        "title": p.get("title") or p.get("name") or "",
        "brand": p.get("brand") or p.get("brand_name"),
        "category": p.get("category") or p.get("breadcrumb_text"),
        "description": p.get("description") or p.get("short_description"),
        "image_url": image_url,
        "price": price,
        "rating": p.get("stars") or p.get("average_rating") or p.get("rating"),
        "review_count": p.get("reviews_total") or p.get("ratings_total") or p.get("ratingsTotal"),
        "amazon_url": p.get("url") or (f"https://www.amazon.com/dp/{asin}" if asin else None),
        "search_index": search_query,
    }

@router.get("/search", response_model=list[schemas.AmazonProductOut])
def amazon_search(
    q: Optional[str] = Query(None, description="Search term"),
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
):
    if not q or not q.strip():
        # Return 20 most recently saved Amazon products
        return db.query(models.AmazonProduct).order_by(models.AmazonProduct.id.desc()).limit(20).all()

    cache_key = q.strip().lower()

    # Two-tier: search local DB broadly first
    from sqlalchemy import or_
    cached = db.query(models.AmazonProduct).filter(
        or_(
            models.AmazonProduct.search_index == cache_key,
            models.AmazonProduct.title.ilike(f"%{cache_key}%"),
            models.AmazonProduct.brand.ilike(f"%{cache_key}%")
        )
    ).limit(20).all()
    
    if cached:
        return cached

    try:
        resp = http_requests.get(
            f"{CANOPY_BASE}/api/amazon/search",
            headers=_canopy_headers(),
            params={"searchTerm": q, "page": page, "limit": 20},
            timeout=15,
        )
        resp.raise_for_status()
    except http_requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Canopy API error: {e}")

    json_data = resp.json()
    items_to_parse = []
    
    # Try the newer GraphQL-like Canopy wrapper first (data -> amazonProductSearchResults -> productResults -> results)
    if "data" in json_data and "amazonProductSearchResults" in json_data["data"]:
        product_results = json_data["data"]["amazonProductSearchResults"].get("productResults", {})
        items_to_parse = product_results.get("results", [])
    elif "search_results" in json_data:
        search_data = json_data["search_results"]
        if isinstance(search_data, dict):
            for page_data in search_data.values():
                if isinstance(page_data, dict) and "organic" in page_data:
                    items_to_parse.extend(page_data["organic"])
        elif isinstance(search_data, list):
            items_to_parse = search_data
    elif "organic" in json_data:
        items_to_parse = json_data.get("organic", [])
    
    saved = []
    for item in items_to_parse:
        data = _parse_canopy_product(item, cache_key)
        if not data.get("asin"):
            continue

        existing = db.query(models.AmazonProduct).filter(
            models.AmazonProduct.asin == data["asin"]
        ).first()
        if existing:
            if existing.search_index != cache_key:
                existing.search_index = cache_key
                db.commit()
                db.refresh(existing)
            saved.append(existing)
        else:
            new_product = models.AmazonProduct(**data)
            db.add(new_product)
            db.commit()
            db.refresh(new_product)
            saved.append(new_product)

    return saved

@router.get("/categories")
def get_amazon_categories(db: Session = Depends(get_db)):
    """Fetch all top-level Amazon categories from Canopy or local cache."""
    count = db.query(models.AmazonCategory).count() # touch to reload
    if count > 0:
        cached = db.query(models.AmazonCategory).all()
        return [{"categoryId": c.canopy_id, "name": c.name, "id": c.canopy_id} for c in cached]

    try:
        resp = http_requests.get(
            f"{CANOPY_BASE}/api/amazon/categories",
            headers=_canopy_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        json_data = resp.json()
        
        cats = []
        # New Canopy GraphQL-like structure
        if "data" in json_data and "amazonProductCategoryTaxonomy" in json_data["data"]:
            cats = json_data["data"]["amazonProductCategoryTaxonomy"]
        else:
            # Fallback to older structure
            cats = json_data.get("categories", []) if isinstance(json_data, dict) else json_data

        saved_categories = []
        for cat in cats:
            cat_id = cat.get("categoryId") or cat.get("id")
            if not cat_id or not cat.get("name"):
                continue
            new_cat = models.AmazonCategory(
                canopy_id=str(cat_id),
                name=cat.get("name"),
                url=cat.get("url"),
                path=cat.get("path") or cat.get("breadcrumbPath"),
                has_children=cat.get("hasChildren", False) or bool(cat.get("subcategories"))
            )
            db.add(new_cat)
            saved_categories.append(new_cat)
            
        if saved_categories:
            db.commit()
            
        return [{"categoryId": c.canopy_id, "name": c.name, "id": c.canopy_id} for c in saved_categories]
    except http_requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Canopy API error: {e}")

@router.get("/category/{category_id}", response_model=list[schemas.AmazonProductOut])
def get_amazon_category_products(
    category_id: str,
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
):
    """Fetch products for a specific category."""
    try:
        resp = http_requests.get(
            f"{CANOPY_BASE}/api/amazon/category",
            headers=_canopy_headers(),
            params={"categoryId": category_id, "page": page},
            timeout=15,
        )
        resp.raise_for_status()
    except http_requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Canopy API error: {e}")

    json_data = resp.json()
    data_node = []
    
    if "data" in json_data and "amazonProductCategory" in json_data["data"]:
        product_results = json_data["data"]["amazonProductCategory"].get("productResults", {})
        data_node = product_results.get("results", [])
    elif "category_results" in json_data:
        data_node = json_data.get("category_results", [])
    elif "organic" in json_data:
        data_node = json_data.get("organic", [])
    else:
        data_node = json_data.get("results", [])

    cache_key = f"category_{category_id}"
    saved = []
    for item in data_node:
        data = _parse_canopy_product(item, cache_key)
        if not data.get("asin"):
            continue

        existing = db.query(models.AmazonProduct).filter(
            models.AmazonProduct.asin == data["asin"]
        ).first()
        if existing:
            saved.append(existing)
        else:
            new_product = models.AmazonProduct(**data)
            db.add(new_product)
            db.commit()
            db.refresh(new_product)
            saved.append(new_product)

    return saved

@router.get("/products/{asin}", response_model=schemas.AmazonProductOut)
def amazon_product_detail(asin: str, db: Session = Depends(get_db)):
    """DB-first: returns cached product if available, else fetches from Canopy and caches."""
    cached = db.query(models.AmazonProduct).filter(
        models.AmazonProduct.asin == asin
    ).first()
    if cached:
        return cached

    try:
        resp = http_requests.get(
            f"{CANOPY_BASE}/api/amazon/product",
            headers=_canopy_headers(),
            params={"asin": asin},
            timeout=15,
        )
        resp.raise_for_status()
    except http_requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Canopy API error: {e}")

    data = _parse_canopy_product(resp.json())
    if not data.get("asin"):
        raise HTTPException(status_code=404, detail="Product not found on Amazon.")

    new_product = models.AmazonProduct(**data)
    db.add(new_product)
    db.commit()
    db.refresh(new_product)
    return new_product


@router.get(
    "/products/{asin}/reviews",
    response_model=schemas.PaginatedResponse[schemas.AmazonReviewOut],
)
def get_amazon_reviews(
    asin: str,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """
    Returns raw Canopy reviews if we have them. If empty, tries to fetch from Canopy and cache them.
    Unlike fetch-and-analyze, this is purely to display the raw review text on the AmazonProductPage.
    """
    amazon_product = db.query(models.AmazonProduct).filter(
        models.AmazonProduct.asin == asin
    ).first()
    if not amazon_product:
        amazon_product = amazon_product_detail(asin, db)

    # Check cache first
    cached_count = db.query(models.AmazonReview).filter(models.AmazonReview.amazon_product_asin == asin).count()
    if cached_count == 0:
        # Fetch up to 2 pages of reviews to seed the cache quickly
        for canopy_page in [1, 2]:
            try:
                resp = http_requests.get(
                    f"{CANOPY_BASE}/api/amazon/product/reviews",
                    headers=_canopy_headers(),
                    params={"asin": asin, "page": canopy_page},
                    timeout=20,
                )
                if resp.status_code == 200:
                    json_data = resp.json()
                    # Parse from data.amazonProduct.topReviews
                    reviews_raw = []
                    if "data" in json_data and "amazonProduct" in json_data["data"]:
                        reviews_raw = json_data["data"]["amazonProduct"].get("topReviews", [])
                    elif "reviews" in json_data:
                        reviews_raw = json_data.get("reviews", [])
                    
                    if not reviews_raw:
                        break # no more reviews
                        
                    for r in reviews_raw:
                        canopy_id = r.get("id")
                        if not canopy_id:
                            continue
                        
                        existing = db.query(models.AmazonReview).filter(models.AmazonReview.canopy_id == canopy_id).first()
                        if not existing:
                            reviewer = r.get("reviewer", {})
                            reviewer_name = reviewer.get("name") if isinstance(reviewer, dict) else r.get("author")
                            
                            new_rev = models.AmazonReview(
                                amazon_product_asin=asin,
                                canopy_id=canopy_id,
                                title=r.get("title"),
                                body=r.get("body") or r.get("review_text") or r.get("text", ""),
                                rating=float(r.get("rating") or r.get("stars") or 0.0),
                                reviewer_name=reviewer_name,
                                verified_purchase=bool(r.get("verifiedPurchase") or r.get("verified_purchase")),
                                helpful_votes=int(r.get("helpfulVotes") or r.get("helpful_votes") or 0)
                            )
                            db.add(new_rev)
                    db.commit()
            except Exception as e:
                print(f"Canopy silent fail during cache phase: {e}")
                pass 

    query = db.query(models.AmazonReview).filter(
        models.AmazonReview.amazon_product_asin == asin
    ).order_by(models.AmazonReview.helpful_votes.desc(), models.AmazonReview.created_at.desc())
    
    return paginate(query, page, size)

def run_amazon_ingestion_background(hyve_product_id: int, asin: str):
    from database import SessionLocal
    from routers.ingestion import batch_ingest_reviews
    db = SessionLocal()
    try:
        amazon_reviews = db.query(models.AmazonReview).filter(
            models.AmazonReview.amazon_product_asin == asin
        ).all()
        if not amazon_reviews:
            return

        review_items = []
        for r in amazon_reviews:
            review_items.append(schemas.BatchReviewItem(
                text=r.body,
                source=f"amazon_canopy_{asin}",
                star_rating=r.rating,
            ))
            
        req = schemas.BatchIngestRequest(reviews=review_items)
        batch_ingest_reviews(hyve_product_id, req, db)
        
        product = db.query(models.Product).filter(models.Product.id == hyve_product_id).first()
        if product:
            product.status = "ready"
            product.processing_step = "Analysis Complete"
            db.commit()
    except Exception as e:
        print(f"DEBUG: Background Amazon ingestion failed: {e}")
        product = db.query(models.Product).filter(models.Product.id == hyve_product_id).first()
        if product:
            product.status = "error"
            db.commit()
    finally:
        db.close()

@router.post("/products/{asin}/analyze-amazon")
def analyze_amazon_reviews(
    asin: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Pipes all cached Amazon reviews for this product through the AI analysis engine.
    Runs asynchronously and immediately redirects the user.
    """
    amazon_product = db.query(models.AmazonProduct).filter(
        models.AmazonProduct.asin == asin
    ).first()
    if not amazon_product:
        raise HTTPException(status_code=404, detail="Amazon product not found.")

    amazon_reviews = db.query(models.AmazonReview).filter(
        models.AmazonReview.amazon_product_asin == asin
    ).count()
    if amazon_reviews == 0:
        raise HTTPException(status_code=400, detail="No Amazon reviews collected yet for this product.")

    hyve_product = db.query(models.Product).filter(
        models.Product.name == amazon_product.title
    ).first()
    if not hyve_product:
        from pipeline import predict_product_category
        cat = amazon_product.category or predict_product_category(amazon_product.title)
        hyve_product = models.Product(
            name=amazon_product.title,
            category=cat,
            status="processing",
            ingest_type="canopy_amazon",
            processing_step="Fetching Amazon Reviews",
        )
        db.add(hyve_product)
        db.commit()
        db.refresh(hyve_product)
    else:
        hyve_product.status = "processing"
        hyve_product.processing_step = "Queueing AI Pipeline"
        db.commit()

    background_tasks.add_task(run_amazon_ingestion_background, hyve_product.id, asin)

    return {
        "product_id": hyve_product.id,
        "asin": asin,
        "status": "processing",
        "is_batch": False,
        "message": f"AI analysis of Amazon reviews started in the background.",
    }

@router.post("/products/{asin}/native-reviews", response_model=schemas.NativeReviewOut)
def create_native_review(
    asin: str,
    payload: schemas.NativeReviewCreate,
    db: Session = Depends(get_db),
):
    amazon_product = db.query(models.AmazonProduct).filter(
        models.AmazonProduct.asin == asin
    ).first()
    if not amazon_product:
        raise HTTPException(status_code=404, detail="Amazon product not found. Search for it first.")

    if not (1 <= payload.star_rating <= 5):
        raise HTTPException(status_code=400, detail="star_rating must be between 1 and 5.")

    if payload.device_id:
        existing_native = db.query(models.NativeReview).filter(
            models.NativeReview.amazon_product_asin == asin,
            models.NativeReview.device_id == payload.device_id
        ).first()
        if existing_native:
            raise HTTPException(status_code=400, detail="You have already submitted a review for this product.")

    native_review = models.NativeReview(
        amazon_product_asin=asin,
        device_id=payload.device_id,
        author_name=payload.author_name or "Anonymous",
        star_rating=payload.star_rating,
        body=payload.body,
    )
    db.add(native_review)
    db.commit()
    db.refresh(native_review)
    return native_review


@router.get("/products/{asin}/native-reviews", response_model=schemas.PaginatedResponse[schemas.NativeReviewOut])
def list_native_reviews(
    asin: str,
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    query = db.query(models.NativeReview).filter(
        models.NativeReview.amazon_product_asin == asin
    ).order_by(models.NativeReview.created_at.desc())
    return paginate(query, page, size)

def run_native_ingestion_background(hyve_product_id: int, asin: str):
    from database import SessionLocal
    from routers.ingestion import batch_ingest_reviews
    db = SessionLocal()
    try:
        native_reviews = db.query(models.NativeReview).filter(
            models.NativeReview.amazon_product_asin == asin
        ).all()
        if not native_reviews:
            return

        review_items = []
        for r in native_reviews:
            review_items.append(schemas.BatchReviewItem(
                text=r.body,
                source="native_hyve",
                star_rating=r.star_rating,
            ))
            
        req = schemas.BatchIngestRequest(reviews=review_items)
        batch_ingest_reviews(hyve_product_id, req, db)
        
        product = db.query(models.Product).filter(models.Product.id == hyve_product_id).first()
        if product:
            product.status = "ready"
            product.processing_step = "Analysis Complete"
            db.commit()
    except Exception as e:
        print(f"DEBUG: Background Native ingestion failed: {e}")
        product = db.query(models.Product).filter(models.Product.id == hyve_product_id).first()
        if product:
            product.status = "error"
            db.commit()
    finally:
        db.close()

@router.post("/products/{asin}/analyze-native")
def analyze_native_reviews(
    asin: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Pipes all native HYVE reviews for this product through the AI analysis engine.
    Runs asynchronously and redirects instantly.
    """
    amazon_product = db.query(models.AmazonProduct).filter(
        models.AmazonProduct.asin == asin
    ).first()
    if not amazon_product:
        raise HTTPException(status_code=404, detail="Amazon product not found.")

    native_reviews_count = db.query(models.NativeReview).filter(
        models.NativeReview.amazon_product_asin == asin
    ).count()
    if native_reviews_count == 0:
        raise HTTPException(status_code=400, detail="No native reviews to analyze yet. Be the first to leave a review!")

    hyve_product = db.query(models.Product).filter(
        models.Product.name == amazon_product.title
    ).first()
    if not hyve_product:
        from pipeline import predict_product_category
        cat = amazon_product.category or predict_product_category(amazon_product.title)
        hyve_product = models.Product(
            name=amazon_product.title,
            category=cat,
            status="processing",
            ingest_type="native",
            processing_step="Analyzing Native Reviews",
        )
        db.add(hyve_product)
        db.commit()
        db.refresh(hyve_product)
    else:
        hyve_product.status = "processing"
        hyve_product.processing_step = "Queueing AI Pipeline"
        db.commit()

    background_tasks.add_task(run_native_ingestion_background, hyve_product.id, asin)

    return {
        "product_id": hyve_product.id,
        "asin": asin,
        "status": "processing",
        "is_batch": False,
        "message": f"AI analysis of native reviews started in the background.",
    }
