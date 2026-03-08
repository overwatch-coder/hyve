from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
import math
import sys
import os
import logging
import jwt
from datetime import datetime, timedelta

# Suppress Windows asyncio ProactorEventLoop ConnectionResetError
if sys.platform == "win32":
    import asyncio
    logging.getLogger("asyncio").setLevel(logging.CRITICAL)

# Internal imports
from dotenv import load_dotenv
load_dotenv()

import models
import schemas
from database import engine, get_db
from pipeline import process_review_sync, cluster_product_claims
from sqlalchemy.orm import joinedload, subqueryload

# Try to import the Celery worker; if Redis/Celery not available, fall back to sync
try:
    from worker import process_review_ai_task
    CELERY_AVAILABLE = True
except Exception:
    CELERY_AVAILABLE = False

# Create the database tables
models.Base.metadata.create_all(bind=engine)

# Ad-hoc migration for SQLite: Add processing_step to products if missing
from sqlalchemy import text
with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE products ADD COLUMN processing_step VARCHAR"))
        conn.commit()
        print("MIGRATION: Added processing_step column to products table.")
    except Exception:
        pass
    try:
        conn.execute(text("ALTER TABLE products ADD COLUMN summary_seller TEXT"))
        conn.commit()
    except Exception: pass
    try:
        conn.execute(text("ALTER TABLE products ADD COLUMN advices_seller TEXT"))
        conn.commit()
    except Exception: pass

app = FastAPI(
    title="HYVE API",
    description="Backend API for structured consumer reviews and AI analysis.",
    version="1.0.0",
)

# Configure CORS for Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Admin Auth ---
security = HTTPBearer(auto_error=False)

JWT_SECRET = os.getenv("JWT_SECRET", "hyve_fallback_secret")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")

class AdminLoginRequest(BaseModel):
    password: str

def admin_required(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Dependency that validates JWT bearer token for admin routes."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
        if payload.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Not authorized")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.post("/admin/login", tags=["Admin"])
def admin_login(req: AdminLoginRequest):
    """Authenticate admin with password, returns JWT token."""
    if req.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    token = jwt.encode(
        {"role": "admin", "exp": datetime.utcnow() + timedelta(hours=24)},
        JWT_SECRET,
        algorithm="HS256",
    )
    return {"token": token}

@app.get("/admin/verify", tags=["Admin"])
def admin_verify(admin=Depends(admin_required)):
    """Verify that the admin token is still valid."""
    return {"status": "valid", "role": "admin"}

# --- Pagination Helper ---
def paginate(query, page: int, size: int):
    total = query.count()
    items = query.offset((page - 1) * size).limit(size).all()
    pages = math.ceil(total / size) if size > 0 else 0
    return {
        "items": items,
        "total": total,
        "page": page,
        "size": size,
        "pages": pages
    }

# --- Products ---
@app.get("/products", response_model=schemas.PaginatedResponse[schemas.Product], tags=["Products"])
def get_products(
    page: int = Query(1, ge=1), 
    size: int = Query(10, ge=1, le=100), 
    db: Session = Depends(get_db)
):
    query = db.query(models.Product).options(
        subqueryload(models.Product.themes)
    )
    return paginate(query, page, size)

@app.post("/products", response_model=schemas.Product, tags=["Products"])
def create_product(product: schemas.ProductCreate, db: Session = Depends(get_db)):
    db_product = models.Product(**product.model_dump())
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product

@app.get("/products/{product_id}", response_model=schemas.Product, tags=["Products"])
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(models.Product).options(
        joinedload(models.Product.themes).joinedload(models.Theme.claims)
    ).filter(models.Product.id == product_id).first()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@app.post("/products/{product_id}/summary/regenerate", response_model=schemas.Product, tags=["Products"])
def regenerate_product_summary(product_id: int, req: schemas.RegenerateSummaryRequest, db: Session = Depends(get_db)):
    from pipeline import extract_and_update_summary
    product = extract_and_update_summary(product_id, db, req.focus)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@app.post("/products/{product_id}/chat", tags=["Products"])
def chat_with_product_ai(product_id: int, req: schemas.ChatRequest, db: Session = Depends(get_db)):
    """API endpoint for the product assistant chatbot. Returns a stream of text fragments."""
    from pipeline import ask_product_assistant
    return StreamingResponse(
        ask_product_assistant(product_id, req.query, db),
        media_type="text/plain"
    )

@app.delete("/products/{product_id}", tags=["Products"])
def delete_product(product_id: int, db: Session = Depends(get_db), admin=Depends(admin_required)):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(product)
    db.commit()
    return {"status": "success", "message": f"Product {product_id} deleted"}

# --- Reviews ---
@app.get("/reviews", response_model=schemas.PaginatedResponse[schemas.Review], tags=["Reviews"])
def get_reviews(
    product_id: int, 
    page: int = Query(1, ge=1), 
    size: int = Query(10, ge=1, le=100), 
    db: Session = Depends(get_db)
):
    query = db.query(models.Review).filter(models.Review.product_id == product_id)
    return paginate(query, page, size)

@app.post("/reviews", response_model=schemas.Review, tags=["Reviews"])
def create_review(review: schemas.ReviewCreate, db: Session = Depends(get_db)):
    # Validate product exists
    if not db.query(models.Product).filter(models.Product.id == review.product_id).first():
        raise HTTPException(status_code=404, detail="Product not found")
        
    db_review = models.Review(**review.model_dump())
    db.add(db_review)
    db.commit()
    db.refresh(db_review)
    
    # Use Celery if available, otherwise process synchronously
    if CELERY_AVAILABLE:
        try:
            process_review_ai_task.delay(db_review.id)
        except Exception:
            process_review_sync(db_review.id, db)
    else:
        process_review_sync(db_review.id, db)
    
    return db_review

# --- Themes ---
@app.get("/themes", response_model=schemas.PaginatedResponse[schemas.Theme], tags=["Themes"])
def get_themes(
    product_id: int, 
    page: int = Query(1, ge=1), 
    size: int = Query(10, ge=1, le=100), 
    db: Session = Depends(get_db)
):
    query = db.query(models.Theme).filter(models.Theme.product_id == product_id)
    return paginate(query, page, size)

# --- Claims ---
@app.get("/claims", response_model=schemas.PaginatedResponse[schemas.Claim], tags=["Claims"])
def get_claims(
    theme_id: int = Query(None),
    review_id: int = Query(None),
    page: int = Query(1, ge=1), 
    size: int = Query(10, ge=1, le=100), 
    db: Session = Depends(get_db)
):
    query = db.query(models.Claim)
    if theme_id:
        query = query.filter(models.Claim.theme_id == theme_id)
    if review_id:
        query = query.filter(models.Claim.review_id == review_id)
    
    return paginate(query, page, size)


# --- Stats ---
class StatsResponse(schemas.BaseModel):
    total_products: int
    total_claims: int
    total_themes: int
    avg_sentiment: float

# REMOVED: @app.get("/stats")


# --- Product Analytics ---
class SentimentCounts(schemas.BaseModel):
    positive: int = 0
    negative: int = 0
    neutral: int = 0

class ThemeAnalytics(schemas.BaseModel):
    id: int
    name: str
    claim_count: int
    positive_ratio: float
    avg_severity: float
    sentiment_counts: SentimentCounts

class RiskStrengthItem(schemas.BaseModel):
    theme: str
    ratio: float
    severity_avg: float

class ProductAnalyticsResponse(schemas.BaseModel):
    product_id: int
    product_name: str
    category: str
    review_count: int
    claim_count: int
    overall_sentiment: float
    summary: str | None = None
    advices: list[str] | None = None
    summary_seller: str | None = None
    advices_seller: list[str] | None = None
    critical_risk_factor: RiskStrengthItem | None = None
    strongest_selling_point: RiskStrengthItem | None = None
    theme_breakdown: list[ThemeAnalytics]

@app.get(
    "/products/{product_id}/analytics",
    response_model=ProductAnalyticsResponse,
    tags=["Analytics"],
    summary="Get weighted analytics for a product",
)
def get_product_analytics(product_id: int, db: Session = Depends(get_db)):
    """Compute per-product weighted analytics: risk factor, selling point, theme breakdown."""
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    review_count = db.query(models.Review).filter(models.Review.product_id == product_id).count()
    themes = db.query(models.Theme).filter(models.Theme.product_id == product_id).all()

    theme_analytics = []
    for theme in themes:
        claims = db.query(models.Claim).filter(models.Claim.theme_id == theme.id).all()
        pos = sum(1 for c in claims if c.sentiment_polarity == "positive")
        neg = sum(1 for c in claims if c.sentiment_polarity == "negative")
        neu = sum(1 for c in claims if c.sentiment_polarity == "neutral")
        avg_sev = round(sum(c.severity for c in claims) / max(len(claims), 1), 2)

        theme_analytics.append(ThemeAnalytics(
            id=theme.id,
            name=theme.name,
            claim_count=theme.claim_count,
            positive_ratio=theme.positive_ratio,
            avg_severity=avg_sev,
            sentiment_counts=SentimentCounts(positive=pos, negative=neg, neutral=neu),
        ))

    total_claims = sum(t.claim_count for t in theme_analytics)

    # Identify risk and strength
    risk = None
    strength = None
    if theme_analytics:
        # Most negative = lowest positive_ratio weighted by severity
        most_negative = min(theme_analytics, key=lambda t: t.positive_ratio)
        if most_negative.positive_ratio < 0.5:
            risk = RiskStrengthItem(
                theme=most_negative.name,
                ratio=round(1 - most_negative.positive_ratio, 2),
                severity_avg=most_negative.avg_severity,
            )
        # Most positive = highest positive_ratio
        most_positive = max(theme_analytics, key=lambda t: t.positive_ratio)
        if most_positive.positive_ratio > 0.5:
            strength = RiskStrengthItem(
                theme=most_positive.name,
                ratio=most_positive.positive_ratio,
                severity_avg=most_positive.avg_severity,
            )

    import json
    adv_consumer = []
    if product.advices:
        try: adv_consumer = json.loads(product.advices)
        except: adv_consumer = [product.advices]
        
    adv_seller = []
    if product.advices_seller:
        try: adv_seller = json.loads(product.advices_seller)
        except: adv_seller = [product.advices_seller]

    return ProductAnalyticsResponse(
        product_id=product.id,
        product_name=product.name,
        category=product.category,
        review_count=review_count,
        claim_count=total_claims,
        overall_sentiment=product.overall_sentiment_score,
        summary=product.summary,
        advices=adv_consumer,
        summary_seller=product.summary_seller,
        advices_seller=adv_seller,
        critical_risk_factor=risk,
        strongest_selling_point=strength,
        theme_breakdown=theme_analytics,
    )


# --- Batch Ingestion ---
class BatchReviewItem(schemas.BaseModel):
    text: str
    source: str = "batch"
    star_rating: float | None = None

class BatchIngestRequest(schemas.BaseModel):
    reviews: list[BatchReviewItem]

class BatchIngestResponse(schemas.BaseModel):
    product_id: int
    reviews_ingested: int
    claims_extracted: int
    themes_created: int

@app.post(
    "/products/{product_id}/ingest",
    response_model=BatchIngestResponse,
    tags=["Ingestion"],
    summary="Batch ingest reviews and run AI pipeline",
)
def batch_ingest_reviews(
    product_id: int,
    payload: BatchIngestRequest,
    db: Session = Depends(get_db),
):
    """
    Ingests a batch of reviews for a product, extracts claims from each via the
    LLM, then clusters all claims into themes. Runs synchronously — no Celery required.
    """
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    total_claims = 0
    for item in payload.reviews:
        # Create review
        review = models.Review(
            product_id=product_id,
            original_text=item.text,
            source=item.source,
            star_rating=item.star_rating,
        )
        db.add(review)
        db.commit()
        db.refresh(review)

        # Process through AI pipeline synchronously
        result = process_review_sync(review.id, db)
        total_claims += result.get("claims_extracted", 0)

    # Re-cluster all claims for this product
    cluster_result = cluster_product_claims(product_id, db)

    return BatchIngestResponse(
        product_id=product_id,
        reviews_ingested=len(payload.reviews),
        claims_extracted=total_claims,
        themes_created=cluster_result.get("themes_created", 0),
    )


@app.post(
    "/products/{product_id}/recluster",
    tags=["Ingestion"],
    summary="Re-cluster all claims for a product into themes",
)
def recluster_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    result = cluster_product_claims(product_id, db)
    return result


from fastapi import UploadFile, File, BackgroundTasks
import pandas as pd
import io

@app.post(
    "/products/{product_id}/ingest/csv",
    response_model=BatchIngestResponse,
    tags=["Ingestion"],
    summary="Ingest reviews from a CSV file via LLM column matching",
)
async def ingest_csv(
    product_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Parses a CSV/Excel file, uses an LLM to identify the Review and Rating columns,
    then processes the data into the standard ingestion pipeline.
    """
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    contents = await file.read()
    
    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents))
        elif file.filename.endswith((".xls", ".xlsx")):
            df = pd.read_excel(io.BytesIO(contents))
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing file: {e}")

    if df.empty:
        raise HTTPException(status_code=400, detail="File is empty")

    from pipeline import detect_csv_columns
    
    # Get a sample of the first 5 rows
    sample_data = df.head(5).to_dict(orient="records")
    columns = df.columns.tolist()
    
    # Use LLM to find the right columns
    mapping_result = detect_csv_columns(columns, sample_data)
    
    review_col = mapping_result.get("review_column")
    rating_col = mapping_result.get("rating_column")

    if not review_col or review_col not in df.columns:
        raise HTTPException(status_code=422, detail="Could not confidently identify the review text column via AI.")

    reviews_payload = []
    # Drop rows where the review text is empty
    df = df.dropna(subset=[review_col])
    
    for _, row in df.iterrows():
        text = str(row[review_col]).strip()
        if len(text) < 5:
            continue
            
        rating = None
        if rating_col and rating_col in df.columns:
            try:
                rating = float(row[rating_col])
            except (ValueError, TypeError):
                pass
                
        reviews_payload.append(BatchReviewItem(
            text=text,
            source=f"csv_upload_{file.filename}",
            star_rating=rating
        ))

    if not reviews_payload:
        raise HTTPException(status_code=400, detail="No valid reviews found in the extracted column.")

    request_payload = BatchIngestRequest(reviews=reviews_payload)
    
    # Delegate to standard batch ingest logic
    return batch_ingest_reviews(product_id, request_payload, db)

@app.post(
    "/ingest/raw",
    response_model=dict,
    tags=["Ingestion"],
    summary="Process unstructured raw text with AI to create multiple products automatically",
)
def global_ingest_raw(
    payload: schemas.RawIngestRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    from pipeline import run_raw_ingestion_background, extract_products_and_reviews_ai, predict_product_category
    
    # 1. Preliminarily extract product names so we can return IDs for redirection
    print(f"DEBUG: Preliminarily extracting product names from raw text...")
    extracted_data = extract_products_and_reviews_ai(payload.text)
    
    product_ids = []
    if extracted_data:
        for item in extracted_data:
            p_name = item.get("product_name", "Unknown Product").strip()
            p_cat = item.get("category")
            if not p_cat or p_cat.lower() in ["uncategorized", "undefined"]:
                p_cat = predict_product_category(p_name)
            
            product = db.query(models.Product).filter(models.Product.name == p_name).first()
            if not product:
                product = models.Product(name=p_name, category=p_cat, status="processing", ingest_type="text", processing_step="Initializing AI Pipeline")
                db.add(product)
                db.commit()
                db.refresh(product)
            product_ids.append(product.id)

    # 2. Trigger full ingestion in background
    background_tasks.add_task(run_raw_ingestion_background, payload.text, payload.source_url, db)
    
    return {
        "status": "processing",
        "product_ids": product_ids,
        "is_batch": len(product_ids) > 1
    }

class UrlIngestRequest(schemas.BaseModel):
    url: str
    name: Optional[str] = None
    category: str = "Uncategorized"
    product_id: Optional[int] = None

@app.post(
    "/ingest/url",
    response_model=dict,
    tags=["Ingestion"],
    summary="Scrape reviews from a URL in the background",
)
def global_ingest_url(
    payload: UrlIngestRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    from pipeline import run_url_ingestion_background, predict_product_category
    
    # Check if product exists or create a placeholder
    product = None
    if payload.product_id:
        product = db.query(models.Product).filter(models.Product.id == payload.product_id).first()
    
    if not product:
        search_name = payload.name if payload.name else "Scraping in progress..."
        product = db.query(models.Product).filter(models.Product.name == search_name).first()
        
    if not product:
        final_name = payload.name if payload.name else "Scraping in progress..."
        final_cat = payload.category
        if final_cat.lower() in ["uncategorized", "undefined"] and payload.name:
            final_cat = predict_product_category(payload.name)
            
        product = models.Product(name=final_name, category=final_cat, status="processing", ingest_type="url", processing_step="Scraping Target URL")
        db.add(product)
        db.commit()
        db.refresh(product)
    else:
        product.status = "processing"
        product.ingest_type = "url"
        product.processing_step = "Scraping Target URL"
        db.commit()
        db.refresh(product)

    from pipeline import run_url_ingestion_background
    background_tasks.add_task(run_url_ingestion_background, product.id, payload.url)

    return {"product_id": product.id, "status": "processing", "message": "Scraping started in the background."}

@app.post(
    "/ingest/csv",
    response_model=dict,
    tags=["Ingestion"],
    summary="Ingest reviews from a CSV (global) and handle multi-product creation",
)
async def global_ingest_csv(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    fallback_category: str = "Uncategorized",
    db: Session = Depends(get_db),
):
    contents = await file.read()
    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing file: {e}")

    if df.empty:
        raise HTTPException(status_code=400, detail="File is empty")

    from pipeline import detect_csv_columns, run_csv_ingestion_background
    mapping = detect_csv_columns(df.columns.tolist(), df.head(5).to_dict(orient="records"))
    
    review_col = mapping.get("review_column")
    if not review_col or review_col not in df.columns:
        raise HTTPException(status_code=422, detail="Could not identify review text column.")

    product_col = mapping.get("product_column")
    
    # 1. Group and create products in 'processing' state
    product_ids = []
    if product_col and product_col in df.columns:
        product_names = df[product_col].dropna().unique().tolist()
    else:
        product_names = [file.filename.split('.')[0]]

    for p_name in product_names:
        p_name = str(p_name).strip()
        product = db.query(models.Product).filter(models.Product.name == p_name).first()
        if not product:
            from pipeline import predict_product_category
            p_cat = fallback_category
            if p_cat.lower() in ["uncategorized", "undefined"]:
                p_cat = predict_product_category(p_name)
                
            product = models.Product(name=p_name, category=p_cat, status="processing", ingest_type="csv", processing_step="Grouping Product Reviews")
            db.add(product)
            db.commit()
            db.refresh(product)
        else:
            product.status = "processing"
            product.ingest_type = "csv"
            product.processing_step = "Grouping Product Reviews"
            db.commit()
            db.refresh(product)
        product_ids.append(product.id)

    # 2. Trigger background task
    # We pass the full CSV as JSON to the background task (safe for memory if not gigabytes)
    csv_json = df.to_json()
    background_tasks.add_task(run_csv_ingestion_background, product_ids, csv_json, mapping)

    return {
        "status": "processing", 
        "product_ids": product_ids, 
        "reviews_added": len(df),
        "message": f"Ingestion of {len(df)} reviews across {len(product_ids)} products started."
    }

# --- Experiments ---
@app.post("/experiments/results", tags=["Experiments"])
def record_experiment_result(payload: schemas.ExperimentResultCreate, db: Session = Depends(get_db)):
    """Record the result of an A/B testing session."""
    db_result = models.ExperimentResult(
        product_id=payload.product_id,
        platform=payload.platform,
        time_seconds=payload.time_seconds,
        participant_name=payload.participant_name
    )
    db.add(db_result)
    db.commit()
    return {"status": "success", "id": db_result.id}

@app.get("/experiments/analytics", response_model=schemas.ExperimentAnalytics, tags=["Experiments"])
def get_experiment_analytics(db: Session = Depends(get_db)):
    """Get aggregated analytics for A/B testing."""
    from sqlalchemy import func
    
    # Platform stats
    stats = db.query(
        models.ExperimentResult.platform,
        func.avg(models.ExperimentResult.time_seconds).label("avg_time"),
        func.count(models.ExperimentResult.id).label("count")
    ).group_by(models.ExperimentResult.platform).all()
    
    platform_stats = [
        {"platform": s.platform, "avg_time": float(s.avg_time), "count": s.count}
        for s in stats
    ]
    
    # Total participants
    total = db.query(func.count(models.ExperimentResult.id)).scalar()
    
    # Recent activity
    recent = db.query(models.ExperimentResult).order_by(models.ExperimentResult.created_at.desc()).limit(10).all()
    
    return {
        "platform_stats": platform_stats,
        "total_participants": total,
        "recent_activity": recent
    }

@app.get("/experiments/results", response_model=List[schemas.ExperimentResult], tags=["Experiments"])
def list_experiment_results(db: Session = Depends(get_db)):
    """List all experiment results for the detailed table."""
    return db.query(models.ExperimentResult).order_by(models.ExperimentResult.created_at.desc()).all()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
