from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
import schemas
import models
from database import get_db

router = APIRouter(prefix="/experiments", tags=["Experiments"])

@router.post("/results")
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

@router.get("/analytics", response_model=schemas.ExperimentAnalytics)
def get_experiment_analytics(db: Session = Depends(get_db)):
    """Get aggregated analytics for A/B testing."""
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

@router.get("/results", response_model=List[schemas.ExperimentResult])
def list_experiment_results(db: Session = Depends(get_db)):
    """List all experiment results for the detailed table."""
    return db.query(models.ExperimentResult).order_by(models.ExperimentResult.created_at.desc()).all()
