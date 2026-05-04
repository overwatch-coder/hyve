from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
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

TraditionalReviewSort = Literal[
    "most-helpful",
    "most-favorable",
    "most-critical",
    "most-recent",
]


def _apply_hyve_review_sort(query, sort: TraditionalReviewSort):
    helpful_votes_sort = func.coalesce(models.Review.helpful_votes, 0)
    created_at_sort = func.coalesce(
        models.Review.created_at,
        datetime(1970, 1, 1),
    )

    if sort == "most-helpful":
        return query.order_by(
            helpful_votes_sort.desc(),
            created_at_sort.desc(),
        )

    if sort == "most-favorable":
        return query.order_by(
            func.coalesce(models.Review.star_rating, -1).desc(),
            helpful_votes_sort.desc(),
            created_at_sort.desc(),
        )

    if sort == "most-critical":
        return query.order_by(
            func.coalesce(models.Review.star_rating, 999999).asc(),
            helpful_votes_sort.desc(),
            created_at_sort.desc(),
        )

    return query.order_by(
        created_at_sort.desc(),
    )

@router.get("", response_model=schemas.PaginatedResponse[schemas.ReviewListItem])
def get_reviews(
    product_id: int, 
    page: int = Query(1, ge=1), 
    size: int = Query(10, ge=1, le=500),
    sort: TraditionalReviewSort = Query("most-helpful"),
    db: Session = Depends(get_db)
):
    query = db.query(models.Review).filter(models.Review.product_id == product_id)
    query = _apply_hyve_review_sort(query, sort)
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
