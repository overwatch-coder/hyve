from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
import schemas
import models
from database import get_db
from core.pagination import paginate

router = APIRouter(prefix="/themes", tags=["Themes"])

@router.get("", response_model=schemas.PaginatedResponse[schemas.Theme])
def get_themes(
    product_id: int, 
    page: int = Query(1, ge=1), 
    size: int = Query(10, ge=1, le=100), 
    db: Session = Depends(get_db)
):
    query = db.query(models.Theme).filter(models.Theme.product_id == product_id)
    return paginate(query, page, size)
