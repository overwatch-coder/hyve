from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload, subqueryload
import schemas
import models
from database import get_db
from core.security import admin_required
from core.pagination import paginate

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
