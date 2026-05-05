import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload
import schemas
import models
from database import get_db

router = APIRouter(prefix="/products", tags=["Analytics"])

@router.get(
    "/{product_id}/analytics",
    response_model=schemas.ProductAnalyticsResponse,
    summary="Get weighted analytics for a product",
)
def get_product_analytics(product_id: int, db: Session = Depends(get_db)):
    """Compute per-product weighted analytics: risk factor, selling point, theme breakdown."""
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    review_count = db.query(models.Review).filter(models.Review.product_id == product_id).count()
    themes = (
        db.query(models.Theme)
        .options(selectinload(models.Theme.claims))
        .filter(models.Theme.product_id == product_id)
        .all()
    )

    # Single aggregation query instead of 1 query per theme
    claim_stats = (
        db.query(
            models.Claim.theme_id,
            models.Claim.sentiment_polarity,
            func.sum(func.coalesce(models.Claim.mention_count, 1)).label("cnt"),
            func.sum(
                func.coalesce(models.Claim.severity, 0.0)
                * func.coalesce(models.Claim.mention_count, 1)
            ).label("sev_weighted_sum"),
        )
        .join(models.Theme, models.Claim.theme_id == models.Theme.id)
        .filter(models.Theme.product_id == product_id)
        .group_by(models.Claim.theme_id, models.Claim.sentiment_polarity)
        .all()
    )

    stats_by_theme: dict[int, dict] = {}
    for row in claim_stats:
        if row.theme_id not in stats_by_theme:
            stats_by_theme[row.theme_id] = {"positive": 0, "negative": 0, "neutral": 0, "sev_sum": 0.0, "total": 0}
        polarity = row.sentiment_polarity or "neutral"
        stats_by_theme[row.theme_id][polarity] = stats_by_theme[row.theme_id].get(polarity, 0) + row.cnt
        stats_by_theme[row.theme_id]["sev_sum"] += row.sev_weighted_sum or 0.0
        stats_by_theme[row.theme_id]["total"] += row.cnt

    theme_analytics = []
    for theme in themes:
        s = stats_by_theme.get(theme.id, {})
        total = s.get("total", 0)
        avg_sev = round(s.get("sev_sum", 0.0) / max(total, 1), 2)
        grouped_claims = sorted(
            theme.claims or [],
            key=lambda claim: (
                -(claim.mention_count or 1),
                -(claim.severity or 0.0),
                claim.id,
            ),
        )[:8]
        theme_analytics.append(schemas.ThemeAnalyticsOut(
            id=theme.id,
            name=theme.name,
            claim_count=total,
            grouped_claim_count=len(grouped_claims),
            positive_ratio=theme.positive_ratio,
            avg_severity=avg_sev,
            sentiment_counts=schemas.SentimentCountsOut(
                positive=s.get("positive", 0),
                negative=s.get("negative", 0),
                neutral=s.get("neutral", 0),
            ),
            grouped_claims=[
                schemas.GroupedClaimOut(
                    representative_text=claim.claim_text,
                    sentiment=claim.sentiment_polarity or "neutral",
                    severity=round(float(claim.severity or 0.0), 2),
                    mention_count=int(claim.mention_count or 1),
                )
                for claim in grouped_claims
            ],
        ))

    total_claims = sum(t.claim_count for t in theme_analytics)

    # Identify risk and strength
    risk = None
    strength = None
    if theme_analytics:
        # Most negative = lowest positive_ratio weighted by severity
        most_negative = min(theme_analytics, key=lambda t: t.positive_ratio)
        if most_negative.positive_ratio < 0.5:
            risk = schemas.RiskStrengthItemOut(
                theme=most_negative.name,
                ratio=round(1 - most_negative.positive_ratio, 2),
                severity_avg=most_negative.avg_severity,
            )
        # Most positive = highest positive_ratio
        most_positive = max(theme_analytics, key=lambda t: t.positive_ratio)
        if most_positive.positive_ratio > 0.5:
            strength = schemas.RiskStrengthItemOut(
                theme=most_positive.name,
                ratio=most_positive.positive_ratio,
                severity_avg=most_positive.avg_severity,
            )

    adv_consumer = []
    if product.advices:
        try: adv_consumer = json.loads(product.advices)
        except: adv_consumer = [product.advices]
        
    adv_seller = []
    if product.advices_seller:
        try: adv_seller = json.loads(product.advices_seller)
        except: adv_seller = [product.advices_seller]

    return schemas.ProductAnalyticsResponse(
        product_id=product.id,
        product_name=product.name,
        category=product.category,
        review_count=review_count,
        claim_count=total_claims,
        overall_sentiment=product.overall_sentiment_score,
        image_url=product.image_url,
        summary=product.summary,
        advices=adv_consumer,
        summary_seller=product.summary_seller,
        advices_seller=adv_seller,
        critical_risk_factor=risk,
        strongest_selling_point=strength,
        theme_breakdown=theme_analytics,
    )
