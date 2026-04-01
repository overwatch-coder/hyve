from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload, subqueryload
import schemas
import models
from database import get_db
from core.security import admin_required
from core.pagination import paginate
from core.images import save_product_image, normalize_image_url
from typing import Optional

router = APIRouter(prefix="/products", tags=["Products"])

@router.get("", response_model=schemas.PaginatedResponse[schemas.Product])
def get_products(
    page: int = Query(1, ge=1), 
    size: int = Query(10, ge=1, le=100), 
    db: Session = Depends(get_db)
):
    query = db.query(models.Product).options(
        subqueryload(models.Product.themes)
    )
    return paginate(query, page, size)

@router.post("", response_model=schemas.Product)
def create_product(product: schemas.ProductCreate, db: Session = Depends(get_db)):
    db_product = models.Product(**product.model_dump())
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product

@router.get("/{product_id}", response_model=schemas.Product)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(models.Product).options(
        joinedload(models.Product.themes).joinedload(models.Theme.claims)
    ).filter(models.Product.id == product_id).first()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@router.get("/{product_id}/status/stream")
async def stream_product_status(product_id: int):
    """Server-Sent Events endpoint to stream real-time product processing status."""
    import asyncio
    import json
    from database import SessionLocal
    import models
    
    async def event_generator():
        last_step = None
        last_status = None
        while True:
            db = SessionLocal()
            try:
                product = db.query(models.Product).filter(models.Product.id == product_id).first()
                if not product:
                    yield f"data: {json.dumps({'status': 'error', 'processing_step': 'Product not found'})}\n\n"
                    break
                
                if product.processing_step != last_step or product.status != last_status:
                    last_step = product.processing_step
                    last_status = product.status
                    yield f"data: {json.dumps({'status': product.status, 'processing_step': product.processing_step})}\n\n"
                
                if product.status in ["ready", "error"]:
                    # Wait slightly so the frontend can catch the final 'ready' state nicely if we exit immediately
                    yield f"data: {json.dumps({'status': product.status, 'processing_step': product.processing_step})}\n\n"
                    break
                    
            except Exception as e:
                yield f"data: {json.dumps({'status': 'error', 'processing_step': str(e)})}\n\n"
                break
            finally:
                db.close()
                
            await asyncio.sleep(1.5)
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.post("/{product_id}/summary/regenerate", response_model=schemas.Product)
def regenerate_product_summary(product_id: int, req: schemas.RegenerateSummaryRequest, db: Session = Depends(get_db)):
    from pipeline import extract_and_update_summary
    product = extract_and_update_summary(product_id, db, req.focus)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@router.post("/{product_id}/chat")
def chat_with_product_ai(product_id: int, req: schemas.ChatRequest, db: Session = Depends(get_db)):
    """API endpoint for the product assistant chatbot. Returns a stream of text fragments."""
    from pipeline import ask_product_assistant
    return StreamingResponse(
        ask_product_assistant(product_id, req.query, db),
        media_type="text/plain"
    )

@router.delete("/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db), admin=Depends(admin_required)):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(product)
    db.commit()
    return {"message": "Product deleted successfully"}

@router.get(
    "/{product_id}/reviews",
    response_model=schemas.PaginatedResponse[schemas.Review],
    summary="List all raw reviews ingested for a HYVE product",
)
def get_product_reviews(
    product_id: int,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    query = db.query(models.Review).filter(
        models.Review.product_id == product_id
    ).order_by(models.Review.created_at.desc())
    return paginate(query, page, size)


# ── Product metadata update (name / category / image_url) ──────────────────
class ProductUpdate(schemas.BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    image_url: Optional[str] = None


@router.patch("/{product_id}", response_model=schemas.Product)
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db)):
    """Update product name, category, or image URL."""
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if payload.name is not None:
        product.name = payload.name
    if payload.category is not None:
        product.category = payload.category
    if payload.image_url is not None:
        product.image_url = normalize_image_url(payload.image_url)
    db.commit()
    db.refresh(product)
    return product


@router.post("/{product_id}/image", response_model=schemas.Product)
async def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a new product image and store it on the server."""
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    product.image_url = await save_product_image(file)
    db.commit()
    db.refresh(product)
    return product
