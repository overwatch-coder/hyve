import os
from pathlib import Path


TEST_DB_PATH = Path("backend/tests/test_experiments_workflow.sqlite3")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.as_posix()}"
os.environ["ADMIN_PASSWORD"] = "admin"

from fastapi.testclient import TestClient

from database import SessionLocal, engine
import models
from index import app
from core.security import ADMIN_PASSWORD
from routers import experiments as experiment_router


client = TestClient(app)
models.Base.metadata.create_all(bind=engine)


def _reset_db() -> None:
    models.Base.metadata.drop_all(bind=engine)
    models.Base.metadata.create_all(bind=engine)


def _admin_headers() -> dict[str, str]:
    login = client.post("/admin/login", json={"password": ADMIN_PASSWORD})
    token = login.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def _seed_pending_result_with_ground_truth() -> tuple[int, int]:
    _reset_db()
    db = SessionLocal()
    product = models.Product(name="Analyzer Product", category="Electronics")
    db.add(product)
    db.commit()
    db.refresh(product)

    study = models.ExperimentStudy(
        product_id=product.id,
        title="Analyzer Study",
        status="active",
        ground_truth_strengths=["Fast charging", "Great sound", "Compact build"],
        ground_truth_weaknesses=["High price", "No carrying case", "Limited colors"],
    )
    db.add(study)
    db.commit()
    db.refresh(study)
    study_id = study.id

    result = models.ExperimentResult(
        product_id=product.id,
        study_id=study_id,
        platform="hyve",
        time_seconds=120,
        participant_name="Participant",
        review_status="pending",
        confidence_rating=5,
        participant_helpful=True,
        evidence={
            "platform": "hyve",
            "strengths": [
                {"text": "Fast charging"},
                {"text": "Strong audio"},
                {"text": "Small size"},
            ],
            "weaknesses": [
                {"text": "Expensive"},
                {"text": "No case included"},
                {"text": "Few color options"},
            ],
        },
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    result_id = result.id
    db.close()
    return study_id, result_id


def test_admin_analysis_requires_admin_auth():
    _, result_id = _seed_pending_result_with_ground_truth()
    response = client.post(f"/experiments/results/{result_id}/analyze")
    assert response.status_code in (401, 403)


def test_admin_analysis_persists_summary_and_scores():
    _, result_id = _seed_pending_result_with_ground_truth()
    original_score_similarity = experiment_router.score_similarity
    experiment_router.score_similarity = lambda a, b: 0.8 if a and b else 0.0

    try:
        response = client.post(
            f"/experiments/results/{result_id}/analyze",
            headers=_admin_headers(),
        )
        assert response.status_code == 200

        db = SessionLocal()
        row = db.query(models.ExperimentResult).filter(models.ExperimentResult.id == result_id).first()
        db.close()

        assert row is not None
        assert isinstance(row.admin_analysis, dict)
        assert row.admin_analysis["summary"]
        assert row.admin_analysis["strength_match_pct"] >= 0
        assert row.admin_analysis["weakness_match_pct"] >= 0
        assert row.admin_analysis["overall_accuracy_pct"] >= 0
    finally:
        experiment_router.score_similarity = original_score_similarity


def test_admin_analysis_accepts_custom_prompt():
    _, result_id = _seed_pending_result_with_ground_truth()
    original_score_similarity = experiment_router.score_similarity
    experiment_router.score_similarity = lambda a, b: 0.7 if a and b else 0.0

    try:
        response = client.post(
            f"/experiments/results/{result_id}/analyze",
            headers=_admin_headers(),
            json={"custom_prompt": "Focus on whether confidence matches the submission quality."},
        )
        assert response.status_code == 200

        db = SessionLocal()
        row = db.query(models.ExperimentResult).filter(models.ExperimentResult.id == result_id).first()
        db.close()

        assert row is not None
        assert isinstance(row.admin_analysis, dict)
        assert row.admin_analysis["custom_prompt"] == "Focus on whether confidence matches the submission quality."
        assert "Prompt focus:" in row.admin_analysis["summary"]
    finally:
        experiment_router.score_similarity = original_score_similarity


def test_manual_accuracy_override_preserves_ai_scores():
    _, result_id = _seed_pending_result_with_ground_truth()
    original_score_similarity = experiment_router.score_similarity
    experiment_router.score_similarity = lambda a, b: 0.75 if a and b else 0.0

    try:
        analyze_response = client.post(
            f"/experiments/results/{result_id}/analyze",
            headers=_admin_headers(),
        )
        assert analyze_response.status_code == 200

        override_response = client.patch(
            f"/experiments/results/{result_id}/analysis",
            headers=_admin_headers(),
            json={
                "manual_strength_match_pct": 92.0,
                "manual_weakness_match_pct": 86.0,
                "manual_overall_accuracy_pct": 89.0,
            },
        )
        assert override_response.status_code == 200

        body = override_response.json()
        assert body["admin_analysis"]["strength_match_pct"] >= 0
        assert body["admin_analysis"]["weakness_match_pct"] >= 0
        assert body["admin_analysis"]["overall_accuracy_pct"] >= 0
        assert body["admin_analysis"]["manual_strength_match_pct"] == 92.0
        assert body["admin_analysis"]["manual_weakness_match_pct"] == 86.0
        assert body["admin_analysis"]["manual_overall_accuracy_pct"] == 89.0
        assert body["admin_analysis"]["manual_override_updated_at"]
    finally:
        experiment_router.score_similarity = original_score_similarity
