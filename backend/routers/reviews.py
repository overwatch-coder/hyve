from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
import schemas
import models
from database import get_db
from core.pagination import paginate

try:
    from worker import process_review_ai_task
    CELERY_AVAILABLE = True
except Exception:
    CELERY_AVAILABLE = False
from pipeline import batch_process_reviews

router = APIRouter(prefix="/reviews", tags=["Reviews"])

@router.get("", response_model=schemas.PaginatedResponse[schemas.Review])
def get_reviews(
    product_id: int, 
    page: int = Query(1, ge=1), 
    size: int = Query(10, ge=1, le=100), 
    db: Session = Depends(get_db)
):
    query = db.query(models.Review).filter(models.Review.product_id == product_id)
    return paginate(query, page, size)

@router.post("", response_model=schemas.Review)
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
            batch_process_reviews([db_review.id], db)
    else:
        batch_process_reviews([db_review.id], db)
    
    return db_review
