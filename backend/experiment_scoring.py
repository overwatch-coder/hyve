import re
from typing import Iterable
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS


def normalize_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def word_count(text: str) -> int:
    return len(normalize_text(text).split())


def score_similarity(a: str, b: str) -> float:
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


def classify_score(score: float, low: float = 0.35, high: float = 0.55) -> str:
    if score < low:
        return "low"
    if score < high:
        return "mid"
    return "high"
