"""
Regression tests for text-first sentiment reconciliation.

The core rule: written review content is the PRIMARY signal for claim polarity.
Star ratings are SECONDARY — used only when the text signal is ambiguous.
"""
import pytest
from ai_engine import reconcile_claim_sentiment


# ---------------------------------------------------------------------------
# Core contract: strong positive text wins over low/contradictory rating
# ---------------------------------------------------------------------------

def test_positive_text_beats_low_star_rating():
    """The canonical bug case: clearly positive text + 1-star rating → positive."""
    result = reconcile_claim_sentiment(
        claim_text="Battery life is amazing and lasts all day",
        evidence_text="Battery lasts over 8 hours with heavy use",
        context_text="Daily commute and work use",
        llm_polarity="negative",
        star_rating=1.0,
    )
    assert result == "positive"


def test_negative_text_beats_high_star_rating():
    """Negative text + 5-star rating → negative (reviewer error / sarcasm)."""
    result = reconcile_claim_sentiment(
        claim_text="Battery drains terribly and breaks quickly",
        evidence_text="Dead within 2 hours, completely useless",
        context_text="Light use",
        llm_polarity="positive",
        star_rating=5.0,
    )
    assert result == "negative"


# ---------------------------------------------------------------------------
# LLM polarity is respected when it agrees with text evidence
# ---------------------------------------------------------------------------

def test_llm_positive_respected_when_text_is_positive():
    result = reconcile_claim_sentiment(
        claim_text="Sound quality is excellent",
        evidence_text="Rich bass and clear highs",
        context_text="Music listening",
        llm_polarity="positive",
        star_rating=4.5,
    )
    assert result == "positive"


def test_llm_negative_respected_when_text_is_negative():
    result = reconcile_claim_sentiment(
        claim_text="Build quality is terrible",
        evidence_text="Broke after one week",
        context_text="Normal use",
        llm_polarity="negative",
        star_rating=1.0,
    )
    assert result == "negative"


# ---------------------------------------------------------------------------
# Ambiguous text → fall back to LLM polarity, then rating
# ---------------------------------------------------------------------------

def test_ambiguous_text_falls_back_to_llm_polarity():
    """When text is genuinely neutral/ambiguous, trust the LLM's verdict."""
    result = reconcile_claim_sentiment(
        claim_text="The color is blue",
        evidence_text="It arrived on time",
        context_text="Purchase",
        llm_polarity="neutral",
        star_rating=3.0,
    )
    assert result == "neutral"


def test_ambiguous_text_uses_rating_when_llm_neutral():
    """Fully ambiguous text + neutral LLM → rating decides: 1-star → negative."""
    result = reconcile_claim_sentiment(
        claim_text="The color is blue",
        evidence_text="It arrived on time",
        context_text="Purchase",
        llm_polarity="neutral",
        star_rating=1.0,
    )
    assert result == "negative"


def test_ambiguous_text_uses_rating_high_star():
    """Fully ambiguous text + neutral LLM → rating decides: 5-star → positive."""
    result = reconcile_claim_sentiment(
        claim_text="The color is blue",
        evidence_text="It arrived on time",
        context_text="Purchase",
        llm_polarity="neutral",
        star_rating=5.0,
    )
    assert result == "positive"


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

def test_no_star_rating_falls_back_gracefully():
    """Missing star_rating with ambiguous text and neutral LLM → neutral."""
    result = reconcile_claim_sentiment(
        claim_text="It exists",
        evidence_text="I have it",
        context_text="",
        llm_polarity="neutral",
        star_rating=None,
    )
    assert result == "neutral"


def test_moderate_positive_text_with_contradictory_llm():
    """Single strong positive word + contradictory LLM → text wins."""
    result = reconcile_claim_sentiment(
        claim_text="The display is fantastic",
        evidence_text="Very sharp and bright",
        context_text="Video watching",
        llm_polarity="negative",
        star_rating=2.0,
    )
    assert result == "positive"
