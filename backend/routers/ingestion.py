import io
import pandas as pd
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from sqlalchemy.orm import Session
import schemas
import models
from database import get_db
from pipeline import (
    process_review_sync, 
    cluster_product_claims, 
    detect_csv_columns,
    run_raw_ingestion_background,
    extract_products_and_reviews_ai,
    predict_product_category,
    run_url_ingestion_background,
    run_csv_ingestion_background
)

router = APIRouter(tags=["Ingestion"])

@router.post(
    "/products/{product_id}/ingest",
    response_model=schemas.BatchIngestResponse,
    summary="Batch ingest reviews and run AI pipeline",
)
def batch_ingest_reviews(
    product_id: int,
    payload: schemas.BatchIngestRequest,
    db: Session = Depends(get_db),
):
    """
    Ingests a batch of reviews for a product
    """
    from pipeline import batch_process_reviews
    
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    review_ids = []
    for item in payload.reviews:
        review = models.Review(
            product_id=product_id,
            original_text=item.text,
            source=item.source,
            star_rating=item.star_rating,
        )
        db.add(review)
        db.commit()
        db.refresh(review)
        review_ids.append(review.id)
        
    product.processing_step = "Distilling Insights"
    db.commit()

    batch_process_reviews(review_ids, db)

    product.processing_step = "Harmonizing Patterns"
    db.commit()

    cluster_result = cluster_product_claims(product_id, db)
    
    product.status = "ready"
    product.processing_step = "Analysis Complete"
    db.commit()

    return {
        "message": f"Successfully ingested {len(payload.reviews)} reviews.",
        "themes_generated": cluster_result.get("themes_count", 0),
    }

class UrlIngestRequest(schemas.BaseModel):
    url: str
    name: Optional[str] = None
    category: str = "Uncategorized"
    product_id: Optional[int] = None

@router.post(
    "/ingest/url",
    response_model=dict,
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

    background_tasks.add_task(run_url_ingestion_background, product.id, payload.url)

    return {"product_id": product.id, "status": "processing", "message": "Scraping started in the background."}

@router.post(
    "/ingest/csv",
    response_model=dict,
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
    csv_json = df.to_json()
    background_tasks.add_task(run_csv_ingestion_background, product_ids, csv_json, mapping)

    return {
        "status": "processing", 
        "product_ids": product_ids, 
        "reviews_added": len(df),
        "message": f"Ingestion of {len(df)} reviews across {len(product_ids)} products started."
    }
