from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
import schemas
import models
from database import get_db
from core.pagination import paginate

router = APIRouter(prefix="/claims", tags=["Claims"])

@router.get("", response_model=schemas.PaginatedResponse[schemas.Claim])
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
