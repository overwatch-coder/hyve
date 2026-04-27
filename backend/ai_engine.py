import json
import os
import hashlib
import struct
import time
import requests as _requests
from pydantic import BaseModel, Field

# Using groq/openai as an example.

# ---------------------------------------------------------------------------
# HuggingFace Inference API — sentiment analysis
# Model: cardiffnlp/twitter-roberta-base-sentiment-latest
# Labels: Negative / Neutral / Positive  (confidence score per label)
# Docs: https://huggingface.co/cardiffnlp/twitter-roberta-base-sentiment-latest
# ---------------------------------------------------------------------------
_HF_SENTIMENT_MODEL = "cardiffnlp/twitter-roberta-base-sentiment-latest"
# Updated to new HuggingFace Inference Providers router (old api-inference.huggingface.co returns 410)
_HF_API_URL = f"https://router.huggingface.co/hf-inference/models/{_HF_SENTIMENT_MODEL}"
_HF_CONFIDENCE_THRESHOLD = 0.65  # Treat result as authoritative above this score


def _hf_label_to_polarity(label: str) -> str:
    """Map HuggingFace model label → our internal schema value."""
    label_lower = label.lower()
    if "positive" in label_lower:
        return "positive"
    if "negative" in label_lower:
        return "negative"
    return "neutral"


def analyze_sentiment_hf(text: str) -> tuple[str, float]:
    """
    Call the HuggingFace Inference API for ML-based sentiment analysis.

    Returns (polarity, confidence) where polarity is one of:
      'positive' | 'negative' | 'neutral'

    Falls back to ('neutral', 0.0) gracefully when:
    - HF_TOKEN env var is not set
    - The API is unavailable / rate-limited
    - The model is still loading (503 with retry)

    Requires the HF_TOKEN environment variable (free HuggingFace account).
    """
    token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_API_KEY")
    if not token:
        return "neutral", 0.0

    headers = {"Authorization": f"Bearer {token}"}
    # Truncate to ~512 chars to stay within the model's token limit
    payload = {"inputs": text[:512]}

    for attempt in range(3):
        try:
            resp = _requests.post(
                _HF_API_URL, headers=headers, json=payload, timeout=15.0)
            if resp.status_code == 503:
                # Model is warming up — wait and retry (exponential backoff)
                time.sleep(2 ** attempt)
                continue
            if resp.status_code == 429:
                # Rate limited — back off and retry
                time.sleep(2 ** attempt)
                continue
            if 400 <= resp.status_code < 500:
                # Permanent client error (410 Gone, 401 Unauthorized, etc.) — don't retry
                print(
                    f"DEBUG: HF sentiment API permanent error {resp.status_code} — skipping (check HF_TOKEN and model availability)")
                return "neutral", 0.0
            resp.raise_for_status()
            result = resp.json()

            # Response shape: [[{label, score}, ...]]
            if isinstance(result, list) and result:
                candidates = result[0] if isinstance(
                    result[0], list) else result
                best = max(candidates, key=lambda x: x.get("score", 0.0))
                polarity = _hf_label_to_polarity(best.get("label", ""))
                return polarity, float(best.get("score", 0.0))

        except Exception as exc:
            print(
                f"DEBUG: HF sentiment API error (attempt {attempt + 1}): {exc}")

    return "neutral", 0.0


def reconcile_claim_sentiment(
    claim_text: str,
    evidence_text: str,
    context_text: str,
    llm_polarity: str,
    star_rating: float | None,
) -> str:
    """
    Determines the final sentiment polarity of a claim.

    Priority order:
    1. HuggingFace Inference API (ML model) — primary signal.
       High confidence (≥ 0.65): result is authoritative.
       Moderate confidence (0.5–0.65): cross-checked with LLM polarity.
    2. LLM-derived polarity — used when HF API is unavailable or low confidence.
    3. Star rating — final tiebreaker (3 buckets) when both above are neutral/ambiguous.

    Returns: "positive" | "negative" | "neutral"
    """
    analysis_text = f"{claim_text}. {evidence_text}".strip(". ")
    hf_polarity, hf_confidence = analyze_sentiment_hf(analysis_text)

    # --- High-confidence HF result: authoritative ---
    if hf_confidence >= _HF_CONFIDENCE_THRESHOLD and hf_polarity in ("positive", "negative"):
        return hf_polarity

    # --- Moderate HF confidence: use when LLM agrees, otherwise still prefer HF ---
    if hf_confidence >= 0.5 and hf_polarity in ("positive", "negative"):
        return hf_polarity  # HF ML model beats LLM heuristic at any non-trivial confidence

    # --- HF unavailable / low confidence / neutral: fall back to LLM ---
    if llm_polarity in ("positive", "negative"):
        return llm_polarity

    # --- Final fallback: star rating (3 buckets) ---
    if star_rating is not None:
        if star_rating >= 3.5:
            return "positive"
        if star_rating < 2.5:
            return "negative"
        return "neutral"  # 2.5 ≤ rating < 3.5

    return "neutral"


class ExtractionResult(BaseModel):
    claims: list[dict] = Field(
        description="A list of distinct claims extracted from the review. Each object should have 'claim_text', 'evidence_text', 'context_text', 'sentiment_polarity' (positive/negative/neutral), and 'severity' (0.0 to 1.0).")


def _clean_json_text(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1]
    if t.endswith("```"):
        t = t.rsplit("\n", 1)[0]
    return t.strip()


def extract_claims_from_llm(review_text: str, provider: str = "openai", star_rating: float | None = None) -> dict:
    """
    Extracts structured claims from raw review text using an LLM.
    Supports multiple providers via environment configuration.

    star_rating is passed as secondary context only — the written text is
    the authoritative signal for sentiment polarity.
    """
    rating_context = (
        f"\n    Note: The reviewer gave a star rating of {star_rating}/5. "
        "Treat this as secondary context only — the written review text is "
        "the authoritative signal for sentiment polarity."
        if star_rating is not None else ""
    )
    prompt = f"""
    Analyze the following product review and extract key arguments/claims.
    For each distinct claim, extract:
    - The core claim (e.g., "Battery life is poor")
    - Supporting evidence from the text (e.g., "Drains within 5 hours")
    - Context (e.g., "Heavy social media use")
    - Sentiment polarity (positive, negative, or neutral) — base this on the
      written content of the review, not the star rating.
    - Severity (a float basically mapping how critical this issue is on a scale from 0.0 to 1.0)
    {rating_context}
    Review text: "{review_text}"
    """

    # Example integration layout structure
    if provider == "openai":
        import openai
        client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        # In production this would use instructor or openai function calling
        # to enforce the ExtractionResult schema.
        # Using a simulated mock response for the structural layout.

        print("DEBUG: Sending request to OpenAI...")
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a senior data analyst extracting precise structured arguments from consumer reviews. Output JSON."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            timeout=30.0
        )
        return json.loads(response.choices[0].message.content)

    elif provider == "gemini":
        from google import genai as _ggenai
        _gclient = _ggenai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        sys_msg = "You are a senior data analyst extracting precise structured arguments from consumer reviews. Output JSON."
        response = _gclient.models.generate_content(
            model="gemini-2.0-flash",
            contents=f"System: {sys_msg}\n\nUser: {prompt}\n\nOutput raw JSON.",
        )
        return json.loads(_clean_json_text(response.text))

    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")


async def extract_claims_from_llm_async(review_text: str, provider: str = "openai", star_rating: float | None = None) -> dict:
    """
    Async version of extract_claims_from_llm for parallel execution.

    star_rating is passed as secondary context only — the written text is
    the authoritative signal for sentiment polarity.
    """
    rating_context = (
        f"\n    Note: The reviewer gave a star rating of {star_rating}/5. "
        "Treat this as secondary context only — the written review text is "
        "the authoritative signal for sentiment polarity."
        if star_rating is not None else ""
    )
    prompt = f"""
    Analyze the following product review and extract key arguments/claims.
    For each distinct claim, extract:
    - The core claim (e.g., "Battery life is poor")
    - Supporting evidence from the text (e.g., "Drains within 5 hours")
    - Context (e.g., "Heavy social media use")
    - Sentiment polarity (positive, negative, or neutral) — base this on the
      written content of the review, not the star rating.
    - Severity (a float basically mapping how critical this issue is on a scale from 0.0 to 1.0)
    {rating_context}
    Review text: "{review_text}"
    """

    if provider == "openai":
        import openai
        client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        print("DEBUG: Sending async request to OpenAI...")
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a senior data analyst extracting precise structured arguments from consumer reviews. Output JSON."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            timeout=30.0
        )
        return json.loads(response.choices[0].message.content)

    elif provider == "gemini":
        import asyncio
        from google import genai as _ggenai
        _gclient = _ggenai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        sys_msg = "You are a senior data analyst extracting precise structured arguments from consumer reviews. Output JSON."
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: _gclient.models.generate_content(
                model="gemini-2.0-flash",
                contents=f"System: {sys_msg}\n\nUser: {prompt}\n\nOutput raw JSON.",
            )
        )
        return json.loads(_clean_json_text(response.text))

    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")


# In-process vector cache (shared across requests for the lifetime of the process)
_EMBEDDING_VECTOR_CACHE = {}


def _normalize_claim_text(text: str) -> str:
    # Conservative normalization: improves dedup/cache hits without materially
    # changing meaning.
    return " ".join(str(text).strip().split())


def _embedding_cache_key(model_name: str, normalized_text: str) -> str:
    text_hash = hashlib.sha256(normalized_text.encode("utf-8")).hexdigest()
    return f"embed:{model_name}:{text_hash}"


def _redis_get_client():
    # Prefer explicit embedding-cache URL, fall back to REDIS_URL (used by Celery).
    redis_url = os.getenv(
        "EMBEDDING_CACHE_REDIS_URL") or os.getenv("REDIS_URL")
    if not redis_url:
        return None
    try:
        import redis  # type: ignore

        return redis.Redis.from_url(redis_url, decode_responses=False)
    except Exception:
        return None


def _encode_vector_bytes(vec) -> bytes:
    """Encode a 1D float vector as: uint16 dim + float32 bytes."""
    import numpy as np

    arr = np.asarray(vec, dtype=np.float32)
    if arr.ndim != 1:
        arr = arr.reshape(-1)
    dim = int(arr.shape[0])
    return struct.pack("<H", dim) + arr.tobytes(order="C")


def _decode_vector_bytes(blob: bytes):
    import numpy as np

    if not blob or len(blob) < 2:
        return None
    (dim,) = struct.unpack("<H", blob[:2])
    payload = blob[2:]
    expected = dim * 4
    if len(payload) != expected:
        return None
    return np.frombuffer(payload, dtype=np.float32)


def _get_embedding_provider_and_model() -> tuple[str, str]:
    provider = os.getenv("LLM_PROVIDER", "openai").lower()
    default_model = (
        "gemini-embedding-001"
        if provider == "gemini"
        else "text-embedding-3-small"
    )
    model_name = os.getenv("EMBEDDING_MODEL_NAME", default_model)
    return provider, model_name


def embed_texts(texts: list[str], task_type: str = "SEMANTIC_SIMILARITY"):
    """
    Return embeddings for a list of texts using the configured provider.

    Uses the same in-process and Redis-backed cache as clustering so repeated
    experiment analysis calls do not keep paying for the same vectors.
    Raises RuntimeError when the configured embedding provider is unavailable.
    """
    import numpy as np

    if not texts:
        return np.empty((0, 0), dtype=np.float32)

    provider, model_name = _get_embedding_provider_and_model()
    normalized = [_normalize_claim_text(text) for text in texts]
    redis_client = _redis_get_client()

    cached_vectors = [None] * len(normalized)
    keys = []
    missing = []
    for i, txt in enumerate(normalized):
        key = _embedding_cache_key(model_name, txt)
        keys.append(key)
        vec = _EMBEDDING_VECTOR_CACHE.get(key)
        if vec is not None:
            cached_vectors[i] = vec
        else:
            missing.append(i)

    if redis_client and missing:
        try:
            blobs = redis_client.mget([keys[i] for i in missing])
            still_missing = []
            for k, blob in enumerate(blobs):
                original_i = missing[k]
                if not blob:
                    still_missing.append(original_i)
                    continue
                decoded = _decode_vector_bytes(blob)
                if decoded is None:
                    still_missing.append(original_i)
                    continue
                cached_vectors[original_i] = decoded
                _EMBEDDING_VECTOR_CACHE[keys[original_i]] = decoded
            missing = still_missing
        except Exception:
            pass

    if missing:
        batch_size = int(os.getenv("EMBEDDING_BATCH_SIZE", "64"))
        missing_texts = [normalized[i] for i in missing]
        all_vecs = []

        if provider == "gemini":
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                raise RuntimeError("GEMINI_API_KEY is not configured")
            from google import genai as _ggenai
            from google.genai import types as _gtypes

            _gclient = _ggenai.Client(api_key=api_key)
            for i in range(0, len(missing_texts), batch_size):
                result = _gclient.models.embed_content(
                    model=model_name,
                    contents=missing_texts[i:i + batch_size],
                    config=_gtypes.EmbedContentConfig(task_type=task_type),
                )
                all_vecs.append(
                    np.array([e.values for e in result.embeddings], dtype=np.float32)
                )
        else:
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise RuntimeError("OPENAI_API_KEY is not configured")
            import openai

            _oclient = openai.OpenAI(api_key=api_key)
            for i in range(0, len(missing_texts), batch_size):
                response = _oclient.embeddings.create(
                    model=model_name,
                    input=missing_texts[i:i + batch_size],
                )
                all_vecs.append(
                    np.array([e.embedding for e in response.data], dtype=np.float32)
                )

        new_vecs = np.vstack(all_vecs) if len(all_vecs) > 1 else all_vecs[0]
        for local_idx, original_i in enumerate(missing):
            vec = new_vecs[local_idx]
            cached_vectors[original_i] = vec
            _EMBEDDING_VECTOR_CACHE[keys[original_i]] = vec

        if redis_client:
            try:
                pipe = redis_client.pipeline()
                for original_i in missing:
                    pipe.set(
                        keys[original_i],
                        _encode_vector_bytes(cached_vectors[original_i]),
                    )
                pipe.execute()
            except Exception:
                pass

    return np.vstack([np.asarray(v, dtype=np.float32) for v in cached_vectors])


def cluster_claims(claims_texts: list[str]) -> list[int]:
    """
    Groups claims into thematic clusters using embeddings (OpenAI or Gemini,
    selected via LLM_PROVIDER) and K-Means. Returns a list of cluster IDs.
    """
    from sklearn.cluster import KMeans, MiniBatchKMeans
    import numpy as np

    if not claims_texts:
        return []

    provider = os.getenv("LLM_PROVIDER", "openai").lower()
    _default_model = "gemini-embedding-001" if provider == "gemini" else "text-embedding-3-small"
    model_name = os.getenv("EMBEDDING_MODEL_NAME", _default_model)

    # Determine number of clusters (Roadmap requires 4-8 themes)
    total_n = len(claims_texts)
    n_clusters = max(4, min(total_n // 4, 8))
    if total_n < 4:
        n_clusters = 1  # Too few to cluster meaningfully

    # Deduplicate claim texts for speed and cache hit rate
    t_dedup = time.perf_counter()
    normalized = [_normalize_claim_text(t) for t in claims_texts]
    unique_index = {}
    unique_texts = []
    inv_map = []
    counts = []
    for txt in normalized:
        if txt in unique_index:
            j = unique_index[txt]
            inv_map.append(j)
            counts[j] += 1
        else:
            j = len(unique_texts)
            unique_index[txt] = j
            unique_texts.append(txt)
            inv_map.append(j)
            counts.append(1)

    if len(unique_texts) <= 1:
        return [0] * len(claims_texts)

    redis_client = _redis_get_client()

    # L1 (in-process) + L2 (Redis) read-through cache
    cached_vectors = [None] * len(unique_texts)
    keys = []
    missing = []
    for i, txt in enumerate(unique_texts):
        key = _embedding_cache_key(model_name, txt)
        keys.append(key)
        vec = _EMBEDDING_VECTOR_CACHE.get(key)
        if vec is not None:
            cached_vectors[i] = vec
        else:
            missing.append(i)

    if redis_client and missing:
        try:
            blobs = redis_client.mget([keys[i] for i in missing])
            still_missing = []
            for k, blob in enumerate(blobs):
                original_i = missing[k]
                if not blob:
                    still_missing.append(original_i)
                    continue
                decoded = _decode_vector_bytes(blob)
                if decoded is None:
                    still_missing.append(original_i)
                    continue
                cached_vectors[original_i] = decoded
                _EMBEDDING_VECTOR_CACHE[keys[original_i]] = decoded
            missing = still_missing
        except Exception:
            pass

    # Compute missing vectors via embedding API (provider selected by LLM_PROVIDER)
    t_encode = time.perf_counter()
    if missing:
        batch_size = int(os.getenv("EMBEDDING_BATCH_SIZE", "64"))
        missing_texts = [unique_texts[i] for i in missing]
        all_vecs = []
        if provider == "gemini":
            from google import genai as _ggenai
            from google.genai import types as _gtypes
            _gclient = _ggenai.Client(api_key=os.getenv("GEMINI_API_KEY"))
            for i in range(0, len(missing_texts), batch_size):
                result = _gclient.models.embed_content(
                    model=model_name,
                    contents=missing_texts[i:i + batch_size],
                    config=_gtypes.EmbedContentConfig(task_type="CLUSTERING"),
                )
                all_vecs.append(
                    np.array([e.values for e in result.embeddings], dtype=np.float32))
        else:
            import openai
            _oclient = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            for i in range(0, len(missing_texts), batch_size):
                response = _oclient.embeddings.create(
                    model=model_name,
                    input=missing_texts[i:i + batch_size],
                )
                all_vecs.append(
                    np.array([e.embedding for e in response.data], dtype=np.float32))
        new_vecs = np.vstack(all_vecs) if len(all_vecs) > 1 else all_vecs[0]
        for local_idx, original_i in enumerate(missing):
            vec = new_vecs[local_idx]
            cached_vectors[original_i] = vec
            _EMBEDDING_VECTOR_CACHE[keys[original_i]] = vec
        if redis_client:
            try:
                pipe = redis_client.pipeline()
                for local_idx, original_i in enumerate(missing):
                    pipe.set(keys[original_i], _encode_vector_bytes(
                        cached_vectors[original_i]))
                pipe.execute()
            except Exception:
                pass

    unique_embeddings = np.vstack(
        [np.asarray(v, dtype=np.float32) for v in cached_vectors])

    if os.getenv("HYVE_TIMING", "1") == "1":
        print(
            "TIMING: cluster_claims dedup total=%d unique=%d (%.2fs), embed missing=%d (%.2fs)"
            % (
                len(claims_texts),
                len(unique_texts),
                time.perf_counter() - t_dedup,
                len(missing),
                time.perf_counter() - t_encode,
            )
        )

    if n_clusters == 1:
        return [0] * len(claims_texts)

    # Cluster using KMeans (sample-weighted on unique vectors)
    sample_weight = np.asarray(counts, dtype=np.float32)
    minibatch_threshold = int(os.getenv("KMEANS_MINIBATCH_THRESHOLD", "800"))
    if len(unique_texts) >= minibatch_threshold:
        kmeans = MiniBatchKMeans(
            n_clusters=n_clusters,
            random_state=42,
            batch_size=int(os.getenv("KMEANS_BATCH_SIZE", "1024")),
            n_init="auto",
        )
    else:
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init="auto")

    t_fit = time.perf_counter()
    kmeans.fit(unique_embeddings, sample_weight=sample_weight)
    if os.getenv("HYVE_TIMING", "1") == "1":
        print(
            f"TIMING: kmeans fit unique={len(unique_texts)} clusters={n_clusters} in {time.perf_counter() - t_fit:.2f}s"
        )

    unique_labels = kmeans.labels_.tolist()
    return [unique_labels[j] for j in inv_map]


def cluster_claims_llm(
    claims_texts: list[str],
    provider: str | None = None,
    product_name: str | None = None,
) -> tuple[list[int], dict[int, dict]]:
    """LLM-only clustering fallback.

    Returns:
      - labels: list[int] with one theme id per input claim_text
      - theme_info: {theme_id: {"name": str, "recommendation": str | None}}

    Strategy:
      1) Sample claims to define 4-6 themes.
      2) Assign all claims to those themes in chunks.
    """
    import json as _json

    if not claims_texts:
        return [], {}

    provider = (provider or os.getenv("LLM_PROVIDER", "openai")).lower()

    sample_size = int(os.getenv("LLM_CLUSTER_SAMPLE_SIZE", "60"))
    chunk_size = int(os.getenv("LLM_CLUSTER_CHUNK_SIZE", "50"))

    # Build sample for theme definition
    sample = []
    for i, t in enumerate(claims_texts[:sample_size]):
        sample.append({"i": i, "text": _normalize_claim_text(t)})

    product_hint = f" about '{product_name}'" if product_name else ""
    define_prompt = f"""You are clustering consumer review claims{product_hint} into themes.

Create 4 to 6 themes. One of the themes MAY be an 'Other' theme for outliers.

For each theme provide:
- id: integer starting at 0
- name: short 2-3 word label (Title Case)
- description: one sentence describing what belongs
- recommendation: one actionable recommendation (optional)

Sample claims (not exhaustive):
{_json.dumps(sample, ensure_ascii=False)}

Return ONLY valid JSON with this structure:
{{
  "themes": [
    {{"id": 0, "name": "Battery Life", "description": "...", "recommendation": "..."}}
  ]
}}
"""

    try:
        if provider == "openai":
            import openai

            client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            resp = client.chat.completions.create(
                model=os.getenv("LLM_CLUSTER_MODEL", "gpt-4o-mini"),
                messages=[
                    {"role": "system", "content": "You are a careful clustering assistant. Output JSON only."},
                    {"role": "user", "content": define_prompt},
                ],
                response_format={"type": "json_object"},
                timeout=30.0,
            )
            themes_obj = _json.loads(resp.choices[0].message.content)
        elif provider == "gemini":
            from google import genai as _ggenai
            _gclient = _ggenai.Client(api_key=os.getenv("GEMINI_API_KEY"))
            sys_msg = "You are a careful clustering assistant. Output JSON only."
            resp = _gclient.models.generate_content(
                model=os.getenv("LLM_CLUSTER_MODEL", "gemini-2.0-flash"),
                contents=f"System: {sys_msg}\n\nUser: {define_prompt}\n\nOutput raw JSON.",
            )
            themes_obj = _json.loads(_clean_json_text(resp.text))
        else:
            raise ValueError(f"Unsupported provider: {provider}")

        themes = themes_obj.get("themes", [])
        if not isinstance(themes, list) or not themes:
            raise ValueError("LLM did not return any themes")

        # Normalize and build theme_info map
        theme_info: dict[int, dict] = {}
        theme_defs = []
        for t in themes:
            try:
                tid = int(t.get("id"))
            except Exception:
                continue
            name = str(t.get("name", "Other")).strip() or "Other"
            desc = str(t.get("description", "")).strip()
            rec = t.get("recommendation")
            theme_info[tid] = {
                "name": name,
                "recommendation": rec if rec is None else str(rec),
                "description": desc,
            }
            theme_defs.append({"id": tid, "name": name, "description": desc})

        if not theme_info:
            raise ValueError("Could not parse themes")

        # Assignment in chunks
        labels = [-1] * len(claims_texts)
        theme_defs_sorted = sorted(theme_defs, key=lambda x: x["id"])
        t_assign_start = time.perf_counter()
        for start in range(0, len(claims_texts), chunk_size):
            chunk = []
            for i in range(start, min(start + chunk_size, len(claims_texts))):
                chunk.append(
                    {"i": i, "text": _normalize_claim_text(claims_texts[i])})

            assign_prompt = f"""Assign each claim to the single best theme id.

Themes:
{_json.dumps(theme_defs_sorted, ensure_ascii=False)}

Claims:
{_json.dumps(chunk, ensure_ascii=False)}

Return ONLY JSON:
{{"assignments": [{{"i": 0, "theme_id": 2}}]}}
"""

            if provider == "openai":
                import openai

                client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
                resp = client.chat.completions.create(
                    model=os.getenv("LLM_CLUSTER_MODEL", "gpt-4o-mini"),
                    messages=[
                        {"role": "system", "content": "You classify items into provided categories. Output JSON only."},
                        {"role": "user", "content": assign_prompt},
                    ],
                    response_format={"type": "json_object"},
                    timeout=30.0,
                )
                assign_obj = _json.loads(resp.choices[0].message.content)
            else:
                from google import genai as _ggenai
                _gclient = _ggenai.Client(api_key=os.getenv("GEMINI_API_KEY"))
                sys_msg = "You classify items into provided categories. Output JSON only."
                resp = _gclient.models.generate_content(
                    model=os.getenv("LLM_CLUSTER_MODEL", "gemini-2.0-flash"),
                    contents=f"System: {sys_msg}\n\nUser: {assign_prompt}\n\nOutput raw JSON.",
                )
                assign_obj = _json.loads(_clean_json_text(resp.text))

            assignments = assign_obj.get("assignments", [])
            for a in assignments:
                try:
                    i = int(a.get("i"))
                    tid = int(a.get("theme_id"))
                except Exception:
                    continue
                if 0 <= i < len(labels) and tid in theme_info:
                    labels[i] = tid

        # Fallback any unassigned to smallest theme id
        default_tid = sorted(theme_info.keys())[0]
        labels = [default_tid if x == -1 else x for x in labels]

        if os.getenv("HYVE_TIMING", "1") == "1":
            print(
                f"TIMING: cluster_claims_llm themes={len(theme_info)} assigned={len(claims_texts)} in {time.perf_counter() - t_assign_start:.2f}s"
            )

        return labels, {k: {"name": v.get("name"), "recommendation": v.get("recommendation")} for k, v in theme_info.items()}

    except Exception as e:
        print(f"WARNING: LLM clustering failed: {e}")
        return [0] * len(claims_texts), {}
