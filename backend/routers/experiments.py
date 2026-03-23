from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Any
import schemas
import models
from database import get_db
from core.security import admin_required
from experiment_scoring import score_similarity, word_count
from datetime import datetime

router = APIRouter(prefix="/experiments", tags=["Experiments"])


@router.post("/results")
def record_experiment_result(payload: schemas.ExperimentResultCreate, db: Session = Depends(get_db)):
    """Record the result of an A/B testing session."""
    source_texts = {}
    if payload.evidence and payload.evidence.source_refs:
        for key, ref in payload.evidence.source_refs.items():
            if ref.type == "review":
                rev = db.query(models.Review).filter(
                    models.Review.id == int(ref.id)).first()
                if rev:
                    source_texts[key] = rev.original_text
            elif ref.type == "theme":
                thm = db.query(models.Theme).filter(
                    models.Theme.id == int(ref.id)).first()
                if thm:
                    source_texts[key] = thm.name
            elif ref.type == "claim":
                clm = db.query(models.Claim).filter(
                    models.Claim.id == int(ref.id)).first()
                if clm:
                    source_texts[key] = clm.claim_text
            elif ref.type == "strategy":
                thm = db.query(models.Theme).filter(
                    models.Theme.id == int(ref.id)).first()
                if thm:
                    source_texts[key] = thm.recommendation

    similarity_scores = {}
    review_status = "approved"
    LOW = 0.35
    HIGH = 0.55

    evidence_dict = payload.evidence.model_dump() if payload.evidence else {}
    evidence_dict["source_texts"] = source_texts

    platform = payload.evidence.platform if payload.evidence else payload.platform
    fields_to_check = []
    refs_to_check = []

    if platform == "traditional":
        fields_to_check = ["weakness_paraphrase", "claim_paraphrase",
                           "positive_paraphrase", "negative_paraphrase"]
        refs_to_check = ["weakness_review_ref", "claim_review_ref",
                         "positive_review_ref", "negative_review_ref"]
    elif platform == "hyve":
        fields_to_check = ["weakness_paraphrase",
                           "claim_paraphrase", "strategy_paraphrase"]
        refs_to_check = ["weakness_ref", "claim_ref", "strategy_ref"]

    if payload.evidence:
        for field, ref_key in zip(fields_to_check, refs_to_check):
            phr = getattr(payload.evidence, field)
            if not phr:
                phr = ""

            src = source_texts.get(ref_key, "")
            score = score_similarity(phr, src)
            similarity_scores[field] = score

            if word_count(phr) < 5:
                review_status = "pending"

            if score < HIGH:
                review_status = "pending"
    else:
        review_status = "pending"

    db_result = models.ExperimentResult(
        product_id=payload.product_id,
        platform=payload.platform,
        time_seconds=payload.time_seconds,
        participant_name=payload.participant_name,
        evidence=evidence_dict,
        similarity_scores=similarity_scores,
        review_status=review_status
    )
    db.add(db_result)
    db.commit()
    db.refresh(db_result)
    return {"status": "success", "id": db_result.id}


class ReviewUpdatePayload(schemas.BaseModel):
    review_status: str
    review_notes: Optional[str] = None


@router.get("/review-queue")
def get_review_queue(
    platform: Optional[str] = None,
    status: str = "pending",
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required)
):
    query = db.query(models.ExperimentResult)
    if platform:
        query = query.filter(models.ExperimentResult.platform == platform)
    if status:
        query = query.filter(models.ExperimentResult.review_status == status)

    results = query.order_by(models.ExperimentResult.created_at.desc()).all()
    # Apply score filtering in-memory or let FE do it, per spec it says query params but we just need items right now.
    return {"items": results}


@router.patch("/results/{result_id}/review")
def update_review_status(
    result_id: int,
    payload: ReviewUpdatePayload,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required)
):
    result = db.query(models.ExperimentResult).filter(
        models.ExperimentResult.id == result_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")

    result_any: Any = result
    result_any.review_status = payload.review_status
    if payload.review_notes:
        result_any.review_notes = payload.review_notes
    result_any.reviewed_by = "admin"
    result_any.reviewed_at = datetime.utcnow()

    db.commit()
    db.refresh(result)
    return result


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
        {"platform": s.platform, "avg_time": float(
            s.avg_time), "count": s.count}
        for s in stats
    ]

    # Total participants
    total = db.query(func.count(models.ExperimentResult.id)).scalar()

    # Recent activity
    recent = db.query(models.ExperimentResult).order_by(
        models.ExperimentResult.created_at.desc()).limit(10).all()

    return {
        "platform_stats": platform_stats,
        "total_participants": total,
        "recent_activity": recent
    }


@router.get("/results", response_model=List[schemas.ExperimentResult])
def list_experiment_results(db: Session = Depends(get_db)):
    """List all experiment results for the detailed table."""
    return db.query(models.ExperimentResult).order_by(models.ExperimentResult.created_at.desc()).all()
