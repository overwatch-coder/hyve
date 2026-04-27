from schemas import (
    ExperimentResult,
    ExperimentResultCreate,
    ExperimentStudyCreate,
    ExperimentStudyOut,
    ExperimentStudyUpdate,
    RankedFinding,
)


def test_study_create_accepts_ground_truth_arrays():
    payload = ExperimentStudyCreate(
        product_id=1,
        title="Ground Truth Study",
        ground_truth_strengths=[" Fast battery ", "Great sound", ""],
        ground_truth_weaknesses=["Heavy", "Expensive"],
    )

    assert payload.ground_truth_strengths == ["Fast battery", "Great sound"]
    assert payload.ground_truth_weaknesses == ["Heavy", "Expensive"]


def test_study_update_accepts_partial_ground_truth_changes():
    payload = ExperimentStudyUpdate(
        ground_truth_strengths=["Easy to use"],
    )

    assert payload.ground_truth_strengths == ["Easy to use"]
    assert payload.ground_truth_weaknesses is None


def test_result_create_accepts_helpfulness_and_ranked_findings():
    payload = ExperimentResultCreate(
        product_id=12,
        platform="hyve",
        time_seconds=95,
        confidence_rating=4,
        helpfulness_response="yes",
        evidence={
            "platform": "hyve",
            "strengths": [RankedFinding(text="Fast charging")],
            "weaknesses": [RankedFinding(text="Bulky design")],
        },
    )

    assert payload.helpfulness_response == "yes"
    assert payload.evidence.strengths[0].text == "Fast charging"


def test_result_output_exposes_saved_analysis_fields():
    payload = ExperimentResult(
        id=5,
        product_id=12,
        platform="traditional",
        time_seconds=130,
        confidence_rating=3,
        helpfulness_response="no",
        participant_helpful=False,
        admin_analysis={
            "summary": "Participant aligned on 2 of 3 strengths.",
            "strength_match_pct": 66.7,
            "weakness_match_pct": 33.3,
            "overall_accuracy_pct": 50.0,
        },
        evidence={
            "platform": "traditional",
            "strengths": [{"text": "Affordable"}],
            "weaknesses": [{"text": "Poor battery"}],
        },
        created_at="2026-04-27T10:00:00",
    )

    assert payload.admin_analysis["summary"].startswith("Participant aligned")
    assert payload.admin_analysis["strength_match_pct"] == 66.7
    assert payload.admin_analysis["overall_accuracy_pct"] == 50.0


def test_study_output_exposes_saved_ground_truth_fields():
    payload = ExperimentStudyOut(
        id=2,
        product_id=10,
        title="Approved Study",
        status="draft",
        ground_truth_strengths=["Clear sound"],
        ground_truth_weaknesses=["High price"],
        created_at="2026-04-27T10:00:00",
    )

    assert payload.ground_truth_strengths == ["Clear sound"]
    assert payload.ground_truth_weaknesses == ["High price"]
