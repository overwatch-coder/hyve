import os
from pathlib import Path

from fastapi.testclient import TestClient


TEST_DB_PATH = Path("backend/tests/test_product_analytics.sqlite3")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.as_posix()}"

from database import SessionLocal, engine
from index import app
import models


client = TestClient(app)
models.Base.metadata.create_all(bind=engine)


def _reset_db() -> None:
    models.Base.metadata.drop_all(bind=engine)
    models.Base.metadata.create_all(bind=engine)


def test_product_analytics_returns_grouped_claims_and_weighted_mentions():
    _reset_db()
    db = SessionLocal()

    product = models.Product(
        name="Analytics Product",
        category="Audio",
        overall_sentiment_score=0.64,
    )
    db.add(product)
    db.commit()
    db.refresh(product)

    positive_review = models.Review(
        product_id=product.id,
        original_text="Rich sound and clear bass.",
        source="seed",
        star_rating=5,
    )
    negative_review = models.Review(
        product_id=product.id,
        original_text="The battery drains too quickly.",
        source="seed",
        star_rating=2,
    )
    db.add_all([positive_review, negative_review])
    db.commit()
    db.refresh(positive_review)
    db.refresh(negative_review)

    theme = models.Theme(
        product_id=product.id,
        name="Sound Quality",
        positive_ratio=0.6,
        claim_count=2,
    )
    db.add(theme)
    db.commit()
    db.refresh(theme)

    db.add_all(
        [
            models.Claim(
                review_id=positive_review.id,
                theme_id=theme.id,
                claim_text="Sound feels rich and immersive",
                sentiment_polarity="positive",
                severity=0.4,
                mention_count=3,
            ),
            models.Claim(
                review_id=negative_review.id,
                theme_id=theme.id,
                claim_text="Battery life is too short",
                sentiment_polarity="negative",
                severity=0.8,
                mention_count=2,
            ),
        ]
    )
    db.commit()
    product_id = product.id
    db.close()

    response = client.get(f"/products/{product_id}/analytics")

    assert response.status_code == 200
    payload = response.json()
    assert payload["claim_count"] == 5
    assert payload["theme_breakdown"][0]["claim_count"] == 5
    assert payload["theme_breakdown"][0]["grouped_claim_count"] == 2
    assert payload["theme_breakdown"][0]["sentiment_counts"] == {
        "positive": 3,
        "negative": 2,
        "neutral": 0,
    }
    assert payload["theme_breakdown"][0]["grouped_claims"] == [
        {
            "representative_text": "Sound feels rich and immersive",
            "sentiment": "positive",
            "severity": 0.4,
            "mention_count": 3,
        },
        {
            "representative_text": "Battery life is too short",
            "sentiment": "negative",
            "severity": 0.8,
            "mention_count": 2,
        },
    ]
