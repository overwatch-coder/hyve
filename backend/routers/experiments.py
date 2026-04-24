from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Any
import uuid as uuid_lib
import csv
import io as io_lib
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
        # Traditional and HYVE now share the same 4 tasks so results are
        # directly comparable across platforms.
        fields_to_check = ["weakness_paraphrase", "claim_paraphrase",
                           "positive_paraphrase", "negative_paraphrase"]
        refs_to_check = ["weakness_ref", "claim_ref",
                         "positive_ref", "negative_ref"]
    elif platform == "hyve":
        fields_to_check = ["weakness_paraphrase", "claim_paraphrase",
                           "positive_paraphrase", "negative_paraphrase"]
        refs_to_check = ["weakness_ref", "claim_ref",
                         "positive_ref", "negative_ref"]

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
        review_status=review_status,
        confidence_rating=payload.confidence_rating,
    )

    # Link to study participant via session_token
    if payload.session_token:
        participant = (
            db.query(models.ExperimentParticipant)
            .filter(models.ExperimentParticipant.session_token == payload.session_token)
            .first()
        )
        if participant:
            participant.completed = True
            db_result.study_id = participant.study_id
            db_result.participant_id = participant.id
            db.flush()

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


# ─── Study Management (Admin) ────────────────────────────────────────────────

@router.post("/studies", response_model=schemas.ExperimentStudyOut)
def create_study(
    payload: schemas.ExperimentStudyCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    product = db.query(models.Product).filter(models.Product.id == payload.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.status != "ready":
        raise HTTPException(status_code=400, detail="Product must be in 'ready' status before creating a study")
    study = models.ExperimentStudy(**payload.model_dump())
    db.add(study)
    db.commit()
    db.refresh(study)
    return study


@router.get("/studies", response_model=List[schemas.ExperimentStudyOut])
def list_studies(
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    return db.query(models.ExperimentStudy).order_by(models.ExperimentStudy.created_at.desc()).all()


@router.get("/studies/{study_id}", response_model=schemas.ExperimentStudyOut)
def get_study(
    study_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    study = db.query(models.ExperimentStudy).filter(models.ExperimentStudy.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    return study


@router.patch("/studies/{study_id}", response_model=schemas.ExperimentStudyOut)
def update_study(
    study_id: int,
    payload: schemas.ExperimentStudyUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    study = db.query(models.ExperimentStudy).filter(models.ExperimentStudy.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(study, field, value)
    db.commit()
    db.refresh(study)
    return study


@router.post("/studies/{study_id}/invites", response_model=List[schemas.ExperimentInviteOut])
def generate_invites(
    study_id: int,
    payload: schemas.GenerateInvitesRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    study = db.query(models.ExperimentStudy).filter(models.ExperimentStudy.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    if payload.count < 2 or payload.count > 200:
        raise HTTPException(status_code=400, detail="count must be between 2 and 200")

    # Balanced 50/50 platform assignment
    platforms = ["hyve", "traditional"] * (payload.count // 2)
    if payload.count % 2 == 1:
        platforms.append("hyve")

    invites = []
    for platform in platforms:
        code = str(uuid_lib.uuid4()).replace("-", "")[:12].upper()
        invite = models.ExperimentInvite(
            study_id=study_id,
            code=code,
            assigned_platform=platform,
        )
        db.add(invite)
        invites.append(invite)
    db.commit()
    for inv in invites:
        db.refresh(inv)
    return invites


@router.get("/studies/{study_id}/invites", response_model=List[schemas.ExperimentInviteOut])
def list_invites(
    study_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    return (
        db.query(models.ExperimentInvite)
        .filter(models.ExperimentInvite.study_id == study_id)
        .order_by(models.ExperimentInvite.created_at.asc())
        .all()
    )


# ─── Study Analytics + Export (Admin) ─────────────────────────────────────────

@router.get("/studies/{study_id}/analytics", response_model=schemas.StudyAnalyticsOut)
def get_study_analytics(
    study_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    study = db.query(models.ExperimentStudy).filter(models.ExperimentStudy.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    invites = db.query(models.ExperimentInvite).filter(models.ExperimentInvite.study_id == study_id).all()
    total_invites = len(invites)
    used_invites = sum(1 for i in invites if i.used)

    results = (
        db.query(models.ExperimentResult)
        .filter(models.ExperimentResult.study_id == study_id)
        .all()
    )
    completions = len(results)
    pending_review = sum(1 for r in results if r.review_status == "pending")
    approved = sum(1 for r in results if r.review_status == "approved")
    rejected = sum(1 for r in results if r.review_status == "rejected")

    hyve_results = [r for r in results if r.platform == "hyve"]
    trad_results = [r for r in results if r.platform == "traditional"]

    def avg(vals):
        return sum(vals) / len(vals) if vals else None

    return schemas.StudyAnalyticsOut(
        study_id=study.id,
        product_id=study.product_id,
        title=study.title,
        status=study.status,
        total_invites=total_invites,
        used_invites=used_invites,
        completions=completions,
        pending_review=pending_review,
        approved=approved,
        rejected=rejected,
        hyve_count=len(hyve_results),
        traditional_count=len(trad_results),
        hyve_avg_time=avg([r.time_seconds for r in hyve_results if r.time_seconds]),
        traditional_avg_time=avg([r.time_seconds for r in trad_results if r.time_seconds]),
        hyve_avg_confidence=avg([r.confidence_rating for r in hyve_results if r.confidence_rating]),
        traditional_avg_confidence=avg([r.confidence_rating for r in trad_results if r.confidence_rating]),
    )


@router.get("/studies/{study_id}/export")
def export_study_results(
    study_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    study = db.query(models.ExperimentStudy).filter(models.ExperimentStudy.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    results = (
        db.query(models.ExperimentResult)
        .filter(models.ExperimentResult.study_id == study_id)
        .order_by(models.ExperimentResult.created_at.asc())
        .all()
    )

    output = io_lib.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "result_id", "study_id", "platform", "time_seconds", "confidence_rating",
        "review_status", "weakness_paraphrase", "claim_paraphrase",
        "positive_paraphrase", "negative_paraphrase",
        "weakness_score", "claim_score", "positive_score", "negative_score",
        "created_at",
    ])
    for r in results:
        ev = r.evidence or {}
        sc = r.similarity_scores or {}
        writer.writerow([
            r.id, r.study_id, r.platform, r.time_seconds, r.confidence_rating,
            r.review_status,
            ev.get("weakness_paraphrase", ""),
            ev.get("claim_paraphrase", ""),
            ev.get("positive_paraphrase", ""),
            ev.get("negative_paraphrase", ""),
            sc.get("weakness_paraphrase", ""),
            sc.get("claim_paraphrase", ""),
            sc.get("positive_paraphrase", ""),
            sc.get("negative_paraphrase", ""),
            r.created_at.isoformat() if r.created_at else "",
        ])

    output.seek(0)
    filename = f"study_{study_id}_results.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Participant Flow (Public, no auth) ───────────────────────────────────────

@router.get("/study/{invite_code}", response_model=schemas.InviteResolveOut)
def resolve_invite(invite_code: str, db: Session = Depends(get_db)):
    invite = (
        db.query(models.ExperimentInvite)
        .filter(models.ExperimentInvite.code == invite_code.upper())
        .first()
    )
    if not invite:
        raise HTTPException(status_code=404, detail="Invite code not found")
    study = invite.study
    return schemas.InviteResolveOut(
        study_id=study.id,
        product_id=study.product_id,
        title=study.title,
        description=study.description,
        consent_text=study.consent_text,
        valid=not invite.used and study.status == "active",
        already_used=invite.used,
    )


@router.post("/study/{invite_code}/start", response_model=schemas.SessionStartOut)
def start_study_session(invite_code: str, db: Session = Depends(get_db)):
    invite = (
        db.query(models.ExperimentInvite)
        .filter(models.ExperimentInvite.code == invite_code.upper())
        .first()
    )
    if not invite:
        raise HTTPException(status_code=404, detail="Invite code not found")
    if invite.used:
        raise HTTPException(status_code=409, detail="This invite code has already been used")
    study = invite.study
    if study.status != "active":
        raise HTTPException(status_code=403, detail="This study is not currently active")

    session_token = str(uuid_lib.uuid4())
    participant = models.ExperimentParticipant(
        study_id=study.id,
        invite_id=invite.id,
        session_token=session_token,
        assigned_platform=invite.assigned_platform,
        consent_given_at=datetime.utcnow(),
        started_at=datetime.utcnow(),
    )
    invite.used = True
    invite.used_at = datetime.utcnow()
    db.add(participant)
    db.commit()

    instructions = (
        study.instructions_hyve
        if invite.assigned_platform == "hyve"
        else study.instructions_traditional
    ) or ""

    return schemas.SessionStartOut(
        session_token=session_token,
        assigned_platform=invite.assigned_platform,
        product_id=study.product_id,
        instructions=instructions,
    )
