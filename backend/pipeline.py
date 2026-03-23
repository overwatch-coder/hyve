"""
Synchronous AI processing pipeline for direct invocation (no Celery/Redis required).
Used by the batch ingestion endpoint and for testing.
"""
import os
from sqlalchemy.orm import Session
import models
from ai_engine import (
    extract_claims_from_llm,
    cluster_claims,
    cluster_claims_llm,
    extract_claims_from_llm_async,
)
import asyncio
import time




def _clean_json_text(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1]
    if t.endswith("```"):
        t = t.rsplit("\n", 1)[0]
    return t.strip()

def predict_product_category(product_name: str) -> str:
    """Use AI to predict a product's category from its name."""
    import json
    import os
    
    provider = os.getenv("LLM_PROVIDER", "openai")
    prompt = f"Predict a 1-2 word category for a product named '{product_name}'. Example: 'Electronics', 'Footwear', 'Consumer Appliances'. Return ONLY the category name."
    
    try:
        if provider == "openai":
            import openai
            client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                timeout=5.0
            )
            return response.choices[0].message.content.strip().replace('"', '').replace("'", "")
        else:
            import google.generativeai as genai
            genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
            model = genai.GenerativeModel('gemini-1.5-flash')
            response = model.generate_content(prompt)
            return response.text.strip().replace('"', '').replace("'", "")
    except Exception as e:
        print(f"DEBUG: Category prediction failed: {e}")
        return "Uncategorized"

def process_review_sync(review_id: int, db: Session) -> dict:
    """
    Process a single review synchronously:
    1. Extract claims via LLM
    2. Save claims to DB
    3. Return results
    """
    review = db.query(models.Review).filter(models.Review.id == review_id).first()
    if not review:
        return {"status": "error", "message": "Review not found"}

    provider = os.getenv("LLM_PROVIDER", "openai")
    print(f"DEBUG: Starting LLM extraction for review {review_id} using {provider}")
    
    try:
        extraction_result = extract_claims_from_llm(review.original_text, provider)
        claims_data = extraction_result.get("claims", [])
    except Exception as e:
        return {"status": "error", "message": f"LLM extraction failed: {str(e)}"}

    if not claims_data:
        return {"status": "success", "review_id": review_id, "claims_extracted": 0}

    saved_claims = []
    for claim_dict in claims_data:
        # Robust key mapping for different LLM output styles
        claim_text = claim_dict.get("claim_text") or claim_dict.get("core_claim", "")
        evidence_text = claim_dict.get("evidence_text") or claim_dict.get("supporting_evidence", "")
        context_text = claim_dict.get("context_text") or claim_dict.get("context", "")
        
        if not claim_text:
            continue
            
        new_claim = models.Claim(
            review_id=review.id,
            claim_text=claim_text,
            evidence_text=evidence_text,
            context_text=context_text,
            sentiment_polarity=claim_dict.get("sentiment_polarity", "neutral"),
            severity=float(claim_dict.get("severity", 0.0)),
        )
        db.add(new_claim)
        db.flush()
        saved_claims.append(new_claim)
        
    print(f"DEBUG: Created {len(saved_claims)} claims for review {review_id}")

    db.commit()
    return {
        "status": "success",
        "review_id": review_id,
        "claims_extracted": len(saved_claims),
    }


async def _batch_extract_claims_async(reviews: list, provider: str):
    async def extract_and_format(review):
        try:
             result = await extract_claims_from_llm_async(review.original_text, provider)
             return (review.id, result.get("claims", []))
        except Exception as e:
             print(f"Error extracting claims for review {review.id}: {e}")
             return (review.id, [])
    
    results = []
    chunk_size = 20
    for i in range(0, len(reviews), chunk_size):
        chunk = reviews[i:i + chunk_size]
        tasks = [extract_and_format(r) for r in chunk]
        results.extend(await asyncio.gather(*tasks))
    return results

def batch_process_reviews(review_ids: list[int], db):
    import models
    from sqlalchemy.orm import Session
    reviews = db.query(models.Review).filter(models.Review.id.in_(review_ids)).all()
    if not reviews: return
     
    provider = os.getenv("LLM_PROVIDER", "openai")
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        results = loop.run_until_complete(_batch_extract_claims_async(reviews, provider))
    finally:
        loop.close()
        
    for review_id, claims_data in results:
        for claim_dict in claims_data:
            claim_text = claim_dict.get("claim_text") or claim_dict.get("core_claim", "")
            if not claim_text: continue
            
            new_claim = models.Claim(
                review_id=review_id,
                claim_text=claim_text,
                evidence_text=claim_dict.get("evidence_text") or claim_dict.get("supporting_evidence", ""),
                context_text=claim_dict.get("context_text") or claim_dict.get("context", ""),
                sentiment_polarity=claim_dict.get("sentiment_polarity", "neutral"),
                severity=float(claim_dict.get("severity", 0.0) or 0.0),
            )
            db.add(new_claim)
    
    db.commit()


def _generate_theme_names(cluster_texts_map: dict[int, list[str]]) -> dict[int, str]:
    """Use LLM to generate concise 2-3 word theme labels from clusters of claims."""
    import json
    if not cluster_texts_map:
        return {}

    provider = os.getenv("LLM_PROVIDER", "openai")
    clusters_summary = ""
    for cid, texts in cluster_texts_map.items():
        sample = texts[:5]  # Max 5 per cluster to keep prompt short
        clusters_summary += f"Cluster {cid}: {'; '.join(sample)}\n"

    prompt = f"""Given these clusters of consumer review claims, generate:
1. A short 2-3 word thematic label for each cluster (e.g., "Battery Life", "Build Quality").
2. One specific actionable recommendation for the product team based on the claims in that cluster.

{clusters_summary}

Return ONLY valid JSON like: {{"0": {{"name": "Battery Life", "recommendation": "Increase battery capacity..."}}, "1": {{"name": "Sound Quality", "recommendation": "Tune drivers for more bass..."}}}}"""

    try:
        if provider == "openai":
            import openai
            client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You generate concise thematic labels and actionable recommendations for consumer claims. Output JSON only."},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                timeout=15.0,
            )
            result = json.loads(response.choices[0].message.content)
            return {int(k): v for k, v in result.items()}
        elif provider == "gemini":
            import google.generativeai as genai
            genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
            model = genai.GenerativeModel("gemini-1.5-flash")
            sys_msg = "You generate concise thematic labels and actionable recommendations for consumer claims. Output JSON only."
            response = model.generate_content(f"System: {sys_msg}\n\nUser: {prompt}\n\nOutput raw JSON.")
            result = json.loads(_clean_json_text(response.text))
            return {int(k): v for k, v in result.items()}
    except Exception as e:
        print(f"DEBUG: Theme naming LLM call failed, using fallback: {e}")
        return {}

def _generate_summary_and_advices(product_name: str, theme_names: dict, cluster_texts_map: dict, focus: str = None) -> dict:
    """Use LLM to generate summaries and advice for both consumers and sellers. Optionally apply a custom user focus."""
    import json
    if not cluster_texts_map:
        return {"summary": "", "advices": [], "summary_seller": "", "advices_seller": []}

    provider = os.getenv("LLM_PROVIDER", "openai").lower()
    
    # Provide a concise summary of the data for the prompt
    data_summary = ""
    for cid, texts in cluster_texts_map.items():
        theme = theme_names.get(cid, f"Theme {cid}")
        sample = texts[:5]
        data_summary += f"{theme}: {'; '.join(sample)}\n"

    focus_prompt = f"\n\nUSER HAS REQUESTED A SPECIFIC FOCUS: '{focus}'. Please prioritize this focus in both perspectives." if focus else ""

    prompt = f"""Given these summarized consumer review claims about '{product_name}', generate TWO perspectives:

1. CONSUMER PERSPECTIVE:
   - summary: A short executive summary (1-2 sentences) of the overall sentiment and pros/cons for a buyer.
   - advices: Exactly 1 or 2 specific pieces of advice for a potential buyer.

2. SELLER/BUSINESS PERSPECTIVE:
   - summary: A strategic summary (1-2 sentences) of what the business owner should focus on next based on consumer pain points and strengths.
   - advices: Exactly 1 or 2 actionable business strategies or improvements to increase customer satisfaction.

{focus_prompt}

{data_summary}

Return ONLY valid JSON with keys:
"summary" (string), "advices" (list of strings), "summary_seller" (string), "advices_seller" (list of strings).
"""

    try:
        if provider == "openai":
            import openai
            client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a product strategic analyst. Output JSON only."},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                timeout=20.0,
            )
            result = json.loads(response.choices[0].message.content)
            return {
                "summary": result.get("summary", ""),
                "advices": result.get("advices", []),
                "summary_seller": result.get("summary_seller", ""),
                "advices_seller": result.get("advices_seller", [])
            }
        else:
            import google.generativeai as genai
            genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
            model = genai.GenerativeModel('gemini-1.5-flash')
            response = model.generate_content(
                f"System: You are a product strategic analyst. Output JSON only.\n\nUser: {prompt}"
            )
            text = response.text.strip()
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            # In case Gemini doesn't use blocks
            elif "{" in text:
                text = text[text.find("{"):text.rfind("}")+1]
                
            result = json.loads(text)
            return {
                "summary": result.get("summary", ""),
                "advices": result.get("advices", []),
                "summary_seller": result.get("summary_seller", ""),
                "advices_seller": result.get("advices_seller", [])
            }
    except Exception as e:
        print(f"DEBUG: Summary/advice LLM call failed: {e}")
        return {"summary": "", "advices": [], "summary_seller": "", "advices_seller": []}


def deduplicate_claims_ai(claims_list: list, theme_name: str) -> list[dict]:
    """
    Uses LLM to group semantically similar claims within a theme.
    Returns a list of dicts: {representative_text, sentiment, severity, mention_count, original_ids}
    Claims with different sentiments are always treated as distinct.
    """
    import json as _json

    if len(claims_list) <= 1:
        return [{
            "representative_text": c.claim_text,
            "sentiment": c.sentiment_polarity,
            "severity": c.severity,
            "mention_count": 1,
            "original_ids": [c.id],
        } for c in claims_list]

    claims_data = []
    for i, c in enumerate(claims_list):
        claims_data.append({
            "id": i,
            "text": c.claim_text,
            "sentiment": c.sentiment_polarity or "neutral",
            "severity": float(c.severity or 0),
        })

    prompt = f"""You are analyzing consumer review claims under the theme "{theme_name}".
Group the following claims that express the same core idea using similar or different words.

RULES:
- Claims with DIFFERENT sentiments (positive vs negative) must NEVER be grouped together.
- Claims discussing the same topic but with completely different contexts should stay separate.
  Example: "case is compact and portable" and "case uses premium metal" = SEPARATE
  Example: "case is beautiful" and "case is well-designed" = SAME GROUP
- For each group, write ONE clear representative claim that captures the shared meaning.
- Return the severity as the average severity of the grouped claims.

Claims:
{_json.dumps(claims_data, indent=2)}

Return JSON with this exact structure:
{{
  "groups": [
    {{
      "representative_text": "Clear single claim summarizing the group",
      "sentiment": "positive|negative|neutral",
      "severity": 0.7,
      "member_ids": [0, 2, 5]
    }}
  ]
}}"""

    provider = os.getenv("LLM_PROVIDER", "openai")
    try:
        if provider == "openai":
            import openai
            client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a data deduplication expert. Output valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                timeout=30.0
            )
            result = _json.loads(response.choices[0].message.content)
        elif provider == "gemini":
            import google.generativeai as genai
            genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
            model = genai.GenerativeModel('gemini-1.5-pro')
            sys_msg = "You are a data deduplication expert. Output valid JSON only."
            response = model.generate_content(f"System: {sys_msg}\n\nUser: {prompt}\n\nOutput raw JSON.")
            result = _json.loads(_clean_json_text(response.text))
        else:
            raise ValueError(f"Unsupported provider: {provider}")

        groups = result.get("groups", [])
        deduped = []
        for group in groups:
            member_ids = group.get("member_ids", [])
            original_claim_ids = [claims_list[mid].id for mid in member_ids if mid < len(claims_list)]
            deduped.append({
                "representative_text": group.get("representative_text", ""),
                "sentiment": group.get("sentiment", "neutral"),
                "severity": float(group.get("severity", 0.5)),
                "mention_count": len(member_ids),
                "original_ids": original_claim_ids,
            })
        return deduped

    except Exception as e:
        print(f"WARNING: Claim dedup failed for theme '{theme_name}': {e}")
        # Fallback: return each claim as-is with mention_count=1
        return [{
            "representative_text": c.claim_text,
            "sentiment": c.sentiment_polarity,
            "severity": c.severity,
            "mention_count": 1,
            "original_ids": [c.id],
        } for c in claims_list]



async def deduplicate_claims_ai_async(claims_list: list, theme_name: str) -> list[dict]:
    import json as _json

    if len(claims_list) <= 1:
        return [{"representative_text": c.claim_text, "sentiment": c.sentiment_polarity, "severity": c.severity, "mention_count": 1, "original_ids": [c.id]} for c in claims_list]

    claims_data = [{"id": i, "text": c.claim_text, "sentiment": c.sentiment_polarity or "neutral", "severity": float(c.severity or 0)} for i, c in enumerate(claims_list)]

    prompt = f"""You are analyzing consumer review claims under the theme "{theme_name}".
Group the following claims that express the same core idea using similar or different words.

RULES:
- Claims with DIFFERENT sentiments (positive vs negative) must NEVER be grouped together.
- Claims discussing the same topic but with completely different contexts should stay separate.
- For each group, write ONE clear representative claim that captures the shared meaning.
- Return the severity as the average severity of the grouped claims.

Claims:
{_json.dumps(claims_data, indent=2)}

Return JSON with this exact structure:
{{
  "groups": [
    {{
      "representative_text": "Clear single claim summarizing the group",
      "sentiment": "positive|negative|neutral",
      "severity": 0.7,
      "member_ids": [0, 2, 5]
    }}
  ]
}}"""

    provider = os.getenv("LLM_PROVIDER", "openai")
    try:
        if provider == "openai":
            import openai
            client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a data deduplication expert. Output valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                timeout=30.0
            )
            result = _json.loads(response.choices[0].message.content)
        elif provider == "gemini":
            import google.generativeai as genai
            import asyncio
            genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
            model = genai.GenerativeModel('gemini-1.5-pro')
            loop = asyncio.get_event_loop()
            sys_msg = "You are a data deduplication expert. Output valid JSON only."
            response = await loop.run_in_executor(None, lambda: model.generate_content(f"System: {sys_msg}\n\nUser: {prompt}\n\nOutput raw JSON."))
            result = _json.loads(_clean_json_text(response.text))
        else:
            raise ValueError(f"Unsupported provider: {provider}")

        groups = result.get("groups", [])
        deduped = []
        for group in groups:
            member_ids = group.get("member_ids", [])
            original_claim_ids = [claims_list[mid].id for mid in member_ids if mid < len(claims_list)]
            deduped.append({
                "representative_text": group.get("representative_text", ""),
                "sentiment": group.get("sentiment", "neutral"),
                "severity": float(group.get("severity", 0.5)),
                "mention_count": len(member_ids),
                "original_ids": original_claim_ids,
            })
        return deduped

    except Exception as e:
        print(f"WARNING: Claim dedup failed for theme '{theme_name}': {e}")
        return [{"representative_text": c.claim_text, "sentiment": c.sentiment_polarity, "severity": c.severity, "mention_count": 1, "original_ids": [c.id]} for c in claims_list]

def deduplicate_themes_parallel(theme_mapping: dict, claims: list):
    async def run_all():
        tasks = []
        theme_keys = []
        for cid, theme in theme_mapping.items():
            theme_claims = [c for c in claims if c.theme_id == theme.id]
            if theme_claims:
                tasks.append(deduplicate_claims_ai_async(theme_claims, theme.name))
                theme_keys.append((cid, theme))
        
        results = await asyncio.gather(*tasks)
        return list(zip(theme_keys, results))
        
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(run_all())
    finally:
        loop.close()


def deduplicate_themes_single_call(theme_mapping: dict, claims: list):
    """Deduplicate claims within each theme using a single LLM call.

    Returns the same structure as `deduplicate_themes_parallel`:
      [((cid, theme_obj), deduped_groups), ...]

    Raises on any failure so caller can fall back.
    """
    import json as _json

    provider = os.getenv("LLM_PROVIDER", "openai").lower()
    if provider != "openai":
        raise ValueError("single-call dedup currently only supports openai provider")

    # Build payload grouped by theme
    themes_payload = []
    theme_claims_by_cid = {}
    total_claims = 0

    for cid, theme in theme_mapping.items():
        theme_claims = [c for c in claims if c.theme_id == theme.id]
        if not theme_claims:
            continue
        theme_claims_by_cid[int(cid)] = theme_claims
        total_claims += len(theme_claims)

        claims_data = []
        for i, c in enumerate(theme_claims):
            claims_data.append(
                {
                    "local_id": i,
                    "claim_db_id": int(c.id),
                    "text": c.claim_text,
                    "sentiment": (c.sentiment_polarity or "neutral"),
                    "severity": float(c.severity or 0),
                }
            )

        themes_payload.append(
            {
                "cid": int(cid),
                "theme_name": theme.name,
                "claims": claims_data,
            }
        )

    if not themes_payload:
        return []

    prompt = f"""You are deduplicating consumer review claims within multiple themes.

For EACH theme, group claims that express the same core idea.

RULES (must follow strictly):
- Claims with DIFFERENT sentiments (positive vs negative vs neutral) must NEVER be grouped together.
- Claims discussing the same topic but with completely different contexts should stay separate.
- For each group, write ONE clear representative claim that captures the shared meaning.
- Return the severity as the average severity of the grouped claims.

Input themes:
{_json.dumps(themes_payload, ensure_ascii=False)}

Return ONLY valid JSON with this exact structure:
{{
  \"themes\": [
    {{
      \"cid\": 0,
      \"groups\": [
        {{
          \"representative_text\": \"...\",
          \"sentiment\": \"positive|negative|neutral\",
          \"severity\": 0.7,
          \"member_local_ids\": [0, 2, 5]
        }}
      ]
    }}
  ]
}}
"""

    t0 = time.perf_counter()
    import openai

    client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = client.chat.completions.create(
        model=os.getenv("AI_DEDUP_MODEL", "gpt-4o-mini"),
        messages=[
            {"role": "system", "content": "You are a data deduplication expert. Output valid JSON only."},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        timeout=float(os.getenv("AI_DEDUP_TIMEOUT", "60")),
    )

    try:
        result = _json.loads(response.choices[0].message.content)
    except Exception as e:
        raise ValueError(f"single-call dedup: invalid JSON: {e}")

    themes_out = result.get("themes")
    if not isinstance(themes_out, list) or not themes_out:
        raise ValueError("single-call dedup: missing themes")

    # Convert response to existing deduped_groups format
    results = []
    for theme_obj in themes_out:
        try:
            cid = int(theme_obj.get("cid"))
        except Exception:
            continue
        if cid not in theme_mapping or cid not in theme_claims_by_cid:
            continue

        theme_claims = theme_claims_by_cid[cid]
        groups = theme_obj.get("groups", [])
        if not isinstance(groups, list):
            raise ValueError(f"single-call dedup: invalid groups for cid={cid}")

        deduped_groups = []
        for g in groups:
            member_local_ids = g.get("member_local_ids", [])
            if not isinstance(member_local_ids, list) or not member_local_ids:
                continue

            original_ids = []
            for mid in member_local_ids:
                try:
                    mi = int(mid)
                except Exception:
                    continue
                if 0 <= mi < len(theme_claims):
                    original_ids.append(int(theme_claims[mi].id))

            if not original_ids:
                continue

            deduped_groups.append(
                {
                    "representative_text": str(g.get("representative_text", "")),
                    "sentiment": str(g.get("sentiment", "neutral")),
                    "severity": float(g.get("severity", 0.5)),
                    "mention_count": len(original_ids),
                    "original_ids": original_ids,
                }
            )

        results.append(((cid, theme_mapping[cid]), deduped_groups))

    if not results:
        raise ValueError("single-call dedup: produced no results")

    if os.getenv("HYVE_TIMING", "1") == "1":
        print(
            f"TIMING: AI deduplication single-call themes={len(results)} claims={total_claims} in {time.perf_counter() - t0:.2f}s"
        )

    return results


def cluster_product_claims(product_id: int, db: Session) -> dict:
    """
    Re-cluster all claims for a product into themes.
    Deletes old themes and creates new ones from clustering.
    Then deduplicates claims within each theme using AI.
    """
    t0 = time.perf_counter()

    # Get all claims for this product through reviews
    claims = (
        db.query(models.Claim)
        .join(models.Review, models.Claim.review_id == models.Review.id)
        .filter(models.Review.product_id == product_id)
        .all()
    )

    print(
        f"TIMING: cluster_product_claims(product_id={product_id}) fetched claims={len(claims)} in {time.perf_counter() - t0:.2f}s"
    )

    if not claims:
        return {"status": "success", "themes_created": 0}

    # Delete old themes for this product
    # Detach claims before deleting themes to avoid foreign key violation
    db.query(models.Claim).filter(
        models.Claim.review_id.in_(
            db.query(models.Review.id).filter(models.Review.product_id == product_id)
        )
    ).update({models.Claim.theme_id: None}, synchronize_session=False)

    db.query(models.Theme).filter(models.Theme.product_id == product_id).delete(synchronize_session=False)
    db.flush()

    # Clear theme_id on all claims first
    for claim in claims:
        claim.theme_id = None
    db.flush()

    # Cluster
    t_cluster_start = time.perf_counter()
    claims_for_clustering = [c for c in claims if (c.claim_text and str(c.claim_text).strip())]
    claims_texts = [c.claim_text for c in claims_for_clustering]
    print(
        f"TIMING: clustering input size={len(claims_texts)} (non-empty) out of {len(claims)} total claims"
    )

    clustering_backend = os.getenv("CLUSTERING_BACKEND", "embedding").lower()
    clustering_fallback = os.getenv("CLUSTERING_FALLBACK", "").lower()
    theme_names = {}

    try:
        if clustering_backend == "llm":
            cluster_labels, theme_names = cluster_claims_llm(
                claims_texts,
                provider=os.getenv("LLM_PROVIDER", "openai"),
            )
        else:
            cluster_labels = cluster_claims(claims_texts)
    except Exception as e:
        print(f"WARNING: clustering backend '{clustering_backend}' failed: {e}")
        if clustering_fallback == "llm":
            clustering_backend = "llm"
            cluster_labels, theme_names = cluster_claims_llm(
                claims_texts,
                provider=os.getenv("LLM_PROVIDER", "openai"),
            )
        else:
            raise

    print(
        f"TIMING: clustering backend={clustering_backend} produced labels={len(cluster_labels)} in {time.perf_counter() - t_cluster_start:.2f}s"
    )

    # Build theme names using LLM or fallback heuristic
    unique_clusters = sorted(set(cluster_labels))
    theme_mapping = {}

    # Collect all cluster claim texts for batch LLM naming
    cluster_texts_map = {}
    for cid in unique_clusters:
        cluster_texts_map[cid] = [
            claims_for_clustering[i].claim_text
            for i, label in enumerate(cluster_labels)
            if label == cid
        ]

    # Try LLM theme naming (unless LLM clustering already returned names)
    if not theme_names:
        t_naming_start = time.perf_counter()
        theme_names = _generate_theme_names(cluster_texts_map)
        print(
            f"TIMING: theme naming clusters={len(unique_clusters)} in {time.perf_counter() - t_naming_start:.2f}s"
        )
    else:
        print(f"TIMING: theme naming skipped (provided by LLM clustering)")

    for cid in unique_clusters:
        cluster_claims_list = [
            claims_for_clustering[i]
            for i, label in enumerate(cluster_labels)
            if label == cid
        ]

        # Use LLM name/recommendation if available, else fallback
        theme_name = "Other"
        recommendation = None
        
        if cid in theme_names:
            theme_info = theme_names[cid]
            if isinstance(theme_info, dict):
                theme_name = theme_info.get("name", "Other")
                recommendation = theme_info.get("recommendation")
            else:
                # Fallback if LLM returned just a string (though prompt asks for dict)
                theme_name = str(theme_info)

        if not theme_name or theme_name == "Other":
            representative = min(cluster_claims_list, key=lambda c: len(c.claim_text))
            name_words = representative.claim_text.split()[:6]
            theme_name = " ".join(name_words)
            if len(name_words) == 6:
                theme_name += "..."

        positive_count = sum(
            1 for c in cluster_claims_list if c.sentiment_polarity == "positive"
        )
        total = len(cluster_claims_list)

        theme = models.Theme(
            product_id=product_id,
            name=theme_name,
            claim_count=total,
            positive_ratio=round(positive_count / total, 2) if total > 0 else 0.0,
            recommendation=recommendation
        )
        db.add(theme)
        db.flush()
        theme_mapping[cid] = theme

    # Assign theme_id to claims
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if product:
        product.processing_step = "Harmonizing Patterns & Thematic Clusters"
        db.commit()

    for claim, cluster_id in zip(claims_for_clustering, cluster_labels):
        claim.theme_id = theme_mapping[cluster_id].id

    # ── AI Deduplication: group similar claims within each theme ──
    print(f"DEBUG: Starting AI deduplication for product {product_id}...")
    t_dedup_start = time.perf_counter()
    results = None
    if os.getenv("AI_DEDUP_SINGLE_CALL", "1") == "1":
        try:
            results = deduplicate_themes_single_call(theme_mapping, claims)
        except Exception as e:
            print(f"WARNING: single-call AI dedup failed, falling back to per-theme: {e}")

    if results is None:
        results = deduplicate_themes_parallel(theme_mapping, claims)
    print(
        f"TIMING: AI deduplication gather in {time.perf_counter() - t_dedup_start:.2f}s"
    )
    for (cid, theme), deduped_groups in results:
        theme_claims = [c for c in claims if c.theme_id == theme.id]
        if not theme_claims:
            continue

        # Delete old individual claims, replace with deduplicated representatives
        old_claim_ids = [c.id for c in theme_claims]

        # For each group, keep one claim as representative and delete the rest
        kept_claim_ids = set()
        for group in deduped_groups:
            if not group["original_ids"]:
                continue
            # Keep the first original claim as the representative
            representative_id = group["original_ids"][0]
            kept_claim_ids.add(representative_id)

            # Update the representative claim with deduped data
            rep_claim = db.query(models.Claim).filter(models.Claim.id == representative_id).first()
            if rep_claim:
                rep_claim.claim_text = group["representative_text"]
                rep_claim.sentiment_polarity = group["sentiment"]
                rep_claim.severity = group["severity"]
                rep_claim.mention_count = group["mention_count"]

            # Delete the other claims in this group
            for oid in group["original_ids"][1:]:
                dup_claim = db.query(models.Claim).filter(models.Claim.id == oid).first()
                if dup_claim:
                    db.delete(dup_claim)

        # Update theme claim count to reflect deduped count
        theme.claim_count = len(deduped_groups)

    db.flush()

    # ── Recalculate per-theme positive_ratio AFTER deduplication ──
    # Uses severity-weighted formula: weight positive claims more if they have higher severity/mention_count
    for cid, theme in theme_mapping.items():
        theme_claims = db.query(models.Claim).filter(models.Claim.theme_id == theme.id).all()
        if not theme_claims:
            continue

        total_weight = sum(max(c.mention_count, 1) * max(c.severity, 0.1) for c in theme_claims)
        positive_weight = sum(
            max(c.mention_count, 1) * max(c.severity, 0.1)
            for c in theme_claims if c.sentiment_polarity == "positive"
        )
        theme.claim_count = len(theme_claims)
        theme.positive_ratio = round(positive_weight / total_weight, 3) if total_weight > 0 else 0.0

    db.flush()

    # Recalculate product-level overall_sentiment_score
    # Formula: weighted average of per-theme positive_ratio, weighted by claim_count
    # Penalty: themes with positive_ratio < 0.3 drag score down more aggressively
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if product:
        all_themes = list(theme_mapping.values())
        total_claims_weight = sum(t.claim_count for t in all_themes)
        if total_claims_weight > 0:
            weighted_pos = sum(t.positive_ratio * t.claim_count for t in all_themes)
            raw_score = weighted_pos / total_claims_weight
            # Apply asymmetric penalty: depress score more for highly negative themes
            severe_neg_penalty = sum(
                (0.4 - t.positive_ratio) * t.claim_count
                for t in all_themes if t.positive_ratio < 0.4
            ) / total_claims_weight
            adjusted_score = max(0.0, min(1.0, raw_score - severe_neg_penalty * 0.3))
            product.overall_sentiment_score = round(adjusted_score, 3)

        import json
        
        summary_data = _generate_summary_and_advices(product.name, theme_names, cluster_texts_map)
        product.summary = summary_data.get("summary", "")
        product.advices = json.dumps(summary_data.get("advices", []))
        product.summary_seller = summary_data.get("summary_seller", "")
        product.advices_seller = json.dumps(summary_data.get("advices_seller", []))

    db.commit()

    print(f"DEBUG: Created {len(unique_clusters)} themes for product {product_id} (with AI dedup)")

    return {"status": "success", "themes_created": len(unique_clusters)}

def extract_and_update_summary(product_id: int, db: Session, focus: str = None):
    """Regenerates the summary and advice for a product, optionally with a custom focus."""
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        return None

    themes = db.query(models.Theme).filter(models.Theme.product_id == product_id).all()
    
    cluster_texts_map = {}
    theme_names = {}
    for theme in themes:
        theme_names[theme.id] = theme.name
        claims = db.query(models.Claim).filter(models.Claim.theme_id == theme.id).all()
        cluster_texts_map[theme.id] = [c.claim_text for c in claims]

    result = _generate_summary_and_advices(product.name, theme_names, cluster_texts_map, focus)
    import json
    if result.get("summary"):
        product.summary = result["summary"]
    if result.get("advices") is not None:
        product.advices = json.dumps(result["advices"])
    if result.get("summary_seller"):
        product.summary_seller = result["summary_seller"]
    if result.get("advices_seller") is not None:
        product.advices_seller = json.dumps(result["advices_seller"])
        
    db.commit()
    db.refresh(product)
    return product

def detect_csv_columns(columns: list[str], sample_data: list[dict]) -> dict:
    """Uses LLM to confidently identify which column contains review text, ratings, and product names."""
    import json
    import os
    
    provider = os.getenv("LLM_PROVIDER", "openai")
    
    sample_str = json.dumps(sample_data, indent=2, default=str)
    prompt = f"""
I have a dataset of product reviews with the following columns:
{columns}

Here are the first 5 rows:
{sample_str}

Analyze this data and determine:
1. Which column most likely contains the actual review text? (This is required)
2. Which column most likely contains the numeric star rating? (This is optional, return null if none is apparent)
3. Which column most likely contains the name of the product? (Useful if the CSV contains reviews for multiple different products. return null if it seems all reviews are for a single product or no name is found).
4. Which column most likely contains the date or timestamp of the review? (This is optional, return null if none is found).

Return ONLY valid JSON in this exact format, with no markdown formatting:
{{
  "review_column": "exact_column_name_here",
  "rating_column": "exact_column_name_here_or_null",
  "product_column": "exact_column_name_here_or_null",
  "date_column": "exact_column_name_here_or_null"
}}
"""
    try:
        if provider == "openai":
            import openai
            client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You map dataset columns for consumer reviews. Output JSON only."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                timeout=15.0,
            )
            return json.loads(response.choices[0].message.content)
            
        elif provider == "gemini":
            import google.generativeai as genai
            genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
            model = genai.GenerativeModel("gemini-1.5-flash")
            sys_msg = "You map dataset columns for consumer reviews. Output JSON only."
            response = model.generate_content(f"System: {sys_msg}\n\nUser: {prompt}\n\nOutput raw JSON without markdown.")
            return json.loads(_clean_json_text(response.text))
            
    except Exception as e:
        print(f"DEBUG: CSV column detection LLM call failed: {e}")
        # Fallback to naive heuristics
        lower_cols = [c.lower() for c in columns]
        review_col = None
        rating_col = None
        product_col = None
        date_col = None
        for orig, lower in zip(columns, lower_cols):
            if any(k in lower for k in ["review", "content", "text", "body"]):
                review_col = orig
            if any(k in lower for k in ["rating", "star", "score"]):
                rating_col = orig
            if any(k in lower for k in ["product", "brand", "item", "title"]):
                product_col = orig
            if any(k in lower for k in ["date", "time", "posted", "timestamp"]):
                date_col = orig
        return {
            "review_column": review_col, 
            "rating_column": rating_col, 
            "product_column": product_col,
            "date_column": date_col
        }
        
    return {"review_column": None, "rating_column": None, "product_column": None, "date_column": None}

def run_url_ingestion_background(product_id: int, url: str):
    """
    Background worker for URL ingestion. Scrapes, extracts reviews using AI, 
    processes claims, and marks product as ready.
    """
    from database import SessionLocal
    from main import batch_ingest_reviews, BatchIngestRequest, BatchReviewItem
    from urllib.parse import urlparse
    import time

    db = SessionLocal()
    try:
        product = db.query(models.Product).filter(models.Product.id == product_id).first()
        if not product:
            return

        print(f"DEBUG: Background ingestion started for product {product_id} from {url}")
        
        product.processing_step = "Scraping Target URL"
        db.commit()
        
        # Scrape and AI filter
        result = scrape_reviews_from_url(url)
        extracted_texts = result["reviews"]
        scraped_name = result["product_name"]

        # Rename product if it was a generic placeholder
        if product.name == "Scraping in progress...":
            product.name = scraped_name
            db.commit()

        if not extracted_texts:
            print("DEBUG: No valid reviews found by AI scraper.")
            product.status = "ready" # Marks as done, but empty
            db.commit()
            return
            
        domain = urlparse(url).netloc
        if domain.startswith("www."):
            domain = domain[4:]

        product.processing_step = "Archiving Discovery"
        db.commit()

        reviews_payload = [
            BatchReviewItem(text=text, source=domain) 
            for text in extracted_texts
        ]
        
        # Insert reviews into DB with the new 'source_url' field directly 
        for payload in reviews_payload:
             review = models.Review(
                 product_id=product_id,
                 original_text=payload.text,
                 source=payload.source,
                 source_url=url, # store the exact source url
                 star_rating=payload.star_rating,
             )
             db.add(review)
             
        db.commit()
        
        # Now cluster the claims the usual way, since reviews are already saved
        from pipeline import process_review_sync, cluster_product_claims
        
        reviews = db.query(models.Review).filter(
            models.Review.product_id == product_id, 
            models.Review.source_url == url
        ).all()
        
        product.processing_step = f"Analyzing Sentiment (1/{len(reviews)})"
        db.commit()

        for idx, r in enumerate(reviews):
            if idx % 5 == 0:
                product.processing_step = f"Analyzing Sentiment ({idx+1}/{len(reviews)})"
                db.commit()
            process_review_sync(r.id, db)
            
        # Recluster
        product.processing_step = "Harmonizing Patterns"
        db.commit()
        cluster_product_claims(product_id, db)
        
        # Mark as done
        product.processing_step = "Analysis Complete"
        product.status = "ready"
        db.commit()
        print(f"DEBUG: Background ingestion complete for product {product_id}")

    except Exception as e:
        print(f"DEBUG: Background ingestion failed: {e}")
        # Make sure to release it from processing state so UI doesn't hang forever
        if 'product' in locals() and product:
            product.status = "error" 
            db.commit()
    finally:
        db.close()

def run_csv_ingestion_background(product_ids: list[int], csv_data_json: str, mapping: dict):
    """
    Background worker for CSV ingestion.
    - Limits reviews to 1000 per product.
    - Sorts by date if mapping['date_column'] exists.
    - Processes each review.
    - Updates status to 'ready'.
    """
    from database import SessionLocal
    import pandas as pd
    import json
    import io
    
    db = SessionLocal()
    try:
        df = pd.read_json(io.StringIO(csv_data_json))
        review_col = mapping.get("review_column")
        rating_col = mapping.get("rating_column")
        product_col = mapping.get("product_column")
        date_col = mapping.get("date_column")

        if date_col and date_col in df.columns:
            try:
                df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
                df = df.sort_values(by=date_col, ascending=False)
            except:
                pass

        # 2. Iterate through products
        for pid in product_ids:
            product = db.query(models.Product).filter(models.Product.id == pid).first()
            if not product: continue
            
            product.processing_step = "Grouping Product Reviews"
            db.commit()

            # Filter rows for this product
            if product_col and product_col in df.columns:
                p_df = df[df[product_col].astype(str).str.strip() == product.name]
            else:
                p_df = df
            
            # 3. Limit to 1000 reviews
            p_df = p_df.head(1000)
            
            # 4. Ingest reviews
            product.processing_step = f"Distilling Insights (1/{len(p_df)})"
            db.commit()
            
            review_ids_to_process = []
            for idx, (_, row) in enumerate(p_df.iterrows()):
                if idx % 100 == 0:
                    product.processing_step = f"Preparing Reviews ({idx+1}/{len(p_df)})"
                    db.commit()

                text = str(row[review_col]).strip()
                if len(text) < 5: continue
                
                rating = None
                if rating_col and rating_col in df.columns:
                    try: rating = float(row[rating_col])
                    except: pass
                
                review = models.Review(
                    product_id=product.id,
                    original_text=text,
                    source="csv_upload",
                    star_rating=rating
                )
                db.add(review)
                db.flush()
                review_ids_to_process.append(review.id)
                
            db.commit()
            
            # Batch process AI extractions
            if review_ids_to_process:
                product.processing_step = f"Distilling Insights for {len(review_ids_to_process)} reviews..."
                db.commit()
                batch_process_reviews(review_ids_to_process, db)
            
            # 5. Finalize product
            product.processing_step = "Harmonizing Patterns"
            db.commit()
            cluster_product_claims(product.id, db)
            
            product.processing_step = "Analysis Complete"
            product.status = "ready"
            db.commit()
            print(f"DEBUG: Background CSV ingestion complete for product {product.id}")

    except Exception as e:
        print(f"DEBUG: Background CSV ingestion failed: {e}")
        # Error handling for products
        for pid in product_ids:
            p = db.query(models.Product).filter(models.Product.id == pid).first()
            if p: 
                p.status = "error"
                p.processing_step = f"Error: {str(e)}"
        db.commit()
    finally:
        db.close()


def prune_html_and_extract_ai_reviews(html_content: str, max_chars: int = 15000) -> dict:
    import json
    import os
    from bs4 import BeautifulSoup
    
    # 1. Clean HTML
    soup = BeautifulSoup(html_content, "html.parser")
    product_name = "Unknown Product"
    title_tag = soup.find("h1") or soup.find("title")
    if title_tag:
        product_name = title_tag.get_text(strip=True)
        
    for script in soup(["script", "style", "nav", "footer", "header", "aside", "svg", "button", "iframe"]):
        script.extract()
        
    raw_text = soup.get_text(separator='\n', strip=True)
    
    # Prune giant texts to fit LLM window, prioritizing end of doc where reviews usually are
    if len(raw_text) > max_chars:
        # Keep first 2k chars (title/desc) and last (max_chars-2k) chars (reviews)
        raw_text = raw_text[:2000] + "\n...[TRUNCATED]...\n" + raw_text[-(max_chars-2000):]
        
    provider = os.getenv("LLM_PROVIDER", "openai")
    prompt = f"""
You are an AI data extraction agent. I am providing you with the raw text content scraped from a product page.
Your job is to identify and extract ONLY the genuine consumer reviews from this text.

RULES:
1. Ignore product descriptions, marketing copy, shipping details, or technical specs.
2. Ignore navigation links, copyright notices, and "sign in" prompts.
3. Extract each distinct user review as a separate string.
4. Try to determine the official product name if it's clear.
5. If you cannot find any text that looks like a consumer review, return an empty list.

RAW SCRAPED TEXT:
{raw_text}

Return ONLY valid JSON in exactly this format without markdown wrappers.
{{
  "product_name": "Name of the product",
  "reviews": [
    "Review text 1...",
    "Review text 2..."
  ]
}}
"""
    try:
        if provider == "openai" and os.getenv("OPENAI_API_KEY"):
            import openai
            client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You extract consumer reviews from raw website text. Output JSON only."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                timeout=25.0,
            )
            data = json.loads(response.choices[0].message.content)
            return {"product_name": data.get("product_name", product_name), "reviews": data.get("reviews", [])}
        else:
            # Fallback to Gemini
            import google.generativeai as genai
            genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
            model = genai.GenerativeModel('gemini-1.5-flash', generation_config={"response_mime_type": "application/json"})
            response = model.generate_content(
                f"System: You extract consumer reviews from raw website text. Output JSON only.\n\nUser: {prompt}"
            )
            data = json.loads(response.text)
            return {"product_name": data.get("product_name", product_name), "reviews": data.get("reviews", [])}
    except Exception as e:
        print(f"DEBUG: AI Review Extraction failed: {e}")
        return {"product_name": product_name, "reviews": []}

    return {"product_name": product_name, "reviews": []}


def scrape_reviews_from_url(url: str) -> dict:
    """
    Crawls a product URL, waits for dynamic content to render, and extracts
    consumer reviews and product name using AI.
    Returns: {"product_name": str, "reviews": list[str]}
    """
    from playwright.sync_api import sync_playwright
    import time
    
    html_content = ""
    print(f"DEBUG: Starting Playwright crawl for {url}")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Randomize user agent to avoid basic blocks
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        
        try:
            # Go to URL and wait until the network is mostly idle
            page.goto(url, wait_until="networkidle", timeout=30000)
            
            # Additional wait just in case of lazy-loaded reviews
            # Scroll down to trigger lazy loading
            page.evaluate("window.scrollTo(0, document.body.scrollHeight/2)")
            time.sleep(2)
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(2)
            
            # Click "load more" reviews if it exists (Optional heuristics)
            # page.evaluate("document.querySelectorAll('button').forEach(b => { if(b.innerText.toLowerCase().includes('more reviews') || b.innerText.toLowerCase().includes('load more')) b.click() })")
            # time.sleep(2)
            
            html_content = page.content()
        except Exception as e:
            print(f"DEBUG: Playwright error: {e}")
            try:
                html_content = page.content()
            except:
                pass
        finally:
            browser.close()
            
    if not html_content:
        raise ValueError("Failed to retrieve page content.")

    print(f"DEBUG: Passing {len(html_content)} bytes of HTML to AI filter...")
    result = prune_html_and_extract_ai_reviews(html_content)
    
    print(f"DEBUG: AI Scraper isolated {len(result['reviews'])} genuine reviews for: {result['product_name']}")
    return result

def extract_products_and_reviews_ai(raw_text: str) -> list:
    """
    Uses an LLM to parse a raw unformatted blob of text, identifying distinct 
    products and separating their reviews into a structured JSON array.
    """
    import os
    import json
    
    prompt = f"""
Analyze the following raw text which contains consumer reviews for potentially multiple distinct products.
Your job is to identify each unique physical or digital product mentioned, determine its likely category, and extract all reviews that correspond to it.

1. Group reviews by the specific product they are talking about.
2. Ignore irrelevant text, setup instructions, or non-review content.
3. Return ONLY a valid JSON array of objects.

RAW TEXT:
{raw_text}

Return ONLY valid JSON in exactly this format without markdown wrappers. Do not include any other text.
[
  {{
    "product_name": "Name of the product",
    "category": "Electronics",
    "reviews": [
      "Review text 1...",
      "Review text 2..."
    ]
  }}
]
"""
    try:
        # Check provider (assuming OpenAI as primary, Gemini fallback like the url scraper)
        provider = os.getenv("AI_PROVIDER", "openai").lower()
        if provider == "openai" and os.getenv("OPENAI_API_KEY"):
            import openai
            client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You split unstructured raw review text into structured JSON arrays by Product. Output JSON only."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"}, # Note: json_object requires an object, so we might need a slight format tweak
            )
            # Safe parsing
            content = response.choices[0].message.content
            # If the LLM wraps it in an object like {"data": [...]}, handle it
            data = json.loads(content)
            if isinstance(data, dict):
                # find the first list value
                for k, v in data.items():
                    if isinstance(v, list):
                        return v
                return []
            return data if isinstance(data, list) else []
            
        else:
            # Fallback to Gemini
            import google.generativeai as genai
            genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
            model = genai.GenerativeModel('gemini-1.5-flash', generation_config={"response_mime_type": "application/json"})
            response = model.generate_content(
                f"System: You split unstructured raw review text into structured JSON arrays by Product. Output JSON only.\n\nUser: {prompt}"
            )
            data = json.loads(response.text)
            if isinstance(data, dict):
                for k, v in data.items():
                    if isinstance(v, list):
                        return v
                return []
            return data if isinstance(data, list) else []
            
    except Exception as e:
        print(f"DEBUG: Multi-Product AI Extraction failed: {e}")
        return []

def run_raw_ingestion_background(raw_text: str, source_url: str = None, db = None):
    """
    Background worker for Raw Text AI Ingestion.
    Extracts structured products/reviews, handles deduplication, and processes claims.
    """
    from database import SessionLocal
    import models
    from pipeline import process_review_sync, cluster_product_claims

    # Avoid passing db Session through threads, instance a new one safely
    if not db:
        db = SessionLocal()
    
    product = None
    try:
        print(f"DEBUG: Starting Background AI Raw Extraction...")
        extracted_data = extract_products_and_reviews_ai(raw_text)
        
        if not extracted_data:
            print("DEBUG: AI found no valid products/reviews in the raw text.")
            return

        product_count = 0
        for item in extracted_data:
            p_name = item.get("product_name", "Unknown Product").strip()
            p_cat = item.get("category", "Uncategorized").strip()
            reviews_list = item.get("reviews", [])
            
            if not reviews_list:
                continue
                
            # 1. Check if product already exists
            product = db.query(models.Product).filter(models.Product.name == p_name).first()
            if not product:
                product = models.Product(name=p_name, category=p_cat, status="processing", ingest_type="text")
                db.add(product)
                db.commit()
                db.refresh(product)
            else:
                product.status = "processing"
                product.ingest_type = "text"
                product.processing_step = "Parsing AI Metadata"
                db.commit()

            # 2. Process reviews
            added_reviews = 0
            print(f"DEBUG: Processing {len(reviews_list)} reviews for {p_name}")
            if not isinstance(reviews_list, list):
                print(f"DEBUG: ERROR - reviews_list is not a list: {type(reviews_list)}")
                continue

            review_ids_to_process = []
            for r_idx, r_text in enumerate(reviews_list):
                text = str(r_text).strip()
                if len(text) > 10:
                    review = models.Review(
                        product_id=product.id,
                        original_text=text,
                        source="raw_paste",
                        source_url=source_url
                    )
                    db.add(review)
                    db.flush()
                    review_ids_to_process.append(review.id)
                    added_reviews += 1
            db.commit()
            
            if review_ids_to_process:
                product.processing_step = f"Distilling Claims ({len(review_ids_to_process)} reviews)..."
                db.commit()
                batch_process_reviews(review_ids_to_process, db)
                    
            # 3. Re-cluster and mark ready
            if added_reviews > 0:
                product.processing_step = "Harmonizing Patterns"
                db.commit()
                cluster_product_claims(product.id, db)
            
            product.processing_step = "Analysis Complete"
            product.status = "ready"
            db.commit()
            product_count += 1
            
        print(f"DEBUG: Background Raw AI Ingestion complete. Processed {len(extracted_data)} distinct products.")

    except Exception as e:
        print(f"DEBUG: Background Raw Ingestion failed: {e}")
        if product:
            product.status = "error"
            product.processing_step = f"Error: {str(e)}"
            db.commit()
    finally:
        db.close()

def ask_product_assistant(product_id: int, query: str, db: Session):
    """
    RAG-style chatbot that answers user questions about a product strictly using its reviews.
    Returns a generator yielding text chunks (streaming).
    """
    import os
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        yield "Product not found."
        return
        
    reviews = db.query(models.Review.original_text).filter(models.Review.product_id == product_id).limit(150).all()
    review_texts = [r[0] for r in reviews]
    
    if not review_texts:
        yield "I'm sorry, there are no reviews available for this product yet. I need reviews to answer your questions."
        return
        
    # Combine texts and truncate if needed
    context = "\n---\n".join(review_texts)
    if len(context) > 30000:
        context = context[:30000] + "...[TRUNCATED]"

    prompt = f"""
You are an expert AI shopping assistant for the product: {product.name}.
A user is asking you a specific question about this product.

RULES:
1. You MUST answer the user's question SOLELY based on the provided consumer reviews.
2. DO NOT hallucinate features, specs, or information not found in the reviews.
3. If the reviews do not contain the answer, politely state that you don't have enough information from the current reviews to answer that.
4. Keep your answer concise, helpful, and objective. Use markdown formatting if it helps readability.

USER QUESTION:
"{query}"

CONSUMER REVIEWS CONTEXT:
{context}
"""

    provider = os.getenv("LLM_PROVIDER", "openai").lower()
    try:
        if provider == "openai" and os.getenv("OPENAI_API_KEY"):
            import openai
            client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a helpful product assistant strictly answering based on reviews."},
                    {"role": "user", "content": prompt}
                ],
                stream=True,
                timeout=15.0,
            )
            for chunk in response:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        else:
            import google.generativeai as genai
            genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
            model = genai.GenerativeModel('gemini-1.5-flash')
            response = model.generate_content(
                f"System: You are a helpful product assistant strictly answering based on reviews.\n\nUser: {prompt}",
                stream=True
            )
            for chunk in response:
                yield chunk.text
    except Exception as e:
        print(f"DEBUG: Chatbot LLM call failed: {e}")
        yield "I'm sorry, I'm having trouble processing your request right now. Please try again later."
