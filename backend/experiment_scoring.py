import re
import json
import os
from typing import Iterable, Optional
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS
from ai_engine import embed_texts


def normalize_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def word_count(text: str) -> int:
    return len(normalize_text(text).split())


def _tfidf_similarity_score(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    a_norm = normalize_text(a)
    b_norm = normalize_text(b)
    vectorizer = TfidfVectorizer(stop_words=list(ENGLISH_STOP_WORDS))
    try:
        tfidf = vectorizer.fit_transform([a_norm, b_norm])
        tfidf_matrix = tfidf.toarray()  # type: ignore
        score = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0]
        return float(score)
    except ValueError:
        # Happens if strings only contain stop words or are empty after normalization
        return 0.0


def _embedding_similarity_score(a: str, b: str) -> float:
    vectors = embed_texts([a, b], task_type="SEMANTIC_SIMILARITY")
    score = cosine_similarity(vectors[0:1], vectors[1:2])[0][0]
    return float(score)


def _parse_llm_similarity_score(raw_text: str) -> Optional[float]:
    text = raw_text.strip()
    try:
        payload = json.loads(text)
        if isinstance(payload, dict):
            value = payload.get("score")
            if isinstance(value, (int, float)):
                return max(0.0, min(1.0, float(value)))
    except json.JSONDecodeError:
        pass

    try:
        value = float(text)
        return max(0.0, min(1.0, value))
    except ValueError:
        return None


def _llm_similarity_score(a: str, b: str) -> float:
    provider = os.getenv("LLM_PROVIDER", "openai").lower()
    prompt = (
        "Compare the meaning of these two short product-assessment statements and "
        "return only JSON with a numeric score field from 0.0 to 1.0, where 1.0 "
        "means they express essentially the same idea.\n"
        f"Statement A: {a}\n"
        f"Statement B: {b}\n"
        'Output format: {"score": 0.0}'
    )

    if provider == "gemini":
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")
        from google import genai as _ggenai

        client = _ggenai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=os.getenv("STUDY_SCORING_LLM_MODEL", "gemini-2.0-flash"),
            contents=prompt,
        )
        content = (response.text or "").strip()
    else:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        import openai

        client = openai.OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.getenv("STUDY_SCORING_LLM_MODEL", "gpt-4o-mini"),
            messages=[
                {
                    "role": "system",
                    "content": "You compare meaning similarity and return only JSON.",
                },
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            timeout=20.0,
        )
        content = (response.choices[0].message.content or "").strip()

    score = _parse_llm_similarity_score(content)
    if score is None:
        raise RuntimeError("LLM similarity scoring returned an invalid score")
    return score


def score_similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0

    try:
        return _embedding_similarity_score(a, b)
    except Exception:
        pass

    try:
        return _llm_similarity_score(a, b)
    except Exception:
        pass

    return _tfidf_similarity_score(a, b)


def classify_score(score: float, low: float = 0.35, high: float = 0.55) -> str:
    if score < low:
        return "low"
    if score < high:
        return "mid"
    return "high"
