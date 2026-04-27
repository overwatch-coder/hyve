import os
from pathlib import Path


TEST_DB_PATH = Path("backend/tests/test_experiments_workflow.sqlite3")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.as_posix()}"

from fastapi.testclient import TestClient

from database import SessionLocal, engine
import models
from index import app


client = TestClient(app)
models.Base.metadata.create_all(bind=engine)


def _reset_db() -> None:
    models.Base.metadata.drop_all(bind=engine)
    models.Base.metadata.create_all(bind=engine)


def _seed_study_session() -> tuple[int, str, int]:
    _reset_db()
    db = SessionLocal()
    product = models.Product(name="Test Product", category="Audio")
    db.add(product)
    db.commit()
    db.refresh(product)
    product_id = product.id

    study = models.ExperimentStudy(
        product_id=product_id,
        title="Review Study",
        status="active",
    )
    db.add(study)
    db.commit()
    db.refresh(study)

    invite = models.ExperimentInvite(
        study_id=study.id,
        code="TESTCODE123",
        assigned_platform="hyve",
        used=True,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)

    participant = models.ExperimentParticipant(
        study_id=study.id,
        invite_id=invite.id,
        session_token="session-token-123",
        assigned_platform="hyve",
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)
    participant_token = participant.session_token
    participant_id = participant.id
    db.close()
    return product_id, participant_token, participant_id


def test_submission_stays_pending_and_skips_auto_analysis():
    product_id, session_token, participant_id = _seed_study_session()

    payload = {
        "product_id": product_id,
        "platform": "hyve",
        "time_seconds": 84,
        "participant_name": "Participant 1",
        "session_token": session_token,
        "confidence_rating": 4,
        "helpfulness_response": "yes",
        "evidence": {
            "platform": "hyve",
            "strengths": [
                {"text": "Fast charging"},
                {"text": "Clear audio"},
                {"text": "Lightweight"},
            ],
            "weaknesses": [
                {"text": "High price"},
                {"text": "Limited colors"},
                {"text": "No case included"},
            ],
        },
    }

    response = client.post("/experiments/results", json=payload)
    assert response.status_code == 200

    result_id = response.json()["id"]
    db = SessionLocal()
    row = db.query(models.ExperimentResult).filter(models.ExperimentResult.id == result_id).first()
    participant = (
        db.query(models.ExperimentParticipant)
        .filter(models.ExperimentParticipant.id == participant_id)
        .first()
    )
    db.close()

    assert row is not None
    assert row.review_status == "pending"
    assert row.participant_helpful is True
    assert row.similarity_scores in (None, {})
    assert "source_texts" not in (row.evidence or {})
    assert row.participant_id == participant_id
    assert participant is not None and participant.completed is True
