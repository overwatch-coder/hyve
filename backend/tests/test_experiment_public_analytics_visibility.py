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


def _seed_results_with_mixed_statuses() -> int:
    _reset_db()
    db = SessionLocal()
    product = models.Product(name="Visibility Product", category="Home")
    db.add(product)
    db.commit()
    db.refresh(product)

    study = models.ExperimentStudy(
        product_id=product.id,
        title="Visibility Study",
        status="active",
    )
    db.add(study)
    db.commit()
    db.refresh(study)
    study_id = study.id

    rows = [
        models.ExperimentResult(
            product_id=product.id,
            study_id=study_id,
            platform="hyve",
            time_seconds=60,
            participant_name="Approved",
            review_status="approved",
        ),
        models.ExperimentResult(
            product_id=product.id,
            study_id=study_id,
            platform="traditional",
            time_seconds=90,
            participant_name="Pending",
            review_status="pending",
        ),
        models.ExperimentResult(
            product_id=product.id,
            study_id=study_id,
            platform="hyve",
            time_seconds=120,
            participant_name="Rejected",
            review_status="rejected",
        ),
    ]
    db.add_all(rows)
    db.commit()
    db.close()
    return study_id


def test_public_endpoints_only_return_approved_results():
    _seed_results_with_mixed_statuses()

    analytics_response = client.get("/experiments/analytics")
    assert analytics_response.status_code == 200
    assert analytics_response.json()["total_participants"] == 1

    results_response = client.get("/experiments/results")
    assert results_response.status_code == 200
    results = results_response.json()
    assert len(results) == 1
    assert results[0]["review_status"] == "approved"
    assert results[0]["exclude_from_public"] is False


def test_admin_study_results_endpoint_returns_all_statuses():
    study_id = _seed_results_with_mixed_statuses()

    response = client.get(
        f"/experiments/studies/{study_id}/results",
        headers=_admin_headers(),
    )
    assert response.status_code == 200

    statuses = sorted(item["review_status"] for item in response.json())
    assert statuses == ["approved", "pending", "rejected"]


def test_hidden_public_results_are_excluded_from_public_endpoints():
    _seed_results_with_mixed_statuses()

    hide_response = client.patch(
        "/experiments/results/1/public-visibility",
        json={"exclude_from_public": True},
        headers=_admin_headers(),
    )
    assert hide_response.status_code == 200
    assert hide_response.json()["exclude_from_public"] is True

    analytics_response = client.get("/experiments/analytics")
    assert analytics_response.status_code == 200
    assert analytics_response.json()["total_participants"] == 0

    results_response = client.get("/experiments/results")
    assert results_response.status_code == 200
    assert results_response.json() == []


def test_admin_public_results_endpoint_includes_hidden_rows():
    _seed_results_with_mixed_statuses()

    client.patch(
        "/experiments/results/1/public-visibility",
        json={"exclude_from_public": True},
        headers=_admin_headers(),
    )

    response = client.get(
        "/experiments/public-results",
        headers=_admin_headers(),
    )
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["participant_name"] == "Approved"
    assert rows[0]["exclude_from_public"] is True
