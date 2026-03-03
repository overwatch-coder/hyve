from fastapi import FastAPI, Depends, HTTPException, Query
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
    from pipeline import ask_product_assistant
    answer = ask_product_assistant(product_id, req.query, db)
    if not answer:
        raise HTTPException(status_code=500, detail="Failed to generate AI response.")
    return {"answer": answer}

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

@app.get("/stats", response_model=StatsResponse, tags=["Stats"])
def get_stats(db: Session = Depends(get_db)):
    """Return aggregate platform statistics for the dashboard."""
    total_products = db.query(models.Product).count()
    total_claims = db.query(models.Claim).count()
    total_themes = db.query(models.Theme).count()
    avg_result = db.query(models.Product.overall_sentiment_score).all()
    avg_sentiment = round(
        sum(r[0] for r in avg_result) / max(len(avg_result), 1), 2
    )
    return StatsResponse(
        total_products=total_products,
        total_claims=total_claims,
        total_themes=total_themes,
        avg_sentiment=avg_sentiment,
    )


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

    return ProductAnalyticsResponse(
        product_id=product.id,
        product_name=product.name,
        category=product.category,
        review_count=review_count,
        claim_count=total_claims,
        overall_sentiment=product.overall_sentiment_score,
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
    from pipeline import run_raw_ingestion_background
    background_tasks.add_task(run_raw_ingestion_background, payload.text, payload.source_url, db)
    return {"status": "processing"}

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
    # Check if product exists or create a placeholder
    product = None
    if payload.product_id:
        product = db.query(models.Product).filter(models.Product.id == payload.product_id).first()
    
    if not product:
        search_name = payload.name if payload.name else "Scraping in progress..."
        product = db.query(models.Product).filter(models.Product.name == search_name).first()
        
    if not product:
        final_name = payload.name if payload.name else "Scraping in progress..."
        product = models.Product(name=final_name, category=payload.category, status="processing")
        db.add(product)
        db.commit()
        db.refresh(product)
    else:
        product.status = "processing"
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

    from pipeline import detect_csv_columns
    mapping = detect_csv_columns(df.columns.tolist(), df.head(5).to_dict(orient="records"))
    
    review_col = mapping.get("review_column")
    rating_col = mapping.get("rating_column")
    product_col = mapping.get("product_column")

    if not review_col or review_col not in df.columns:
        raise HTTPException(status_code=422, detail="Could not identify review text column.")

    df = df.dropna(subset=[review_col])
    results = {"products_created": [], "reviews_added": 0}

    # Group by product if product column exists, else treat all as one
    if product_col and product_col in df.columns:
        groups = df.groupby(product_col)
    else:
        # Fallback to "New Product" or a name from metadata? 
        # For now, let's use the filename if no product column
        groups = [ (file.filename.split('.')[0], df) ]

    for p_name, p_df in groups:
        p_name = str(p_name).strip()
        product = db.query(models.Product).filter(models.Product.name == p_name).first()
        if not product:
            product = models.Product(name=p_name, category=fallback_category)
            db.add(product)
            db.commit()
            db.refresh(product)
            results["products_created"].append(p_name)

        reviews_payload = []
        for _, row in p_df.iterrows():
            text = str(row[review_col]).strip()
            if len(text) < 5: continue
            
            rating = None
            if rating_col and rating_col in df.columns:
                try: rating = float(row[rating_col])
                except: pass
                
            reviews_payload.append(BatchReviewItem(text=text, source=f"csv_{file.filename}", star_rating=rating))
        
        if reviews_payload:
            batch_ingest_reviews(product.id, BatchIngestRequest(reviews=reviews_payload), db)
            results["reviews_added"] += len(reviews_payload)

    return results

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
