import numpy as np

import experiment_scoring


def test_score_similarity_prefers_embeddings(monkeypatch):
    monkeypatch.setattr(
        experiment_scoring,
        "embed_texts",
        lambda texts, task_type="SEMANTIC_SIMILARITY": np.array(
            [[1.0, 0.0], [1.0, 0.0]],
            dtype=np.float32,
        ),
    )
    monkeypatch.setattr(
        experiment_scoring,
        "_llm_similarity_score",
        lambda a, b: 0.12,
    )

    score = experiment_scoring.score_similarity(
        "Very stable while standing",
        "Stable at standing height",
    )

    assert score == 1.0


def test_score_similarity_falls_back_to_llm_when_embeddings_fail(monkeypatch):
    monkeypatch.setattr(
        experiment_scoring,
        "embed_texts",
        lambda texts, task_type="SEMANTIC_SIMILARITY": (_ for _ in ()).throw(
            RuntimeError("embedding unavailable")
        ),
    )
    monkeypatch.setattr(
        experiment_scoring,
        "_llm_similarity_score",
        lambda a, b: 0.82,
    )
    monkeypatch.setattr(
        experiment_scoring,
        "_tfidf_similarity_score",
        lambda a, b: 0.15,
    )

    score = experiment_scoring.score_similarity(
        "Large desktop surface",
        "Spacious work surface",
    )

    assert score == 0.82


def test_score_similarity_uses_tfidf_only_as_last_resort(monkeypatch):
    monkeypatch.setattr(
        experiment_scoring,
        "embed_texts",
        lambda texts, task_type="SEMANTIC_SIMILARITY": (_ for _ in ()).throw(
            RuntimeError("embedding unavailable")
        ),
    )
    monkeypatch.setattr(
        experiment_scoring,
        "_llm_similarity_score",
        lambda a, b: (_ for _ in ()).throw(RuntimeError("llm unavailable")),
    )
    monkeypatch.setattr(
        experiment_scoring,
        "_tfidf_similarity_score",
        lambda a, b: 0.37,
    )

    score = experiment_scoring.score_similarity(
        "Assembly was simple",
        "Straightforward assembly",
    )

    assert score == 0.37
