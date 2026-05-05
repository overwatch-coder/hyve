import csv
import shutil
import sys
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from analyze_experiment_csv import analyze_csv


def _write_csv(path: Path) -> None:
    fieldnames = [
        "result_id",
        "study_id",
        "platform",
        "participant_name",
        "time_seconds",
        "confidence_rating",
        "participant_helpful",
        "review_status",
        "strength_match_pct",
        "weakness_match_pct",
        "overall_accuracy_pct",
        "manual_strength_match_pct",
        "manual_weakness_match_pct",
        "manual_overall_accuracy_pct",
        "created_at",
    ]
    rows = [
        {
            "result_id": "1",
            "study_id": "2",
            "platform": "hyve",
            "participant_name": "A",
            "time_seconds": "100",
            "confidence_rating": "5",
            "participant_helpful": "True",
            "review_status": "approved",
            "strength_match_pct": "50",
            "weakness_match_pct": "60",
            "overall_accuracy_pct": "55",
            "manual_strength_match_pct": "70",
            "manual_weakness_match_pct": "80",
            "manual_overall_accuracy_pct": "75",
            "created_at": "2026-05-05T10:00:00",
        },
        {
            "result_id": "2",
            "study_id": "2",
            "platform": "traditional",
            "participant_name": "B",
            "time_seconds": "200",
            "confidence_rating": "3",
            "participant_helpful": "False",
            "review_status": "approved",
            "strength_match_pct": "20",
            "weakness_match_pct": "40",
            "overall_accuracy_pct": "30",
            "manual_strength_match_pct": "",
            "manual_weakness_match_pct": "",
            "manual_overall_accuracy_pct": "",
            "created_at": "2026-05-05T10:02:00",
        },
        {
            "result_id": "3",
            "study_id": "2",
            "platform": "hyve",
            "participant_name": "C",
            "time_seconds": "999",
            "confidence_rating": "1",
            "participant_helpful": "True",
            "review_status": "rejected",
            "strength_match_pct": "100",
            "weakness_match_pct": "100",
            "overall_accuracy_pct": "100",
            "manual_strength_match_pct": "",
            "manual_weakness_match_pct": "",
            "manual_overall_accuracy_pct": "",
            "created_at": "2026-05-05T10:03:00",
        },
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def test_analyze_csv_uses_approved_rows_and_manual_scores():
    scratch = Path("backend/tests/tmp/experiment_csv_analysis")
    if scratch.exists():
        shutil.rmtree(scratch)
    scratch.mkdir(parents=True)
    csv_path = scratch / "study_results.csv"
    out_dir = scratch / "analysis"
    _write_csv(csv_path)

    result = analyze_csv(csv_path, out_dir, generate_plots=True)

    assert result.row_count == 3
    assert result.main_row_count == 2
    assert result.status_counts == {"approved": 2, "rejected": 1}

    hyve = result.platform_summary["hyve"]
    assert hyve["n"] == 1
    assert hyve["avg_overall_accuracy_pct"] == 75.0
    assert hyve["avg_strength_match_pct"] == 70.0
    assert hyve["avg_weakness_match_pct"] == 80.0

    traditional = result.platform_summary["traditional"]
    assert traditional["n"] == 1
    assert traditional["avg_overall_accuracy_pct"] == 30.0

    assert result.comparisons["hyve_minus_traditional_accuracy"] == 45.0
    assert (out_dir / "study_results_analysis.md").exists()
    assert (out_dir / "study_results_platform_summary.csv").exists()
    assert (out_dir / "study_results_processed_rows.csv").exists()
    assert (out_dir / "study_results_stats_tests.csv").exists()
    assert (out_dir / "study_results_model_summary.csv").exists()
    assert (out_dir / "study_results_qualitative_themes.csv").exists()
    assert (out_dir / "study_results_research_questions.csv").exists()
    assert (out_dir / "study_results_colab_analysis.ipynb").exists()
    assert (out_dir / "figures" / "01_platform_counts.png").exists()
    assert (out_dir / "figures" / "03_accuracy_by_platform.png").exists()
    assert (out_dir / "figures" / "07_confidence_vs_accuracy.png").exists()
