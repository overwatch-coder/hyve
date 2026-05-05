import os
from types import SimpleNamespace
from pathlib import Path

import pytest

TEST_DB_PATH = Path("backend/tests/test_semantic_grouping.sqlite3")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.as_posix()}"

import ai_engine
import pipeline


def _claim(claim_id: int, text: str, sentiment: str, severity: float):
    return SimpleNamespace(
        id=claim_id,
        claim_text=text,
        sentiment_polarity=sentiment,
        severity=severity,
    )


def test_semantically_similar_claims_are_merged(monkeypatch):
    claims = [
        _claim(1, "Sound quality is great", "positive", 0.9),
        _claim(2, "Audio quality is strong", "positive", 0.5),
    ]

    monkeypatch.setattr(
        pipeline,
        "deduplicate_claims_ai",
        lambda claims_list, theme_name: [
            {
                "representative_text": "Sound quality is great",
                "sentiment": "positive",
                "severity": 0.1,
                "mention_count": 99,
                "original_ids": [1, 2],
            }
        ],
    )

    grouped = pipeline.consolidate_theme_claims("Sound Quality", claims)

    assert grouped == [
        {
            "representative_text": "Sound quality is great",
            "sentiment": "positive",
            "severity": pytest.approx(0.7),
            "mention_count": 2,
            "original_ids": [1, 2],
        }
    ]


def test_opposite_sentiments_are_not_merged(monkeypatch):
    claims = [
        _claim(1, "Battery life lasts all day", "positive", 0.8),
        _claim(2, "Battery dies within hours", "negative", 0.9),
    ]

    monkeypatch.setattr(
        pipeline,
        "deduplicate_claims_ai",
        lambda claims_list, theme_name: [
            {
                "representative_text": "Battery performance varies",
                "sentiment": "positive",
                "severity": 0.3,
                "mention_count": 2,
                "original_ids": [1, 2],
            }
        ],
    )

    grouped = pipeline.consolidate_theme_claims("Battery", claims)

    assert len(grouped) == 2
    assert {item["sentiment"] for item in grouped} == {"positive", "negative"}
    assert all(item["mention_count"] == 1 for item in grouped)
    assert {item["representative_text"] for item in grouped} == {
        "Battery life lasts all day",
        "Battery dies within hours",
    }


def test_grouped_outputs_expose_mention_count():
    grouped = pipeline.consolidate_theme_claims(
        "Comfort",
        [_claim(1, "Fit feels comfortable", "positive", 0.4)],
    )

    assert grouped[0]["mention_count"] == 1
    assert "mention_count" in grouped[0]


def test_surfaced_items_are_capped_at_eight(monkeypatch):
    claims = [
        _claim(i, f"claim {i}", "negative", i / 10)
        for i in range(1, 11)
    ]

    monkeypatch.setattr(
        pipeline,
        "deduplicate_claims_ai",
        lambda claims_list, theme_name: [
            {
                "representative_text": claim.claim_text,
                "sentiment": claim.sentiment_polarity,
                "severity": 0.0,
                "mention_count": 1,
                "original_ids": [claim.id],
            }
            for claim in claims_list
        ],
    )

    grouped = pipeline.consolidate_theme_claims("Durability", claims)

    assert len(grouped) == 8
    assert [item["representative_text"] for item in grouped] == [
        "claim 10",
        "claim 9",
        "claim 8",
        "claim 7",
        "claim 6",
        "claim 5",
        "claim 4",
        "claim 3",
    ]


def test_equivalent_theme_names_are_merged_into_one_canonical_theme(monkeypatch):
    themes = [
        {
            "id": 11,
            "name": "Sound Quality",
            "claim_count": 3,
            "grouped_claims": [
                {
                    "representative_text": "Sound quality is rich",
                    "mention_count": 2,
                }
            ],
            "member_theme_ids": [11],
        },
        {
            "id": 12,
            "name": "Audio Quality",
            "claim_count": 2,
            "grouped_claims": [
                {
                    "representative_text": "Audio quality is strong",
                    "mention_count": 2,
                }
            ],
            "member_theme_ids": [12],
        },
        {
            "id": 13,
            "name": "Battery Life",
            "claim_count": 1,
            "grouped_claims": [
                {
                    "representative_text": "Battery drains quickly",
                    "mention_count": 1,
                }
            ],
            "member_theme_ids": [13],
        },
    ]

    monkeypatch.setattr(
        ai_engine,
        "compare_theme_semantics",
        lambda theme_a, theme_b, provider=None: {
            "merge": {theme_a["name"], theme_b["name"]}
            == {"Sound Quality", "Audio Quality"},
            "canonical_name": "Sound Quality",
        },
    )

    merged = ai_engine.merge_semantically_equivalent_themes(themes)

    assert len(merged) == 2
    merged_sound = next(theme for theme in merged if theme["canonical_name"] == "Sound Quality")
    assert sorted(merged_sound["member_theme_ids"]) == [11, 12]
    assert len(merged_sound["grouped_claims"]) == 2
    assert next(theme for theme in merged if theme["canonical_name"] == "Battery Life")[
        "member_theme_ids"
    ] == [13]
