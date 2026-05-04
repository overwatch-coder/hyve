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


def _seed_used_invite_with_participant() -> tuple[int, int, int, int]:
    _reset_db()
    db = SessionLocal()

    product = models.Product(name="Delete Invite Product", category="Home")
    db.add(product)
    db.commit()
    db.refresh(product)

    study = models.ExperimentStudy(
        product_id=product.id,
        title="Delete Invite Study",
        status="active",
    )
    db.add(study)
    db.commit()
    db.refresh(study)

    invite = models.ExperimentInvite(
        study_id=study.id,
        code="USEDINVITE01",
        assigned_platform="traditional",
        used=True,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)

    participant = models.ExperimentParticipant(
        study_id=study.id,
        invite_id=invite.id,
        session_token="used-invite-session",
        assigned_platform="traditional",
        completed=True,
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)

    result = models.ExperimentResult(
        product_id=product.id,
        study_id=study.id,
        participant_id=participant.id,
        platform="traditional",
        time_seconds=120,
        participant_name="Used Invite Participant",
        review_status="pending",
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    study_id = study.id
    invite_id = invite.id
    participant_id = participant.id
    result_id = result.id
    db.close()

    return study_id, invite_id, participant_id, result_id


def test_delete_used_invite_removes_linked_participant_and_result():
    study_id, invite_id, participant_id, result_id = _seed_used_invite_with_participant()

    response = client.delete(
        f"/experiments/studies/{study_id}/invites/{invite_id}",
        headers=_admin_headers(),
    )
    assert response.status_code == 204

    db = SessionLocal()
    invite = db.query(models.ExperimentInvite).filter(models.ExperimentInvite.id == invite_id).first()
    participant = (
        db.query(models.ExperimentParticipant)
        .filter(models.ExperimentParticipant.id == participant_id)
        .first()
    )
    result = db.query(models.ExperimentResult).filter(models.ExperimentResult.id == result_id).first()
    db.close()

    assert invite is None
    assert participant is None
    assert result is None
