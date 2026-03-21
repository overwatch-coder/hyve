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

    return schemas.BatchIngestResponse(
        product_id=product_id,
        reviews_ingested=len(payload.reviews),
        claims_extracted=total_claims,
        themes_created=cluster_result.get("themes_created", 0),
    )


@router.post(
    "/products/{product_id}/recluster",
    summary="Re-cluster all claims for a product into themes",
)
def recluster_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    result = cluster_product_claims(product_id, db)
    return result


@router.post(
    "/products/{product_id}/ingest/csv",
    response_model=schemas.BatchIngestResponse,
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
                
        reviews_payload.append(schemas.BatchReviewItem(
            text=text,
            source=f"csv_upload_{file.filename}",
            star_rating=rating
        ))

    if not reviews_payload:
        raise HTTPException(status_code=400, detail="No valid reviews found in the extracted column.")

    request_payload = schemas.BatchIngestRequest(reviews=reviews_payload)
    
    # Delegate to standard batch ingest logic
    return batch_ingest_reviews(product_id, request_payload, db)

@router.post(
    "/ingest/raw",
    response_model=dict,
    summary="Process unstructured raw text with AI to create multiple products automatically",
)
def global_ingest_raw(
    payload: schemas.RawIngestRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
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
