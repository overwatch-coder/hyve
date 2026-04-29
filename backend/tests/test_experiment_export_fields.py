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


client = TestClient(app)
models.Base.metadata.create_all(bind=engine)


def _reset_db() -> None:
    models.Base.metadata.drop_all(bind=engine)
    models.Base.metadata.create_all(bind=engine)


def _admin_headers() -> dict[str, str]:
    login = client.post("/admin/login", json={"password": ADMIN_PASSWORD})
    token = login.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_study_export_includes_admin_analysis_and_ground_truth_columns():
    _reset_db()
    db = SessionLocal()

    product = models.Product(name="Export Product", category="Electronics")
    db.add(product)
    db.commit()
    db.refresh(product)

    study = models.ExperimentStudy(
        product_id=product.id,
        title="Export Study",
        status="active",
        ground_truth_strengths=["Battery life", "Comfort"],
        ground_truth_weaknesses=["Price", "Weight"],
    )
    db.add(study)
    db.commit()
    db.refresh(study)
    study_id = study.id

    result = models.ExperimentResult(
        product_id=product.id,
        study_id=study_id,
        platform="hyve",
        participant_name="Amina",
        time_seconds=180,
        confidence_rating=4,
        participant_helpful=True,
        review_status="approved",
        review_notes="Looks good",
        evidence={
            "platform": "hyve",
            "strengths": [{"text": "Battery life"}, {"text": "Comfort"}],
            "weaknesses": [{"text": "Price"}, {"text": "Weight"}],
        },
        admin_analysis={
            "summary": "Strong agreement with ground truth.",
            "strength_match_pct": 90.0,
            "weakness_match_pct": 88.0,
            "overall_accuracy_pct": 89.0,
            "manual_strength_match_pct": 95.0,
            "manual_weakness_match_pct": 91.0,
            "manual_overall_accuracy_pct": 93.0,
            "manual_override_updated_at": "2026-04-27T12:30:00",
            "generated_at": "2026-04-27T12:00:00",
        },
    )
    db.add(result)
    db.commit()
    db.close()

    response = client.get(
        f"/experiments/studies/{study_id}/export",
        headers=_admin_headers(),
    )
    assert response.status_code == 200

    lines = response.text.strip().splitlines()
    header = lines[0]
    row = lines[1]

    assert "participant_helpful" in header
    assert "study_ground_truth_strengths" in header
    assert "study_ground_truth_weaknesses" in header
    assert "admin_analysis_summary" in header
    assert "overall_accuracy_pct" in header
    assert "analysis_generated_at" in header
    assert "manual_strength_match_pct" in header
    assert "manual_weakness_match_pct" in header
    assert "manual_overall_accuracy_pct" in header
    assert "manual_override_updated_at" in header

    assert "Amina" in row
    assert "Battery life | Comfort" in row
    assert "Price | Weight" in row
    assert "Strong agreement with ground truth." in row
    assert "89.0" in row
    assert "95.0" in row
    assert "93.0" in row
    assert "Looks good" in row


def test_study_report_pdf_downloads():
    _reset_db()
    db = SessionLocal()

    product = models.Product(name="Report Product", category="Electronics")
    db.add(product)
    db.commit()
    db.refresh(product)

    study = models.ExperimentStudy(
        product_id=product.id,
        title="Report Study",
        status="active",
        ground_truth_strengths=["Battery life", "Comfort"],
        ground_truth_weaknesses=["Price", "Weight"],
    )
    db.add(study)
    db.commit()
    db.refresh(study)
    study_id = study.id

    result = models.ExperimentResult(
        product_id=product.id,
        study_id=study_id,
        platform="hyve",
        participant_name="Amina",
        time_seconds=180,
        confidence_rating=4,
        participant_helpful=True,
        review_status="approved",
        evidence={
            "platform": "hyve",
            "strengths": [{"text": "Battery life"}, {"text": "Comfort"}],
            "weaknesses": [{"text": "Price"}, {"text": "Weight"}],
        },
        admin_analysis={
            "summary": "Strong agreement with ground truth.",
            "strength_match_pct": 90.0,
            "weakness_match_pct": 88.0,
            "overall_accuracy_pct": 89.0,
            "generated_at": "2026-04-29T12:00:00",
        },
    )
    db.add(result)
    db.commit()
    db.close()

    from routers import experiments as experiment_router

    original_report_builder = experiment_router._generate_study_report_text
    experiment_router._generate_study_report_text = lambda *args, **kwargs: (
        "Study Report\n\nSummary:\nThis is a generated report."
    )

    try:
        response = client.get(
            f"/experiments/studies/{study_id}/report.pdf",
            headers=_admin_headers(),
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert "attachment; filename=" in response.headers["content-disposition"]
        assert response.content.startswith(b"%PDF-")
    finally:
        experiment_router._generate_study_report_text = original_report_builder
