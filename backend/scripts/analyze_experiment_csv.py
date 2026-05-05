"""Reusable analysis for exported HYVE experiment CSV files.

Run from the repository root:
    python backend/scripts/analyze_experiment_csv.py "C:\\path\\to\\study_results.csv"
"""

from __future__ import annotations

import argparse
import csv
import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from statistics import mean, median, stdev
from typing import Any, Iterable

import pandas as pd
import statsmodels.api as sm
from scipy import stats


SCORE_COLUMNS = [
    ("strength", "strength_match_pct", "manual_strength_match_pct"),
    ("weakness", "weakness_match_pct", "manual_weakness_match_pct"),
    ("overall", "overall_accuracy_pct", "manual_overall_accuracy_pct"),
]

SIMILARITY_SCORE_COLUMNS = [
    "strength_1_score",
    "strength_2_score",
    "strength_3_score",
    "weakness_1_score",
    "weakness_2_score",
    "weakness_3_score",
]

NUMERIC_ANALYSIS_COLUMNS = [
    ("effective_overall_match_pct", "Overall accuracy"),
    ("effective_strength_match_pct", "Strength accuracy"),
    ("effective_weakness_match_pct", "Weakness accuracy"),
    ("confidence_rating_num", "Confidence"),
    ("time_seconds_num", "Completion time"),
    ("completeness_pct", "Completeness"),
    ("false_insight_proxy_count", "False-insight proxy count"),
]

STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "but",
    "by",
    "for",
    "from",
    "good",
    "great",
    "in",
    "is",
    "it",
    "its",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "very",
    "with",
}

PLOT_GUIDE = {
    "01_platform_counts.png": (
        "Checks whether HYVE and Traditional have similar participant counts. "
        "A large imbalance weakens direct comparison because one condition has much less evidence."
    ),
    "02_status_counts.png": (
        "Shows how many rows were approved, rejected, or pending. Main conclusions should usually use approved rows; rejected rows are useful for quality-control analysis."
    ),
    "03_accuracy_by_platform.png": (
        "Compares overall accuracy by platform. Higher points/boxes mean participants matched the ground truth better."
    ),
    "04_strength_weakness_accuracy.png": (
        "Separates strength accuracy from weakness accuracy. This tells you whether HYVE helps with one type of insight more than the other."
    ),
    "05_confidence_by_platform.png": (
        "Compares self-reported confidence. This is perceived certainty, not proof of correctness."
    ),
    "06_time_by_platform.png": (
        "Compares completion time. Lower values mean faster completion, but speed should be interpreted alongside accuracy."
    ),
    "07_confidence_vs_accuracy.png": (
        "Tests calibration visually. An upward trend means confidence rises with correctness; a flat or downward trend suggests overconfidence or poor calibration."
    ),
    "08_helpfulness_by_platform.png": (
        "Shows whether participants said the experience helped them make an informed decision."
    ),
    "09_approved_vs_rejected_accuracy.png": (
        "Checks whether rejected submissions differ from approved submissions. This helps validate your review-status filter."
    ),
    "10_correlation_heatmap.png": (
        "Summarizes relationships among numeric variables. Values near 1 are strong positive relationships, near -1 strong negative relationships, and near 0 weak relationships."
    ),
}


@dataclass(frozen=True)
class AnalysisResult:
    source_csv: Path
    output_dir: Path
    row_count: int
    main_row_count: int
    status_counts: dict[str, int]
    platform_summary: dict[str, dict[str, Any]]
    comparisons: dict[str, Any]
    confidence_accuracy_spearman: float | None
    report_path: Path
    platform_summary_path: Path
    processed_rows_path: Path
    stats_tests_path: Path
    model_summary_path: Path
    qualitative_themes_path: Path
    notebook_path: Path
    figures_dir: Path | None


def parse_float(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        parsed = float(text)
    except ValueError:
        return None
    if math.isnan(parsed):
        return None
    return parsed


def parse_bool(value: Any) -> bool | None:
    if value is None:
        return None
    normalized = str(value).strip().lower()
    if normalized in {"true", "yes", "1"}:
        return True
    if normalized in {"false", "no", "0"}:
        return False
    return None


def split_items(value: Any) -> list[str]:
    if value is None:
        return []
    return [
        item.strip()
        for item in str(value).split("|")
        if item.strip()
    ]


def count_submitted_items(value: Any) -> int:
    return len(split_items(value))


def count_none_items(value: Any) -> int:
    return sum(1 for item in split_items(value) if item.lower() in {"none", "n/a", "na"})


def count_low_similarity_scores(row: dict[str, Any], threshold: float = 0.35) -> int:
    count = 0
    for column in SIMILARITY_SCORE_COLUMNS:
        score = parse_float(row.get(column))
        if score is not None and score < threshold:
            count += 1
    return count


def average(values: Iterable[float | None]) -> float | None:
    clean = [value for value in values if value is not None]
    return round(mean(clean), 2) if clean else None


def sample_sd(values: Iterable[float | None]) -> float | None:
    clean = [value for value in values if value is not None]
    return round(stdev(clean), 2) if len(clean) >= 2 else None


def median_value(values: Iterable[float | None]) -> float | None:
    clean = [value for value in values if value is not None]
    return round(median(clean), 2) if clean else None


def rank_values(values: list[float]) -> list[float]:
    indexed = sorted(enumerate(values), key=lambda item: item[1])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(indexed):
        j = i
        while j + 1 < len(indexed) and indexed[j + 1][1] == indexed[i][1]:
            j += 1
        avg_rank = (i + 1 + j + 1) / 2
        for k in range(i, j + 1):
            ranks[indexed[k][0]] = avg_rank
        i = j + 1
    return ranks


def pearson(x_values: list[float], y_values: list[float]) -> float | None:
    if len(x_values) != len(y_values) or len(x_values) < 2:
        return None
    x_avg = mean(x_values)
    y_avg = mean(y_values)
    numerator = sum((x - x_avg) * (y - y_avg) for x, y in zip(x_values, y_values))
    x_den = math.sqrt(sum((x - x_avg) ** 2 for x in x_values))
    y_den = math.sqrt(sum((y - y_avg) ** 2 for y in y_values))
    if x_den == 0 or y_den == 0:
        return None
    return round(numerator / (x_den * y_den), 3)


def spearman(x_values: list[float], y_values: list[float]) -> float | None:
    if len(x_values) != len(y_values) or len(x_values) < 2:
        return None
    return pearson(rank_values(x_values), rank_values(y_values))


def effective_score(row: dict[str, Any], ai_column: str, manual_column: str) -> float | None:
    manual = parse_float(row.get(manual_column))
    if manual is not None:
        return manual
    return parse_float(row.get(ai_column))


def process_row(row: dict[str, Any]) -> dict[str, Any]:
    processed = dict(row)
    processed["platform"] = str(row.get("platform", "")).strip().lower()
    processed["review_status"] = str(row.get("review_status", "")).strip().lower()
    processed["time_seconds_num"] = parse_float(row.get("time_seconds"))
    processed["confidence_rating_num"] = parse_float(row.get("confidence_rating"))
    processed["participant_helpful_bool"] = parse_bool(row.get("participant_helpful"))
    processed["submitted_strength_count"] = count_submitted_items(row.get("top_strengths"))
    processed["submitted_weakness_count"] = count_submitted_items(row.get("top_weaknesses"))
    processed["ground_truth_strength_count"] = count_submitted_items(
        row.get("study_ground_truth_strengths")
    )
    processed["ground_truth_weakness_count"] = count_submitted_items(
        row.get("study_ground_truth_weaknesses")
    )
    expected_count = (
        processed["ground_truth_strength_count"] + processed["ground_truth_weakness_count"]
    )
    submitted_count = (
        processed["submitted_strength_count"] + processed["submitted_weakness_count"]
    )
    processed["submitted_insight_count"] = submitted_count
    processed["expected_insight_count"] = expected_count
    processed["completeness_pct"] = (
        round(min(submitted_count / expected_count, 1.0) * 100, 2)
        if expected_count
        else None
    )
    processed["none_answer_count"] = count_none_items(row.get("top_strengths")) + count_none_items(
        row.get("top_weaknesses")
    )
    processed["low_similarity_score_count"] = count_low_similarity_scores(row)
    processed["false_insight_proxy_count"] = (
        processed["none_answer_count"] + processed["low_similarity_score_count"]
    )
    for label, ai_column, manual_column in SCORE_COLUMNS:
        processed[f"effective_{label}_match_pct"] = effective_score(
            row,
            ai_column,
            manual_column,
        )
    return processed


def load_rows(csv_path: Path) -> list[dict[str, Any]]:
    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        return [process_row(row) for row in csv.DictReader(handle)]


def choose_main_rows(rows: list[dict[str, Any]], status: str) -> list[dict[str, Any]]:
    normalized = status.strip().lower()
    if normalized == "all":
        return rows
    if normalized in {"non-rejected", "not-rejected"}:
        return [row for row in rows if row.get("review_status") != "rejected"]
    return [row for row in rows if row.get("review_status") == normalized]


def count_by(rows: list[dict[str, Any]], column: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rows:
        key = str(row.get(column) or "missing")
        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items()))


def summarize_platform(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    platforms = sorted({row.get("platform") or "missing" for row in rows})
    summary: dict[str, dict[str, Any]] = {}
    for platform in platforms:
        platform_rows = [row for row in rows if row.get("platform") == platform]
        helpful_values = [
            row["participant_helpful_bool"]
            for row in platform_rows
            if row.get("participant_helpful_bool") is not None
        ]
        helpful_rate = (
            round(sum(1 for value in helpful_values if value) / len(helpful_values), 3)
            if helpful_values
            else None
        )
        summary[str(platform)] = {
            "n": len(platform_rows),
            "avg_overall_accuracy_pct": average(
                row.get("effective_overall_match_pct") for row in platform_rows
            ),
            "median_overall_accuracy_pct": median_value(
                row.get("effective_overall_match_pct") for row in platform_rows
            ),
            "sd_overall_accuracy_pct": sample_sd(
                row.get("effective_overall_match_pct") for row in platform_rows
            ),
            "avg_strength_match_pct": average(
                row.get("effective_strength_match_pct") for row in platform_rows
            ),
            "avg_weakness_match_pct": average(
                row.get("effective_weakness_match_pct") for row in platform_rows
            ),
            "avg_confidence": average(
                row.get("confidence_rating_num") for row in platform_rows
            ),
            "avg_time_seconds": average(row.get("time_seconds_num") for row in platform_rows),
            "avg_completeness_pct": average(row.get("completeness_pct") for row in platform_rows),
            "avg_false_insight_proxy_count": average(
                row.get("false_insight_proxy_count") for row in platform_rows
            ),
            "helpful_rate": helpful_rate,
        }
    return summary


def build_comparisons(platform_summary: dict[str, dict[str, Any]]) -> dict[str, Any]:
    hyve = platform_summary.get("hyve", {})
    traditional = platform_summary.get("traditional", {})

    def diff(metric: str) -> float | None:
        h = hyve.get(metric)
        t = traditional.get(metric)
        if h is None or t is None:
            return None
        return round(float(h) - float(t), 2)

    time_diff = diff("avg_time_seconds")
    return {
        "hyve_minus_traditional_accuracy": diff("avg_overall_accuracy_pct"),
        "hyve_minus_traditional_strength": diff("avg_strength_match_pct"),
        "hyve_minus_traditional_weakness": diff("avg_weakness_match_pct"),
        "hyve_minus_traditional_confidence": diff("avg_confidence"),
        "hyve_minus_traditional_time_seconds": time_diff,
        "hyve_minus_traditional_completeness": diff("avg_completeness_pct"),
        "hyve_minus_traditional_false_insight_proxy": diff("avg_false_insight_proxy_count"),
        "hyve_time_faster": time_diff is not None and time_diff < 0,
    }


def confidence_accuracy_correlation(rows: list[dict[str, Any]]) -> float | None:
    pairs = [
        (row.get("confidence_rating_num"), row.get("effective_overall_match_pct"))
        for row in rows
        if row.get("confidence_rating_num") is not None
        and row.get("effective_overall_match_pct") is not None
    ]
    if len(pairs) < 2:
        return None
    confidence, accuracy = zip(*pairs)
    return spearman(list(confidence), list(accuracy))


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_platform_summary(path: Path, summary: dict[str, dict[str, Any]]) -> None:
    fieldnames = [
        "platform",
        "n",
        "avg_overall_accuracy_pct",
        "median_overall_accuracy_pct",
        "sd_overall_accuracy_pct",
        "avg_strength_match_pct",
        "avg_weakness_match_pct",
        "avg_confidence",
        "avg_time_seconds",
        "avg_completeness_pct",
        "avg_false_insight_proxy_count",
        "helpful_rate",
    ]
    rows = [{"platform": platform, **values} for platform, values in summary.items()]
    write_csv(path, rows, fieldnames)


def rows_to_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    for column, _label in NUMERIC_ANALYSIS_COLUMNS:
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors="coerce")
    if "participant_helpful_bool" in df.columns:
        df["participant_helpful_num"] = df["participant_helpful_bool"].map(
            {True: 1, False: 0}
        )
    return df


def cohen_d(group_a: pd.Series, group_b: pd.Series) -> float | None:
    a = group_a.dropna().astype(float)
    b = group_b.dropna().astype(float)
    if len(a) < 2 or len(b) < 2:
        return None
    pooled_n = len(a) + len(b) - 2
    if pooled_n <= 0:
        return None
    pooled_sd = math.sqrt(
        ((len(a) - 1) * a.var(ddof=1) + (len(b) - 1) * b.var(ddof=1)) / pooled_n
    )
    if pooled_sd == 0:
        return None
    return round((a.mean() - b.mean()) / pooled_sd, 3)


def p_value_label(p_value: float | None) -> str:
    if p_value is None:
        return "not available"
    if p_value < 0.001:
        return "p < .001"
    return f"p = {p_value:.3f}"


def significance_label(p_value: float | None, alpha: float = 0.05) -> str:
    if p_value is None:
        return "not enough data"
    return "statistically significant" if p_value < alpha else "not statistically significant"


def permutation_p_value(group_a: pd.Series, group_b: pd.Series) -> float | None:
    a = group_a.dropna().astype(float).to_numpy()
    b = group_b.dropna().astype(float).to_numpy()
    if len(a) < 1 or len(b) < 1:
        return None
    observed = abs(float(a.mean() - b.mean()))
    combined = list(a) + list(b)
    n_a = len(a)
    try:
        from itertools import combinations

        diffs = []
        indices = range(len(combined))
        for combo in combinations(indices, n_a):
            combo_set = set(combo)
            perm_a = [combined[i] for i in combo]
            perm_b = [combined[i] for i in indices if i not in combo_set]
            diffs.append(abs(float(mean(perm_a) - mean(perm_b))))
        if not diffs:
            return None
        return round(sum(1 for diff in diffs if diff >= observed) / len(diffs), 6)
    except OverflowError:
        return None


def bootstrap_mean_difference_ci(
    group_a: pd.Series,
    group_b: pd.Series,
    iterations: int = 2000,
) -> tuple[float | None, float | None]:
    a = group_a.dropna().astype(float).to_numpy()
    b = group_b.dropna().astype(float).to_numpy()
    if len(a) < 1 or len(b) < 1:
        return None, None
    import random

    rng = random.Random(42)
    diffs = []
    for _ in range(iterations):
        sample_a = [float(a[rng.randrange(len(a))]) for _i in range(len(a))]
        sample_b = [float(b[rng.randrange(len(b))]) for _i in range(len(b))]
        diffs.append(mean(sample_a) - mean(sample_b))
    diffs.sort()
    low = diffs[int(0.025 * (len(diffs) - 1))]
    high = diffs[int(0.975 * (len(diffs) - 1))]
    return round(float(low), 3), round(float(high), 3)


def compare_two_groups(
    df: pd.DataFrame,
    group_column: str,
    group_a: str,
    group_b: str,
    metric_column: str,
    metric_label: str,
    comparison_label: str,
) -> list[dict[str, Any]]:
    a = df.loc[df[group_column] == group_a, metric_column].dropna().astype(float)
    b = df.loc[df[group_column] == group_b, metric_column].dropna().astype(float)
    rows: list[dict[str, Any]] = []
    base = {
        "comparison": comparison_label,
        "metric": metric_label,
        "group_a": group_a,
        "group_b": group_b,
        "n_a": len(a),
        "n_b": len(b),
        "mean_a": round(float(a.mean()), 3) if len(a) else None,
        "mean_b": round(float(b.mean()), 3) if len(b) else None,
        "mean_difference_a_minus_b": round(float(a.mean() - b.mean()), 3)
        if len(a) and len(b)
        else None,
        "cohens_d": cohen_d(a, b),
    }
    if len(a) >= 2 and len(b) >= 2 and a.nunique() > 1 and b.nunique() > 1:
        t_stat, p_value = stats.ttest_ind(a, b, equal_var=False, nan_policy="omit")
        rows.append(
            {
                **base,
                "test": "Welch t-test",
                "statistic": round(float(t_stat), 4),
                "p_value": round(float(p_value), 6),
                "interpretation": significance_label(float(p_value)),
            }
        )
        try:
            u_stat, mw_p = stats.mannwhitneyu(a, b, alternative="two-sided")
            rows.append(
                {
                    **base,
                    "test": "Mann-Whitney U",
                    "statistic": round(float(u_stat), 4),
                    "p_value": round(float(mw_p), 6),
                    "interpretation": significance_label(float(mw_p)),
                }
            )
        except ValueError:
            pass
    else:
        rows.append(
            {
                **base,
                "test": "Welch t-test",
                "statistic": None,
                "p_value": None,
                "interpretation": "not enough data or variation",
            }
        )
    permutation_p = permutation_p_value(a, b)
    ci_low, ci_high = bootstrap_mean_difference_ci(a, b)
    rows.append(
        {
            **base,
            "test": "Permutation test",
            "statistic": None,
            "p_value": permutation_p,
            "interpretation": (
                f"{significance_label(permutation_p)}; bootstrap 95% CI for mean difference [{ci_low}, {ci_high}]"
                if ci_low is not None and ci_high is not None
                else significance_label(permutation_p)
            ),
        }
    )
    return rows


def categorical_test(
    df: pd.DataFrame,
    row_column: str,
    column_column: str,
    comparison_label: str,
) -> dict[str, Any]:
    table = pd.crosstab(df[row_column], df[column_column])
    if table.shape[0] < 2 or table.shape[1] < 2:
        return {
            "comparison": comparison_label,
            "metric": f"{row_column} vs {column_column}",
            "group_a": row_column,
            "group_b": column_column,
            "n_a": int(table.values.sum()) if table.size else 0,
            "n_b": None,
            "mean_a": None,
            "mean_b": None,
            "mean_difference_a_minus_b": None,
            "cohens_d": None,
            "test": "Chi-square",
            "statistic": None,
            "p_value": None,
            "interpretation": "not enough data",
        }
    if table.shape == (2, 2):
        odds_ratio, p_value = stats.fisher_exact(table)
        return {
            "comparison": comparison_label,
            "metric": f"{row_column} vs {column_column}",
            "group_a": row_column,
            "group_b": column_column,
            "n_a": int(table.values.sum()),
            "n_b": None,
            "mean_a": None,
            "mean_b": None,
            "mean_difference_a_minus_b": None,
            "cohens_d": None,
            "test": "Fisher exact",
            "statistic": round(float(odds_ratio), 4),
            "p_value": round(float(p_value), 6),
            "interpretation": significance_label(float(p_value)),
        }
    chi2, p_value, _dof, _expected = stats.chi2_contingency(table)
    return {
        "comparison": comparison_label,
        "metric": f"{row_column} vs {column_column}",
        "group_a": row_column,
        "group_b": column_column,
        "n_a": int(table.values.sum()),
        "n_b": None,
        "mean_a": None,
        "mean_b": None,
        "mean_difference_a_minus_b": None,
        "cohens_d": None,
        "test": "Chi-square",
        "statistic": round(float(chi2), 4),
        "p_value": round(float(p_value), 6),
        "interpretation": significance_label(float(p_value)),
    }


def build_stats_tests(rows: list[dict[str, Any]], main_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    tests: list[dict[str, Any]] = []
    main_df = rows_to_frame(main_rows)
    all_df = rows_to_frame(rows)

    if not main_df.empty and {"hyve", "traditional"}.issubset(set(main_df["platform"])):
        for metric_column, metric_label in NUMERIC_ANALYSIS_COLUMNS:
            if metric_column in main_df.columns:
                tests.extend(
                    compare_two_groups(
                        main_df,
                        "platform",
                        "hyve",
                        "traditional",
                        metric_column,
                        metric_label,
                        "Approved rows: HYVE vs Traditional",
                    )
                )

    if not all_df.empty and {"approved", "rejected"}.issubset(set(all_df["review_status"])):
        for metric_column, metric_label in NUMERIC_ANALYSIS_COLUMNS:
            if metric_column in all_df.columns:
                tests.extend(
                    compare_two_groups(
                        all_df,
                        "review_status",
                        "approved",
                        "rejected",
                        metric_column,
                        metric_label,
                        "All rows: Approved vs Rejected",
                    )
                )

    if not main_df.empty and "participant_helpful_bool" in main_df.columns:
        tests.append(
            categorical_test(
                main_df.dropna(subset=["participant_helpful_bool"]),
                "platform",
                "participant_helpful_bool",
                "Approved rows: Platform vs Helpfulness",
            )
        )

    corr_pairs = [
        ("confidence_rating_num", "effective_overall_match_pct", "Confidence vs overall accuracy"),
        ("confidence_rating_num", "completeness_pct", "Confidence vs completeness"),
        ("time_seconds_num", "effective_overall_match_pct", "Time vs overall accuracy"),
        ("false_insight_proxy_count", "effective_overall_match_pct", "False-insight proxy vs accuracy"),
    ]
    for x_col, y_col, label in corr_pairs:
        subset = main_df[[x_col, y_col]].dropna() if {x_col, y_col}.issubset(main_df.columns) else pd.DataFrame()
        if len(subset) >= 2 and subset[x_col].nunique() > 1 and subset[y_col].nunique() > 1:
            rho, p_value = stats.spearmanr(subset[x_col], subset[y_col])
            tests.append(
                {
                    "comparison": "Approved rows: correlation",
                    "metric": label,
                    "group_a": x_col,
                    "group_b": y_col,
                    "n_a": len(subset),
                    "n_b": None,
                    "mean_a": None,
                    "mean_b": None,
                    "mean_difference_a_minus_b": None,
                    "cohens_d": None,
                    "test": "Spearman correlation",
                    "statistic": round(float(rho), 4),
                    "p_value": round(float(p_value), 6) if not math.isnan(float(p_value)) else None,
                    "interpretation": significance_label(float(p_value))
                    if not math.isnan(float(p_value))
                    else "not enough variation",
                }
            )
    return tests


def write_stats_tests(path: Path, tests: list[dict[str, Any]]) -> None:
    fieldnames = [
        "comparison",
        "metric",
        "group_a",
        "group_b",
        "n_a",
        "n_b",
        "mean_a",
        "mean_b",
        "mean_difference_a_minus_b",
        "cohens_d",
        "test",
        "statistic",
        "p_value",
        "interpretation",
    ]
    write_csv(path, tests, fieldnames)


def build_model_summary(main_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    df = rows_to_frame(main_rows)
    needed = [
        "effective_overall_match_pct",
        "platform",
        "confidence_rating_num",
        "time_seconds_num",
        "completeness_pct",
        "false_insight_proxy_count",
    ]
    if df.empty or not set(needed).issubset(df.columns):
        return [
            {
                "model": "OLS accuracy model",
                "term": "model_status",
                "coefficient": None,
                "p_value": None,
                "r_squared": None,
                "n": len(df),
                "interpretation": "required columns unavailable",
            }
        ]

    model_df = df[needed].dropna().copy()
    model_df["platform_hyve"] = (model_df["platform"] == "hyve").astype(int)
    predictors = [
        "platform_hyve",
        "confidence_rating_num",
        "time_seconds_num",
        "completeness_pct",
        "false_insight_proxy_count",
    ]
    predictors = [column for column in predictors if model_df[column].nunique() > 1]
    if len(model_df) < max(4, len(predictors) + 2) or not predictors:
        return [
            {
                "model": "OLS accuracy model",
                "term": "model_status",
                "coefficient": None,
                "p_value": None,
                "r_squared": None,
                "n": len(model_df),
                "interpretation": "not enough complete rows or predictor variation",
            }
        ]

    y = model_df["effective_overall_match_pct"].astype(float)
    x = sm.add_constant(model_df[predictors].astype(float), has_constant="add")
    fitted = sm.OLS(y, x).fit()
    rows = [
        {
            "model": "OLS accuracy model",
            "term": term,
            "coefficient": round(float(fitted.params[term]), 6),
            "p_value": round(float(fitted.pvalues[term]), 6),
            "r_squared": round(float(fitted.rsquared), 6),
            "n": int(fitted.nobs),
            "interpretation": significance_label(float(fitted.pvalues[term])),
        }
        for term in fitted.params.index
    ]
    return rows


def write_model_summary(path: Path, rows: list[dict[str, Any]]) -> None:
    write_csv(
        path,
        rows,
        ["model", "term", "coefficient", "p_value", "r_squared", "n", "interpretation"],
    )


def tokenize_text(text: str) -> list[str]:
    tokens = re.findall(r"[a-zA-Z][a-zA-Z']+", text.lower())
    return [token for token in tokens if token not in STOPWORDS and len(token) > 2]


def qualitative_theme_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    outputs: list[dict[str, Any]] = []
    groups = [("all", rows)]
    for platform in sorted({row.get("platform") for row in rows if row.get("platform")}):
        groups.append((f"platform={platform}", [row for row in rows if row.get("platform") == platform]))

    sources = [
        ("strengths", "top_strengths"),
        ("weaknesses", "top_weaknesses"),
        ("admin_summary", "admin_analysis_summary"),
    ]
    for group_name, group_rows in groups:
        for source_name, column in sources:
            counter: Counter[str] = Counter()
            for row in group_rows:
                counter.update(tokenize_text(str(row.get(column) or "")))
            for rank, (term, count) in enumerate(counter.most_common(15), start=1):
                outputs.append(
                    {
                        "group": group_name,
                        "source": source_name,
                        "rank": rank,
                        "term": term,
                        "count": count,
                    }
                )
    return outputs


def write_qualitative_themes(path: Path, rows: list[dict[str, Any]]) -> None:
    write_csv(path, rows, ["group", "source", "rank", "term", "count"])


def answer_research_questions(
    platform_summary: dict[str, dict[str, Any]],
    comparisons: dict[str, Any],
    stats_tests: list[dict[str, Any]],
) -> list[dict[str, str]]:
    def find_test(comparison: str, metric: str, preferred: str = "Permutation test") -> dict[str, Any] | None:
        candidates = [
            row
            for row in stats_tests
            if row.get("comparison") == comparison
            and row.get("metric") == metric
            and row.get("test") == preferred
        ]
        if candidates:
            return candidates[0]
        fallback = [
            row
            for row in stats_tests
            if row.get("comparison") == comparison and row.get("metric") == metric
        ]
        return fallback[0] if fallback else None

    def direction(value: float | None, positive: str, negative: str, zero: str) -> str:
        if value is None:
            return "Not enough data to answer."
        if value > 0:
            return positive
        if value < 0:
            return negative
        return zero

    accuracy_diff = comparisons.get("hyve_minus_traditional_accuracy")
    time_diff = comparisons.get("hyve_minus_traditional_time_seconds")
    confidence_diff = comparisons.get("hyve_minus_traditional_confidence")
    false_proxy_diff = comparisons.get("hyve_minus_traditional_false_insight_proxy")
    accuracy_test = find_test("Approved rows: HYVE vs Traditional", "Overall accuracy")
    time_test = find_test("Approved rows: HYVE vs Traditional", "Completion time")
    speed_quality = find_test("Approved rows: correlation", "Time vs overall accuracy")
    confidence_quality = find_test("Approved rows: correlation", "Confidence vs overall accuracy")
    false_quality = find_test("Approved rows: correlation", "False-insight proxy vs accuracy")

    rows = [
        {
            "question": "Which method appears better for accurate insights?",
            "answer": direction(
                accuracy_diff,
                f"HYVE is higher by {accuracy_diff} percentage points on effective overall accuracy.",
                f"Traditional is higher by {abs(float(accuracy_diff))} percentage points on effective overall accuracy.",
                "HYVE and Traditional are tied on effective overall accuracy.",
            ),
            "evidence": (
                f"HYVE mean={platform_summary.get('hyve', {}).get('avg_overall_accuracy_pct')}; "
                f"Traditional mean={platform_summary.get('traditional', {}).get('avg_overall_accuracy_pct')}; "
                f"{accuracy_test.get('test')} {p_value_label(accuracy_test.get('p_value')) if accuracy_test else 'p-value not available'}."
            ),
            "caution": "For small samples, treat this as directional evidence unless the sample is large and the test is significant.",
        },
        {
            "question": "Which method is faster?",
            "answer": direction(
                time_diff,
                f"Traditional is faster by {time_diff} seconds on average.",
                f"HYVE is faster by {abs(float(time_diff))} seconds on average.",
                "HYVE and Traditional have the same average time.",
            ),
            "evidence": (
                f"HYVE mean time={platform_summary.get('hyve', {}).get('avg_time_seconds')}; "
                f"Traditional mean time={platform_summary.get('traditional', {}).get('avg_time_seconds')}; "
                f"{time_test.get('test')} {p_value_label(time_test.get('p_value')) if time_test else 'p-value not available'}."
            ),
            "caution": "A faster method is only better if accuracy and insight quality do not suffer.",
        },
        {
            "question": "Does speed relate to quality?",
            "answer": (
                f"Spearman rho={speed_quality.get('statistic')} for time vs accuracy."
                if speed_quality
                else "Not enough variation to estimate the speed-quality relationship."
            ),
            "evidence": (
                f"{p_value_label(speed_quality.get('p_value'))}; {speed_quality.get('interpretation')}"
                if speed_quality
                else "No correlation test available."
            ),
            "caution": "Correlation does not prove causation; it only shows whether faster/slower completion moves with accuracy.",
        },
        {
            "question": "Does confidence relate to actual correctness?",
            "answer": (
                f"Spearman rho={confidence_quality.get('statistic')} for confidence vs accuracy."
                if confidence_quality
                else "Not enough variation to estimate confidence calibration."
            ),
            "evidence": (
                f"{p_value_label(confidence_quality.get('p_value'))}; {confidence_quality.get('interpretation')}"
                if confidence_quality
                else "No correlation test available."
            ),
            "caution": "A positive relationship suggests calibrated confidence; a weak/negative relationship suggests overconfidence risk.",
        },
        {
            "question": "Does HYVE reduce poor or false insights?",
            "answer": direction(
                false_proxy_diff,
                f"HYVE has {false_proxy_diff} more false-insight proxy flags on average.",
                f"HYVE has {abs(float(false_proxy_diff))} fewer false-insight proxy flags on average.",
                "HYVE and Traditional have the same false-insight proxy average.",
            ),
            "evidence": (
                f"False-insight proxy vs accuracy: rho={false_quality.get('statistic')}, {p_value_label(false_quality.get('p_value'))}."
                if false_quality
                else "False-insight proxy uses low similarity scores and 'None' answers where available."
            ),
            "caution": "This is a proxy unless the study export later includes explicit false-positive labels.",
        },
    ]
    return rows


def write_research_questions(path: Path, rows: list[dict[str, str]]) -> None:
    write_csv(path, rows, ["question", "answer", "evidence", "caution"])


def write_colab_notebook(path: Path) -> None:
    notebook = {
        "cells": [
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    "# HYVE Experiment Analysis Notebook\n",
                    "\n",
                    "Upload an exported `study_X_results.csv` file, then run each cell. This notebook is designed for Google Colab and mirrors the reusable local analyzer.\n",
                ],
            },
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    "## 1. Install and Import Packages\n",
                    "Run this once in Colab. If the packages are already installed, Colab will skip most work.\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "!pip -q install pandas numpy scipy matplotlib seaborn statsmodels\n",
                    "\n",
                    "import itertools\n",
                    "import math\n",
                    "import random\n",
                    "import re\n",
                    "from collections import Counter\n",
                    "\n",
                    "import numpy as np\n",
                    "import pandas as pd\n",
                    "from scipy import stats\n",
                    "import statsmodels.api as sm\n",
                    "import matplotlib.pyplot as plt\n",
                    "import seaborn as sns\n",
                    "\n",
                    "sns.set_theme(style='whitegrid', context='talk')\n",
                ],
            },
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    "## 2. Upload CSV\n",
                    "Choose the exported CSV from the HYVE admin experiment analysis page.\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "from google.colab import files\n",
                    "uploaded = files.upload()\n",
                    "csv_path = next(iter(uploaded.keys()))\n",
                    "raw = pd.read_csv(csv_path)\n",
                    "raw.head()\n",
                ],
            },
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    "## 3. Prepare Analysis Columns\n",
                    "Effective scores use manual override scores when available, otherwise AI admin scores.\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "def split_items(value):\n",
                    "    if pd.isna(value):\n",
                    "        return []\n",
                    "    return [item.strip() for item in str(value).split('|') if item.strip()]\n",
                    "\n",
                    "def effective(df, ai_col, manual_col):\n",
                    "    ai = pd.to_numeric(df.get(ai_col), errors='coerce')\n",
                    "    manual = pd.to_numeric(df.get(manual_col), errors='coerce')\n",
                    "    return manual.combine_first(ai)\n",
                    "\n",
                    "df = raw.copy()\n",
                    "df['platform'] = df['platform'].astype(str).str.lower().str.strip()\n",
                    "df['review_status'] = df['review_status'].astype(str).str.lower().str.strip()\n",
                    "df['confidence_rating_num'] = pd.to_numeric(df.get('confidence_rating'), errors='coerce')\n",
                    "df['time_seconds_num'] = pd.to_numeric(df.get('time_seconds'), errors='coerce')\n",
                    "df['participant_helpful_bool'] = df.get('participant_helpful').astype(str).str.lower().map({'true': True, 'yes': True, '1': True, 'false': False, 'no': False, '0': False})\n",
                    "df['effective_strength_match_pct'] = effective(df, 'strength_match_pct', 'manual_strength_match_pct')\n",
                    "df['effective_weakness_match_pct'] = effective(df, 'weakness_match_pct', 'manual_weakness_match_pct')\n",
                    "df['effective_overall_match_pct'] = effective(df, 'overall_accuracy_pct', 'manual_overall_accuracy_pct')\n",
                    "df['submitted_strength_count'] = df.get('top_strengths', '').apply(lambda v: len(split_items(v)))\n",
                    "df['submitted_weakness_count'] = df.get('top_weaknesses', '').apply(lambda v: len(split_items(v)))\n",
                    "df['ground_truth_strength_count'] = df.get('study_ground_truth_strengths', '').apply(lambda v: len(split_items(v)))\n",
                    "df['ground_truth_weakness_count'] = df.get('study_ground_truth_weaknesses', '').apply(lambda v: len(split_items(v)))\n",
                    "df['submitted_insight_count'] = df['submitted_strength_count'] + df['submitted_weakness_count']\n",
                    "df['expected_insight_count'] = df['ground_truth_strength_count'] + df['ground_truth_weakness_count']\n",
                    "df['completeness_pct'] = np.where(df['expected_insight_count'] > 0, np.minimum(df['submitted_insight_count'] / df['expected_insight_count'], 1) * 100, np.nan)\n",
                    "score_cols = ['strength_1_score','strength_2_score','strength_3_score','weakness_1_score','weakness_2_score','weakness_3_score']\n",
                    "present_score_cols = [c for c in score_cols if c in df.columns]\n",
                    "df['low_similarity_score_count'] = df[present_score_cols].apply(pd.to_numeric, errors='coerce').lt(0.35).sum(axis=1) if present_score_cols else 0\n",
                    "df['none_answer_count'] = df.get('top_strengths', '').fillna('').str.lower().str.count('none') + df.get('top_weaknesses', '').fillna('').str.lower().str.count('none')\n",
                    "df['false_insight_proxy_count'] = df['low_similarity_score_count'] + df['none_answer_count']\n",
                    "approved = df[df['review_status'].eq('approved')].copy()\n",
                    "df[['platform','review_status','effective_overall_match_pct','confidence_rating_num','time_seconds_num','completeness_pct','false_insight_proxy_count']].head()\n",
                ],
            },
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": ["## 4. Research Questions Answered\n"],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "summary = approved.groupby('platform').agg(\n",
                    "    n=('result_id', 'count'),\n",
                    "    avg_accuracy=('effective_overall_match_pct', 'mean'),\n",
                    "    avg_strength=('effective_strength_match_pct', 'mean'),\n",
                    "    avg_weakness=('effective_weakness_match_pct', 'mean'),\n",
                    "    avg_confidence=('confidence_rating_num', 'mean'),\n",
                    "    avg_time=('time_seconds_num', 'mean'),\n",
                    "    avg_completeness=('completeness_pct', 'mean'),\n",
                    "    avg_false_proxy=('false_insight_proxy_count', 'mean'),\n",
                    "    helpful_rate=('participant_helpful_bool', lambda s: s.dropna().mean() if len(s.dropna()) else np.nan),\n",
                    ").round(3)\n",
                    "display(summary)\n",
                    "\n",
                    "def get_mean(platform, col):\n",
                    "    return approved.loc[approved.platform.eq(platform), col].mean()\n",
                    "\n",
                    "hyve_acc = get_mean('hyve', 'effective_overall_match_pct')\n",
                    "trad_acc = get_mean('traditional', 'effective_overall_match_pct')\n",
                    "hyve_time = get_mean('hyve', 'time_seconds_num')\n",
                    "trad_time = get_mean('traditional', 'time_seconds_num')\n",
                    "print('Which method appears more accurate?', 'HYVE' if hyve_acc > trad_acc else 'Traditional' if trad_acc > hyve_acc else 'Tie', hyve_acc, trad_acc)\n",
                    "print('Which method appears faster?', 'HYVE' if hyve_time < trad_time else 'Traditional' if trad_time < hyve_time else 'Tie', hyve_time, trad_time)\n",
                    "print('Speed-quality Spearman correlation:', approved[['time_seconds_num','effective_overall_match_pct']].corr(method='spearman').iloc[0,1])\n",
                    "print('Confidence-quality Spearman correlation:', approved[['confidence_rating_num','effective_overall_match_pct']].corr(method='spearman').iloc[0,1])\n",
                ],
            },
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    "## 5. Statistical Tests\n",
                    "For small samples, use p-values cautiously. Non-significant does not mean no effect; it often means the pilot is underpowered.\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "def permutation_test(a, b):\n",
                    "    a = pd.Series(a).dropna().astype(float).to_numpy(); b = pd.Series(b).dropna().astype(float).to_numpy()\n",
                    "    if len(a) == 0 or len(b) == 0: return np.nan\n",
                    "    obs = abs(a.mean() - b.mean()); combined = np.r_[a,b]; n = len(a)\n",
                    "    diffs = []\n",
                    "    for idx in itertools.combinations(range(len(combined)), n):\n",
                    "        idx = set(idx); pa = [combined[i] for i in idx]; pb = [combined[i] for i in range(len(combined)) if i not in idx]\n",
                    "        diffs.append(abs(np.mean(pa) - np.mean(pb)))\n",
                    "    return np.mean(np.array(diffs) >= obs)\n",
                    "\n",
                    "metrics = {\n",
                    "    'overall_accuracy': 'effective_overall_match_pct',\n",
                    "    'strength_accuracy': 'effective_strength_match_pct',\n",
                    "    'weakness_accuracy': 'effective_weakness_match_pct',\n",
                    "    'confidence': 'confidence_rating_num',\n",
                    "    'time': 'time_seconds_num',\n",
                    "    'completeness': 'completeness_pct',\n",
                    "    'false_insight_proxy': 'false_insight_proxy_count',\n",
                    "}\n",
                    "test_rows = []\n",
                    "for label, col in metrics.items():\n",
                    "    h = approved.loc[approved.platform.eq('hyve'), col].dropna(); t = approved.loc[approved.platform.eq('traditional'), col].dropna()\n",
                    "    row = {'metric': label, 'hyve_mean': h.mean(), 'traditional_mean': t.mean(), 'difference': h.mean()-t.mean(), 'permutation_p': permutation_test(h,t)}\n",
                    "    if len(h) >= 2 and len(t) >= 2 and h.nunique() > 1 and t.nunique() > 1:\n",
                    "        row['welch_p'] = stats.ttest_ind(h,t,equal_var=False).pvalue\n",
                    "        row['mann_whitney_p'] = stats.mannwhitneyu(h,t,alternative='two-sided').pvalue\n",
                    "    test_rows.append(row)\n",
                    "tests_df = pd.DataFrame(test_rows)\n",
                    "display(tests_df)\n",
                ],
            },
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": ["## 6. Plots and Interpretations\n"],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "fig, axes = plt.subplots(2, 3, figsize=(20, 12))\n",
                    "sns.countplot(data=df, x='platform', ax=axes[0,0]); axes[0,0].set_title('Rows by platform')\n",
                    "sns.countplot(data=df, x='review_status', ax=axes[0,1]); axes[0,1].set_title('Rows by review status')\n",
                    "sns.boxplot(data=approved, x='platform', y='effective_overall_match_pct', ax=axes[0,2]); sns.stripplot(data=approved, x='platform', y='effective_overall_match_pct', color='black', ax=axes[0,2]); axes[0,2].set_title('Accuracy by platform')\n",
                    "sns.boxplot(data=approved, x='platform', y='confidence_rating_num', ax=axes[1,0]); sns.stripplot(data=approved, x='platform', y='confidence_rating_num', color='black', ax=axes[1,0]); axes[1,0].set_title('Confidence by platform')\n",
                    "sns.boxplot(data=approved, x='platform', y='time_seconds_num', ax=axes[1,1]); sns.stripplot(data=approved, x='platform', y='time_seconds_num', color='black', ax=axes[1,1]); axes[1,1].set_title('Time by platform')\n",
                    "sns.scatterplot(data=approved, x='confidence_rating_num', y='effective_overall_match_pct', hue='platform', s=120, ax=axes[1,2]); axes[1,2].set_title('Confidence vs accuracy')\n",
                    "plt.tight_layout(); plt.show()\n",
                    "\n",
                    "print('Interpretation guide:')\n",
                    "print('- Accuracy by platform: higher values mean closer alignment with ground truth.')\n",
                    "print('- Confidence by platform: perceived certainty, not correctness.')\n",
                    "print('- Time by platform: lower is faster; interpret together with accuracy.')\n",
                    "print('- Confidence vs accuracy: upward trend means calibrated confidence; downward/flat trend means confidence may not reflect correctness.')\n",
                ],
            },
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": ["## 7. Exploratory Model\n"],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "model_df = approved[['effective_overall_match_pct','platform','confidence_rating_num','time_seconds_num','completeness_pct','false_insight_proxy_count']].dropna().copy()\n",
                    "model_df['platform_hyve'] = (model_df.platform == 'hyve').astype(int)\n",
                    "predictors = ['platform_hyve','confidence_rating_num','time_seconds_num','completeness_pct','false_insight_proxy_count']\n",
                    "predictors = [p for p in predictors if model_df[p].nunique() > 1]\n",
                    "if len(model_df) >= max(4, len(predictors)+2) and predictors:\n",
                    "    X = sm.add_constant(model_df[predictors])\n",
                    "    y = model_df['effective_overall_match_pct']\n",
                    "    print(sm.OLS(y, X).fit().summary())\n",
                    "else:\n",
                    "    print('OLS model not estimated: not enough complete rows or predictor variation.')\n",
                    "    print('This is normal for a very small pilot. Use the model on the full experiment dataset.')\n",
                ],
            },
        ],
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python", "version": "3.x"},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }
    import json

    path.write_text(json.dumps(notebook, indent=2), encoding="utf-8")


def save_plot(fig: Any, path: Path) -> None:
    fig.tight_layout()
    fig.savefig(path, dpi=180, bbox_inches="tight")


def create_plots(rows: list[dict[str, Any]], main_rows: list[dict[str, Any]], figures_dir: Path) -> list[Path]:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import seaborn as sns

    figures_dir.mkdir(parents=True, exist_ok=True)
    sns.set_theme(style="whitegrid", context="talk")
    palette = {"hyve": "#2563eb", "traditional": "#64748b"}
    status_palette = {"approved": "#059669", "rejected": "#dc2626", "pending": "#d97706"}

    all_df = rows_to_frame(rows)
    main_df = rows_to_frame(main_rows)
    paths: list[Path] = []

    def finish(filename: str) -> None:
        path = figures_dir / filename
        save_plot(plt.gcf(), path)
        plt.close()
        paths.append(path)

    plt.figure(figsize=(8, 5))
    sns.countplot(data=all_df, x="platform", hue="platform", palette=palette, legend=False)
    plt.title("Participant Rows by Platform")
    plt.xlabel("Platform")
    plt.ylabel("Rows")
    finish("01_platform_counts.png")

    plt.figure(figsize=(8, 5))
    sns.countplot(data=all_df, x="review_status", hue="review_status", palette=status_palette, legend=False)
    plt.title("Rows by Review Status")
    plt.xlabel("Review status")
    plt.ylabel("Rows")
    finish("02_status_counts.png")

    plt.figure(figsize=(8, 5))
    sns.boxplot(data=main_df, x="platform", y="effective_overall_match_pct", hue="platform", palette=palette, legend=False)
    sns.stripplot(data=main_df, x="platform", y="effective_overall_match_pct", color="#111827", size=7, jitter=0.15)
    plt.title("Overall Accuracy by Platform")
    plt.xlabel("Platform")
    plt.ylabel("Effective overall accuracy (%)")
    finish("03_accuracy_by_platform.png")

    long_accuracy = main_df.melt(
        id_vars=["platform"],
        value_vars=["effective_strength_match_pct", "effective_weakness_match_pct"],
        var_name="accuracy_type",
        value_name="accuracy_pct",
    )
    long_accuracy["accuracy_type"] = long_accuracy["accuracy_type"].map(
        {
            "effective_strength_match_pct": "Strengths",
            "effective_weakness_match_pct": "Weaknesses",
        }
    )
    plt.figure(figsize=(10, 5))
    sns.barplot(data=long_accuracy, x="accuracy_type", y="accuracy_pct", hue="platform", palette=palette, errorbar="se")
    plt.title("Strength and Weakness Accuracy")
    plt.xlabel("Insight type")
    plt.ylabel("Mean accuracy (%)")
    plt.legend(title="Platform")
    finish("04_strength_weakness_accuracy.png")

    plt.figure(figsize=(8, 5))
    sns.boxplot(data=main_df, x="platform", y="confidence_rating_num", hue="platform", palette=palette, legend=False)
    sns.stripplot(data=main_df, x="platform", y="confidence_rating_num", color="#111827", size=7, jitter=0.15)
    plt.title("Confidence by Platform")
    plt.xlabel("Platform")
    plt.ylabel("Confidence rating (1-5)")
    finish("05_confidence_by_platform.png")

    plt.figure(figsize=(8, 5))
    sns.boxplot(data=main_df, x="platform", y="time_seconds_num", hue="platform", palette=palette, legend=False)
    sns.stripplot(data=main_df, x="platform", y="time_seconds_num", color="#111827", size=7, jitter=0.15)
    plt.title("Completion Time by Platform")
    plt.xlabel("Platform")
    plt.ylabel("Time (seconds)")
    finish("06_time_by_platform.png")

    plt.figure(figsize=(8, 5))
    sns.scatterplot(
        data=main_df,
        x="confidence_rating_num",
        y="effective_overall_match_pct",
        hue="platform",
        palette=palette,
        s=120,
    )
    if len(main_df.dropna(subset=["confidence_rating_num", "effective_overall_match_pct"])) >= 2:
        sns.regplot(
            data=main_df,
            x="confidence_rating_num",
            y="effective_overall_match_pct",
            scatter=False,
            color="#111827",
            line_kws={"linewidth": 2, "linestyle": "--"},
        )
    plt.title("Confidence vs Accuracy")
    plt.xlabel("Confidence rating (1-5)")
    plt.ylabel("Effective overall accuracy (%)")
    finish("07_confidence_vs_accuracy.png")

    helpful_df = main_df.dropna(subset=["participant_helpful_bool"]).copy()
    if helpful_df.empty:
        helpful_df = pd.DataFrame({"platform": [], "participant_helpful_bool": []})
    plt.figure(figsize=(8, 5))
    sns.countplot(data=helpful_df, x="platform", hue="participant_helpful_bool", palette={True: "#059669", False: "#dc2626"})
    plt.title("Helpfulness Responses by Platform")
    plt.xlabel("Platform")
    plt.ylabel("Rows")
    plt.legend(title="Helpful")
    finish("08_helpfulness_by_platform.png")

    plt.figure(figsize=(8, 5))
    sns.boxplot(
        data=all_df,
        x="review_status",
        y="effective_overall_match_pct",
        hue="review_status",
        palette=status_palette,
        legend=False,
    )
    sns.stripplot(data=all_df, x="review_status", y="effective_overall_match_pct", color="#111827", size=6, jitter=0.15)
    plt.title("Accuracy by Review Status")
    plt.xlabel("Review status")
    plt.ylabel("Effective overall accuracy (%)")
    finish("09_approved_vs_rejected_accuracy.png")

    corr_columns = [
        "effective_overall_match_pct",
        "effective_strength_match_pct",
        "effective_weakness_match_pct",
        "confidence_rating_num",
        "time_seconds_num",
        "completeness_pct",
        "false_insight_proxy_count",
    ]
    corr_df = main_df[[column for column in corr_columns if column in main_df.columns]].corr(
        method="spearman"
    )
    plt.figure(figsize=(10, 7))
    sns.heatmap(corr_df, vmin=-1, vmax=1, cmap="vlag", annot=True, fmt=".2f", square=False)
    plt.title("Spearman Correlation Heatmap")
    finish("10_correlation_heatmap.png")

    return paths


def format_value(value: Any, suffix: str = "") -> str:
    if value is None:
        return "not available"
    if isinstance(value, float):
        return f"{value:.2f}{suffix}"
    return f"{value}{suffix}"


def build_report(
    csv_path: Path,
    rows: list[dict[str, Any]],
    main_rows: list[dict[str, Any]],
    main_status: str,
    status_counts: dict[str, int],
    platform_summary: dict[str, dict[str, Any]],
    comparisons: dict[str, Any],
    corr: float | None,
    stats_tests: list[dict[str, Any]],
    model_summary: list[dict[str, Any]],
    research_questions: list[dict[str, str]],
    figure_paths: list[Path],
) -> str:
    study_ids = sorted({str(row.get("study_id")) for row in rows if row.get("study_id")})
    lines = [
        f"# Experiment CSV Analysis: {csv_path.name}",
        "",
        "## Data Scope",
        f"- Source CSV: `{csv_path}`",
        f"- Study IDs found: {', '.join(study_ids) if study_ids else 'not available'}",
        f"- Total rows: {len(rows)}",
        f"- Main analysis filter: `review_status == {main_status}`",
        f"- Main analysis rows: {len(main_rows)}",
        f"- Review status counts: {', '.join(f'{k}={v}' for k, v in status_counts.items())}",
        "",
        "## Research Questions Answered",
        "| Question | Direct answer | Evidence | Caution |",
        "|---|---|---|---|",
    ]
    for row in research_questions:
        lines.append(
            f"| {row['question']} | {row['answer']} | {row['evidence']} | {row['caution']} |"
        )
    lines.extend(
        [
            "",
            "## Small-Sample Interpretation",
            "- Do not try to force statistical significance from a very small pilot sample. That would weaken the credibility of the study.",
            "- For small samples, prioritize direction of effects, effect sizes, permutation tests, bootstrap confidence intervals, and transparent uncertainty.",
            "- A non-significant p-value does not prove there is no difference; it often means the study is underpowered.",
            "- The full experiment should use the same pipeline, but conclusions should be based on approved rows with enough participants in both conditions.",
            "",
        "## Platform Summary",
        "| Platform | N | Avg accuracy | Avg strengths | Avg weaknesses | Avg completeness | Avg false-insight proxy | Avg confidence | Avg time | Helpful rate |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
        ]
    )
    for platform, values in platform_summary.items():
        lines.append(
            "| "
            + " | ".join(
                [
                    platform,
                    str(values["n"]),
                    format_value(values["avg_overall_accuracy_pct"], "%"),
                    format_value(values["avg_strength_match_pct"], "%"),
                    format_value(values["avg_weakness_match_pct"], "%"),
                    format_value(values["avg_completeness_pct"], "%"),
                    format_value(values["avg_false_insight_proxy_count"]),
                    format_value(values["avg_confidence"]),
                    format_value(values["avg_time_seconds"], "s"),
                    format_value(
                        None
                        if values["helpful_rate"] is None
                        else round(values["helpful_rate"] * 100, 1),
                        "%",
                    ),
                ]
            )
            + " |"
        )

    lines.extend(
        [
            "",
            "## HYVE Minus Traditional",
            f"- Overall accuracy difference: {format_value(comparisons.get('hyve_minus_traditional_accuracy'), ' percentage points')}",
            f"- Strength accuracy difference: {format_value(comparisons.get('hyve_minus_traditional_strength'), ' percentage points')}",
            f"- Weakness accuracy difference: {format_value(comparisons.get('hyve_minus_traditional_weakness'), ' percentage points')}",
            f"- Confidence difference: {format_value(comparisons.get('hyve_minus_traditional_confidence'))}",
            f"- Time difference: {format_value(comparisons.get('hyve_minus_traditional_time_seconds'), ' seconds')}",
            f"- Completeness difference: {format_value(comparisons.get('hyve_minus_traditional_completeness'), ' percentage points')}",
            f"- False-insight proxy difference: {format_value(comparisons.get('hyve_minus_traditional_false_insight_proxy'))}",
            "",
            "## Confidence Calibration",
            f"- Spearman correlation between confidence and effective overall accuracy: {format_value(corr)}",
            "",
            "## Statistical Tests",
        ]
    )

    meaningful_tests = [
        row
        for row in stats_tests
        if row.get("p_value") is not None
        and row.get("comparison") in {
            "Approved rows: HYVE vs Traditional",
            "Approved rows: correlation",
            "All rows: Approved vs Rejected",
        }
    ][:12]
    if meaningful_tests:
        lines.extend(
            [
                "| Comparison | Metric | Test | P-value | Interpretation |",
                "|---|---|---|---:|---|",
            ]
        )
        for row in meaningful_tests:
            lines.append(
                f"| {row['comparison']} | {row['metric']} | {row['test']} | {p_value_label(row.get('p_value'))} | {row['interpretation']} |"
            )
    else:
        lines.append("- Not enough complete rows for inferential statistical tests yet.")

    lines.extend(["", "## Exploratory Model"])
    model_rows_with_p = [row for row in model_summary if row.get("p_value") is not None]
    if model_rows_with_p:
        lines.extend(
            [
                "| Term | Coefficient | P-value | Interpretation |",
                "|---|---:|---:|---|",
            ]
        )
        for row in model_rows_with_p:
            lines.append(
                f"| {row['term']} | {format_value(row['coefficient'])} | {p_value_label(row.get('p_value'))} | {row['interpretation']} |"
            )
    else:
        status = model_summary[0]["interpretation"] if model_summary else "not available"
        lines.append(f"- OLS model not estimated: {status}.")

    lines.extend(
        [
            "",
            "## Generated Figures",
        ]
    )
    if figure_paths:
        for path in figure_paths:
            lines.append(f"- `{path}`")
    else:
        lines.append("- Plot generation was not requested.")

    lines.extend(["", "## Figure Interpretation Guide"])
    for filename, explanation in PLOT_GUIDE.items():
        lines.append(f"- **{filename}**: {explanation}")

    lines.extend(
        [
            "",
            "## Interpretation Notes",
        ]
    )

    if len(main_rows) < 20:
        lines.append(
            "- This looks like a pilot or internal dry run. Treat differences as a workflow check, not evidence of statistical significance."
        )
    if corr is not None and corr < 0:
        lines.append(
            "- Confidence is negatively associated with accuracy in this file, which suggests overconfidence in some responses."
        )
    elif corr is not None and corr > 0:
        lines.append(
            "- Confidence is positively associated with accuracy in this file, which suggests some calibration."
        )
    else:
        lines.append(
            "- There are not enough complete confidence and accuracy pairs to assess calibration."
        )

    lines.extend(
        [
            "- Effective accuracy uses manual override scores when present; otherwise it falls back to AI-generated admin scores.",
            "- For the real experiment, use the same script on the final exported CSV and prioritize approved rows.",
            "",
        ]
    )
    return "\n".join(lines)


def analyze_csv(
    csv_path: str | Path,
    output_dir: str | Path | None = None,
    main_status: str = "approved",
    generate_plots: bool = False,
) -> AnalysisResult:
    source_csv = Path(csv_path).expanduser().resolve()
    if not source_csv.exists():
        raise FileNotFoundError(f"CSV file not found: {source_csv}")

    if output_dir is None:
        output_dir_path = (
            Path.cwd() / "outputs" / "experiment-analysis" / source_csv.stem
        ).resolve()
    else:
        output_dir_path = Path(output_dir).expanduser().resolve()
    output_dir_path.mkdir(parents=True, exist_ok=True)

    rows = load_rows(source_csv)
    main_rows = choose_main_rows(rows, main_status)
    status_counts = count_by(rows, "review_status")
    platform_summary = summarize_platform(main_rows)
    comparisons = build_comparisons(platform_summary)
    corr = confidence_accuracy_correlation(main_rows)
    stats_tests = build_stats_tests(rows, main_rows)
    model_summary = build_model_summary(main_rows)
    qualitative_themes = qualitative_theme_rows(main_rows)
    research_questions = answer_research_questions(platform_summary, comparisons, stats_tests)

    report_path = output_dir_path / f"{source_csv.stem}_analysis.md"
    platform_summary_path = output_dir_path / f"{source_csv.stem}_platform_summary.csv"
    processed_rows_path = output_dir_path / f"{source_csv.stem}_processed_rows.csv"
    stats_tests_path = output_dir_path / f"{source_csv.stem}_stats_tests.csv"
    model_summary_path = output_dir_path / f"{source_csv.stem}_model_summary.csv"
    qualitative_themes_path = output_dir_path / f"{source_csv.stem}_qualitative_themes.csv"
    research_questions_path = output_dir_path / f"{source_csv.stem}_research_questions.csv"
    notebook_path = output_dir_path / f"{source_csv.stem}_colab_analysis.ipynb"
    figures_dir = output_dir_path / "figures"
    figure_paths = create_plots(rows, main_rows, figures_dir) if generate_plots else []

    report = build_report(
        source_csv,
        rows,
        main_rows,
        main_status,
        status_counts,
        platform_summary,
        comparisons,
        corr,
        stats_tests,
        model_summary,
        research_questions,
        figure_paths,
    )
    report_path.write_text(report, encoding="utf-8")
    write_platform_summary(platform_summary_path, platform_summary)
    write_stats_tests(stats_tests_path, stats_tests)
    write_model_summary(model_summary_path, model_summary)
    write_qualitative_themes(qualitative_themes_path, qualitative_themes)
    write_research_questions(research_questions_path, research_questions)
    write_colab_notebook(notebook_path)

    processed_fieldnames = list(rows[0].keys()) if rows else []
    write_csv(processed_rows_path, rows, processed_fieldnames)

    return AnalysisResult(
        source_csv=source_csv,
        output_dir=output_dir_path,
        row_count=len(rows),
        main_row_count=len(main_rows),
        status_counts=status_counts,
        platform_summary=platform_summary,
        comparisons=comparisons,
        confidence_accuracy_spearman=corr,
        report_path=report_path,
        platform_summary_path=platform_summary_path,
        processed_rows_path=processed_rows_path,
        stats_tests_path=stats_tests_path,
        model_summary_path=model_summary_path,
        qualitative_themes_path=qualitative_themes_path,
        notebook_path=notebook_path,
        figures_dir=figures_dir if generate_plots else None,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analyze a HYVE exported experiment CSV."
    )
    parser.add_argument("csv_path", help="Path to a study_X_results.csv export")
    parser.add_argument(
        "--out",
        default=None,
        help="Output directory. Defaults to outputs/experiment-analysis/<csv-name>/",
    )
    parser.add_argument(
        "--main-status",
        default="approved",
        help="Rows used for main analysis: approved, all, non-rejected, pending, rejected. Default: approved.",
    )
    parser.add_argument(
        "--plots",
        action="store_true",
        help="Generate PNG plot images in a figures/ folder.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = analyze_csv(args.csv_path, args.out, args.main_status, args.plots)
    print(f"Analyzed {result.row_count} rows.")
    print(f"Main analysis rows: {result.main_row_count}")
    print(f"Report: {result.report_path}")
    print(f"Platform summary: {result.platform_summary_path}")
    print(f"Processed rows: {result.processed_rows_path}")
    print(f"Statistical tests: {result.stats_tests_path}")
    print(f"Model summary: {result.model_summary_path}")
    print(f"Qualitative themes: {result.qualitative_themes_path}")
    print(f"Colab notebook: {result.notebook_path}")
    if result.figures_dir:
        print(f"Figures: {result.figures_dir}")


if __name__ == "__main__":
    main()
