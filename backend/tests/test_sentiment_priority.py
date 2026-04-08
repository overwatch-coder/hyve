"""
Regression tests for text-first sentiment reconciliation via HuggingFace API.

All tests mock analyze_sentiment_hf so no real network call is made.
The reconcile_claim_sentiment function is tested in isolation.
"""
import pytest
from unittest.mock import patch
from ai_engine import reconcile_claim_sentiment


def _mock_hf(polarity: str, confidence: float):
    """Return a patch context that makes analyze_sentiment_hf return fixed values."""
    return patch("ai_engine.analyze_sentiment_hf", return_value=(polarity, confidence))


# ---------------------------------------------------------------------------
# High-confidence HF result is authoritative (≥ 0.65)
# ---------------------------------------------------------------------------

def test_high_confidence_positive_beats_contradictory_llm_and_low_rating():
    """The canonical bug case: HF says positive with high confidence → positive."""
    with _mock_hf("positive", 0.97):
        result = reconcile_claim_sentiment(
            claim_text="Battery life is amazing and lasts all day",
            evidence_text="Battery lasts over 8 hours with heavy use",
            context_text="Daily commute and work use",
            llm_polarity="negative",
            star_rating=1.0,
        )
    assert result == "positive"


def test_high_confidence_negative_beats_high_star_rating():
    """HF says negative with high confidence → negative, even with 5-star rating."""
    with _mock_hf("negative", 0.91):
        result = reconcile_claim_sentiment(
            claim_text="Battery drains terribly and breaks quickly",
            evidence_text="Dead within 2 hours",
            context_text="Light use",
            llm_polarity="positive",
            star_rating=5.0,
        )
    assert result == "negative"


def test_high_confidence_positive_agrees_with_llm():
    """HF positive + LLM positive → positive."""
    with _mock_hf("positive", 0.88):
        result = reconcile_claim_sentiment(
            claim_text="Sound quality is excellent",
            evidence_text="Rich bass and clear highs",
            context_text="Music listening",
            llm_polarity="positive",
            star_rating=4.5,
        )
    assert result == "positive"


# ---------------------------------------------------------------------------
# Moderate HF confidence (0.5–0.65) still prefers HF over LLM
# ---------------------------------------------------------------------------

def test_moderate_confidence_hf_positive_used():
    """Moderate HF confidence → still uses HF result."""
    with _mock_hf("positive", 0.58):
        result = reconcile_claim_sentiment(
            claim_text="The display is fantastic",
            evidence_text="Very sharp and bright",
            context_text="Video watching",
            llm_polarity="negative",
            star_rating=2.0,
        )
    assert result == "positive"


# ---------------------------------------------------------------------------
# HF unavailable (neutral, 0.0) → fall back to LLM, then rating
# ---------------------------------------------------------------------------

def test_hf_unavailable_falls_back_to_llm_positive():
    """No HF token / API down → LLM polarity is used."""
    with _mock_hf("neutral", 0.0):
        result = reconcile_claim_sentiment(
            claim_text="Sound quality is excellent",
            evidence_text="Rich bass",
            context_text="",
            llm_polarity="positive",
            star_rating=4.0,
        )
    assert result == "positive"


def test_hf_unavailable_falls_back_to_llm_negative():
    with _mock_hf("neutral", 0.0):
        result = reconcile_claim_sentiment(
            claim_text="Build quality is terrible",
            evidence_text="Broke after one week",
            context_text="Normal use",
            llm_polarity="negative",
            star_rating=1.0,
        )
    assert result == "negative"


def test_hf_unavailable_llm_neutral_uses_high_rating():
    """HF down + LLM neutral + 5-star rating → positive."""
    with _mock_hf("neutral", 0.0):
        result = reconcile_claim_sentiment(
            claim_text="The color is blue",
            evidence_text="It arrived on time",
            context_text="Purchase",
            llm_polarity="neutral",
            star_rating=5.0,
        )
    assert result == "positive"


def test_hf_unavailable_llm_neutral_uses_low_rating():
    """HF down + LLM neutral + 1-star rating → negative."""
    with _mock_hf("neutral", 0.0):
        result = reconcile_claim_sentiment(
            claim_text="The color is blue",
            evidence_text="It arrived on time",
            context_text="Purchase",
            llm_polarity="neutral",
            star_rating=1.0,
        )
    assert result == "negative"


def test_hf_unavailable_llm_neutral_mid_rating_is_neutral():
    """HF down + LLM neutral + 3-star rating → neutral (2.5–3.5 bucket)."""
    with _mock_hf("neutral", 0.0):
        result = reconcile_claim_sentiment(
            claim_text="The color is blue",
            evidence_text="It arrived on time",
            context_text="Purchase",
            llm_polarity="neutral",
            star_rating=3.0,
        )
    assert result == "neutral"


def test_hf_unavailable_no_rating_returns_neutral():
    """HF down + LLM neutral + no rating → neutral."""
    with _mock_hf("neutral", 0.0):
        result = reconcile_claim_sentiment(
            claim_text="It exists",
            evidence_text="I have it",
            context_text="",
            llm_polarity="neutral",
            star_rating=None,
        )
    assert result == "neutral"

