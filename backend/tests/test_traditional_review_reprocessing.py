import os
from pathlib import Path


TEST_DB_PATH = Path("backend/tests/test_product_reprocessing.sqlite3")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.as_posix()}"
os.environ["ADMIN_PASSWORD"] = "admin"

from fastapi.testclient import TestClient

from core.security import ADMIN_PASSWORD
from database import SessionLocal, engine
from index import app
import models
import pipeline


client = TestClient(app)
models.Base.metadata.create_all(bind=engine)


def _reset_db() -> None:
    models.Base.metadata.drop_all(bind=engine)
    models.Base.metadata.create_all(bind=engine)


def _admin_headers() -> dict[str, str]:
    login = client.post("/admin/login", json={"password": ADMIN_PASSWORD})
    token = login.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def _seed_product_with_existing_analysis() -> tuple[int, list[int]]:
    _reset_db()
    db = SessionLocal()

    product = models.Product(
        name="Reprocess Product",
        category="Electronics",
        status="ready",
        processing_step="Analysis Complete",
        summary="Old summary",
        advices='["Old advice"]',
    )
    db.add(product)
    db.commit()
    db.refresh(product)

    reviews = [
        models.Review(
            product_id=product.id,
            original_text="The audio quality is excellent and immersive.",
            source="seed",
            star_rating=5,
        ),
        models.Review(
            product_id=product.id,
            original_text="Battery life is disappointing after a few hours.",
            source="seed",
            star_rating=2,
        ),
    ]
    db.add_all(reviews)
    db.commit()
    for review in reviews:
        db.refresh(review)

    theme = models.Theme(
        product_id=product.id,
        name="Legacy Theme",
        claim_count=1,
        positive_ratio=1.0,
    )
    db.add(theme)
    db.commit()
    db.refresh(theme)

    stale_claim = models.Claim(
        review_id=reviews[0].id,
        theme_id=theme.id,
        claim_text="Old stale claim",
        sentiment_polarity="positive",
        severity=0.2,
        mention_count=1,
    )
    db.add(stale_claim)
    db.commit()
    seeded_product_id = product.id
    seeded_review_ids = [review.id for review in reviews]
    db.close()

    return seeded_product_id, seeded_review_ids


def test_reprocess_product_preserves_reviews_and_rebuilds_analysis(monkeypatch):
    product_id, review_ids = _seed_product_with_existing_analysis()

    original_batch_process_reviews = pipeline.batch_process_reviews
    original_cluster_product_claims = pipeline.cluster_product_claims

    def _fake_batch_process_reviews(input_review_ids, db):
        for review_id, claim_text, sentiment in [
            (input_review_ids[0], "Sound quality is rich", "positive"),
            (input_review_ids[1], "Battery life is short", "negative"),
        ]:
            db.add(
                models.Claim(
                    review_id=review_id,
                    claim_text=claim_text,
                    evidence_text=claim_text,
                    sentiment_polarity=sentiment,
                    severity=0.7,
                    mention_count=1,
                )
            )
        db.commit()

    def _fake_cluster_product_claims(input_product_id, db):
        product_theme = models.Theme(
            product_id=input_product_id,
            name="Audio Performance",
            claim_count=2,
            positive_ratio=0.5,
        )
        db.add(product_theme)
        db.commit()
        db.refresh(product_theme)

        claims = (
            db.query(models.Claim)
            .join(models.Review, models.Claim.review_id == models.Review.id)
            .filter(models.Review.product_id == input_product_id)
            .order_by(models.Claim.id.asc())
            .all()
        )
        for claim in claims:
            claim.theme_id = product_theme.id
        db.commit()
        return {"status": "success", "themes_created": 1}

    monkeypatch.setattr(pipeline, "batch_process_reviews", _fake_batch_process_reviews)
    monkeypatch.setattr(pipeline, "cluster_product_claims", _fake_cluster_product_claims)

    try:
        response = client.post(
            f"/products/{product_id}/reprocess",
            headers=_admin_headers(),
        )
        assert response.status_code == 200
        assert response.json() == {
            "product_id": product_id,
            "reviews_preserved": 2,
            "claims_rebuilt": 2,
            "themes_created": 1,
            "status": "success",
        }

        db = SessionLocal()
        product = db.query(models.Product).filter(models.Product.id == product_id).first()
        reviews = db.query(models.Review).filter(models.Review.product_id == product_id).all()
        themes = db.query(models.Theme).filter(models.Theme.product_id == product_id).all()
        claims = (
            db.query(models.Claim)
            .join(models.Review, models.Claim.review_id == models.Review.id)
            .filter(models.Review.product_id == product_id)
            .all()
        )
        db.close()

        assert product is not None
        assert product.status == "ready"
        assert product.processing_step == "Analysis Complete"
        assert len(reviews) == 2
        assert sorted(review.id for review in reviews) == sorted(review_ids)
        assert len(themes) == 1
        assert themes[0].name == "Audio Performance"
        assert {claim.claim_text for claim in claims} == {
            "Sound quality is rich",
            "Battery life is short",
        }
    finally:
        monkeypatch.setattr(
            pipeline,
            "batch_process_reviews",
            original_batch_process_reviews,
        )
        monkeypatch.setattr(
            pipeline,
            "cluster_product_claims",
            original_cluster_product_claims,
        )
