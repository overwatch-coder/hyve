import os
from pathlib import Path


TEST_DB_PATH = Path("backend/tests/test_experiments_workflow.sqlite3")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.as_posix()}"
os.environ["ADMIN_PASSWORD"] = "admin"
os.environ["AUTO_MIGRATE_ON_STARTUP"] = "false"

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
    original_llm_builder = experiment_router._build_admin_analysis_with_llm

    try:
        experiment_router._build_admin_analysis_with_llm = lambda result, study, custom_prompt=None: {
            "summary": "AI summary from evaluator.",
            "strength_match_pct": 84.0,
            "weakness_match_pct": 79.0,
            "overall_accuracy_pct": 81.5,
            "custom_prompt": custom_prompt,
            "participant_strengths": ["Fast charging"],
            "participant_weaknesses": ["High price"],
            "ground_truth_strengths": study.ground_truth_strengths,
            "ground_truth_weaknesses": study.ground_truth_weaknesses,
            "generated_at": "2026-04-29T12:00:00",
        }
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
        assert row.admin_analysis["summary"] == "AI summary from evaluator."
        assert row.admin_analysis["strength_match_pct"] == 84.0
        assert row.admin_analysis["weakness_match_pct"] == 79.0
        assert row.admin_analysis["overall_accuracy_pct"] == 81.5
    finally:
        experiment_router._build_admin_analysis_with_llm = original_llm_builder


def test_admin_analysis_accepts_custom_prompt():
    _, result_id = _seed_pending_result_with_ground_truth()
    original_llm_builder = experiment_router._build_admin_analysis_with_llm

    try:
        experiment_router._build_admin_analysis_with_llm = lambda result, study, custom_prompt=None: {
            "summary": f"Prompt-aware summary: {custom_prompt}",
            "strength_match_pct": 76.0,
            "weakness_match_pct": 70.0,
            "overall_accuracy_pct": 73.0,
            "custom_prompt": custom_prompt,
            "participant_strengths": ["Fast charging"],
            "participant_weaknesses": ["High price"],
            "ground_truth_strengths": study.ground_truth_strengths,
            "ground_truth_weaknesses": study.ground_truth_weaknesses,
            "generated_at": "2026-04-29T12:00:00",
        }
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
        assert "confidence matches the submission quality" in row.admin_analysis["summary"]
    finally:
        experiment_router._build_admin_analysis_with_llm = original_llm_builder


def test_admin_analysis_falls_back_when_llm_analysis_fails():
    _, result_id = _seed_pending_result_with_ground_truth()
    original_llm_builder = experiment_router._build_admin_analysis_with_llm
    original_score_similarity = experiment_router.score_similarity

    try:
        def _raise(*args, **kwargs):
            raise RuntimeError("LLM unavailable")

        experiment_router._build_admin_analysis_with_llm = _raise
        experiment_router.score_similarity = lambda a, b: 0.65 if a and b else 0.0

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
        assert row.admin_analysis["strength_match_pct"] == 65.0
        assert row.admin_analysis["weakness_match_pct"] == 65.0
    finally:
        experiment_router._build_admin_analysis_with_llm = original_llm_builder
        experiment_router.score_similarity = original_score_similarity


def test_manual_accuracy_override_preserves_ai_scores():
    _, result_id = _seed_pending_result_with_ground_truth()
    original_llm_builder = experiment_router._build_admin_analysis_with_llm

    try:
        experiment_router._build_admin_analysis_with_llm = lambda result, study, custom_prompt=None: {
            "summary": "AI summary from evaluator.",
            "strength_match_pct": 75.0,
            "weakness_match_pct": 74.0,
            "overall_accuracy_pct": 74.5,
            "custom_prompt": custom_prompt,
            "participant_strengths": ["Fast charging"],
            "participant_weaknesses": ["High price"],
            "ground_truth_strengths": study.ground_truth_strengths,
            "ground_truth_weaknesses": study.ground_truth_weaknesses,
            "generated_at": "2026-04-29T12:00:00",
        }
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
        experiment_router._build_admin_analysis_with_llm = original_llm_builder


def test_reanalyze_clears_manual_accuracy_override_fields():
    _, result_id = _seed_pending_result_with_ground_truth()
    original_llm_builder = experiment_router._build_admin_analysis_with_llm

    try:
        experiment_router._build_admin_analysis_with_llm = lambda result, study, custom_prompt=None: {
            "summary": "Fresh AI analysis.",
            "strength_match_pct": 88.0,
            "weakness_match_pct": 82.0,
            "overall_accuracy_pct": 85.0,
            "custom_prompt": custom_prompt,
            "participant_strengths": ["Fast charging"],
            "participant_weaknesses": ["High price"],
            "ground_truth_strengths": study.ground_truth_strengths,
            "ground_truth_weaknesses": study.ground_truth_weaknesses,
            "generated_at": "2026-05-05T12:00:00",
        }

        analyze_response = client.post(
            f"/experiments/results/{result_id}/analyze",
            headers=_admin_headers(),
        )
        assert analyze_response.status_code == 200

        override_response = client.patch(
            f"/experiments/results/{result_id}/analysis",
            headers=_admin_headers(),
            json={
                "manual_strength_match_pct": 91.0,
                "manual_weakness_match_pct": 87.0,
                "manual_overall_accuracy_pct": 89.0,
            },
        )
        assert override_response.status_code == 200
        assert override_response.json()["admin_analysis"]["manual_strength_match_pct"] == 91.0

        reanalyze_response = client.post(
            f"/experiments/results/{result_id}/analyze",
            headers=_admin_headers(),
        )
        assert reanalyze_response.status_code == 200

        body = reanalyze_response.json()
        assert body["admin_analysis"]["strength_match_pct"] == 88.0
        assert body["admin_analysis"]["weakness_match_pct"] == 82.0
        assert body["admin_analysis"]["overall_accuracy_pct"] == 85.0
        assert body["admin_analysis"]["manual_strength_match_pct"] is None
        assert body["admin_analysis"]["manual_weakness_match_pct"] is None
        assert body["admin_analysis"]["manual_overall_accuracy_pct"] is None
        assert body["admin_analysis"]["manual_override_updated_at"] is None
    finally:
        experiment_router._build_admin_analysis_with_llm = original_llm_builder


def test_bulk_admin_analysis_only_processes_unanalyzed_rows():
    study_id, result_id = _seed_pending_result_with_ground_truth()
    db = SessionLocal()
    product = db.query(models.Product).first()
    existing_result = models.ExperimentResult(
        product_id=product.id,
        study_id=study_id,
        platform="traditional",
        time_seconds=140,
        participant_name="Already analyzed",
        review_status="pending",
        confidence_rating=4,
        participant_helpful=True,
        evidence={
            "platform": "traditional",
            "strengths": [{"text": "Great sound"}],
            "weaknesses": [{"text": "High price"}],
        },
        admin_analysis={
            "summary": "Existing analysis",
            "strength_match_pct": 80.0,
            "weakness_match_pct": 70.0,
            "overall_accuracy_pct": 75.0,
        },
    )
    db.add(existing_result)
    db.commit()
    existing_result_id = existing_result.id
    db.close()

    original_llm_builder = experiment_router._build_admin_analysis_with_llm

    try:
        experiment_router._build_admin_analysis_with_llm = lambda result, study, custom_prompt=None: {
            "summary": f"Analyzed {result.id}",
            "strength_match_pct": 81.0,
            "weakness_match_pct": 79.0,
            "overall_accuracy_pct": 80.0,
            "custom_prompt": custom_prompt,
            "participant_strengths": ["Fast charging"],
            "participant_weaknesses": ["High price"],
            "ground_truth_strengths": study.ground_truth_strengths,
            "ground_truth_weaknesses": study.ground_truth_weaknesses,
            "generated_at": "2026-05-05T12:00:00",
        }

        response = client.post(
            f"/experiments/studies/{study_id}/analyze-pending",
            headers=_admin_headers(),
        )
        assert response.status_code == 200
        assert response.json() == {
            "study_id": study_id,
            "processed": 1,
            "skipped_already_analyzed": 1,
            "failed": 0,
        }

        db = SessionLocal()
        newly_analyzed = (
            db.query(models.ExperimentResult)
            .filter(models.ExperimentResult.id == result_id)
            .first()
        )
        skipped_row = (
            db.query(models.ExperimentResult)
            .filter(models.ExperimentResult.id == existing_result_id)
            .first()
        )
        db.close()

        assert newly_analyzed is not None
        assert newly_analyzed.admin_analysis["summary"] == f"Analyzed {result_id}"
        assert skipped_row is not None
        assert skipped_row.admin_analysis["summary"] == "Existing analysis"
    finally:
        experiment_router._build_admin_analysis_with_llm = original_llm_builder
