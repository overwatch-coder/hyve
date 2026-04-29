from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Any
import uuid as uuid_lib
import csv
import io as io_lib
import json
import os
import schemas
import models
from database import get_db
from core.security import admin_required
from core.email import send_invite_email, email_configured
from experiment_scoring import score_similarity, word_count
from datetime import datetime

router = APIRouter(prefix="/experiments", tags=["Experiments"])


def _parse_helpfulness_response(value: Optional[str]) -> Optional[bool]:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized in {"yes", "true", "1"}:
        return True
    if normalized in {"no", "false", "0"}:
        return False
    return None


def _evidence_uses_ranked_lists(evidence: Optional[schemas.ExperimentEvidence]) -> bool:
    if not evidence:
        return False
    return bool(evidence.strengths or evidence.weaknesses)


def _extract_source_texts(
    source_refs: dict[str, Any],
    db: Session,
) -> dict[str, str]:
    source_texts: dict[str, str] = {}
    for key, ref in source_refs.items():
        if ref.type == "review":
            rev = db.query(models.Review).filter(models.Review.id == int(ref.id)).first()
            if rev:
                source_texts[key] = rev.original_text
        elif ref.type == "theme":
            thm = db.query(models.Theme).filter(models.Theme.id == int(ref.id)).first()
            if thm:
                source_texts[key] = thm.name
        elif ref.type == "claim":
            clm = db.query(models.Claim).filter(models.Claim.id == int(ref.id)).first()
            if clm:
                source_texts[key] = clm.claim_text
        elif ref.type == "strategy":
            thm = db.query(models.Theme).filter(models.Theme.id == int(ref.id)).first()
            if thm:
                source_texts[key] = thm.recommendation
    return source_texts


def _compute_similarity_scores(
    payload: schemas.ExperimentResultCreate,
    source_texts: dict[str, str],
) -> tuple[dict[str, float], str]:
    similarity_scores: dict[str, float] = {}
    review_status = "approved"
    HIGH = 0.55

    if not payload.evidence:
        return similarity_scores, "pending"

    if _evidence_uses_ranked_lists(payload.evidence):
        for group_name, items in (("strength", payload.evidence.strengths or []), ("weakness", payload.evidence.weaknesses or [])):
            for index, item in enumerate(items, start=1):
                field_key = f"{group_name}_{index}"
                ref_key = f"{field_key}_ref"
                item_text = (item.text or "").strip()
                src = source_texts.get(ref_key, "")
                score = score_similarity(item_text, src)
                similarity_scores[field_key] = score

                if not item_text or not src or score < HIGH:
                    review_status = "pending"

        expected_count = 3
        if len(payload.evidence.strengths or []) < expected_count or len(payload.evidence.weaknesses or []) < expected_count:
            review_status = "pending"
        return similarity_scores, review_status

    platform = payload.evidence.platform if payload.evidence else payload.platform
    fields_to_check = []
    refs_to_check = []

    if platform in {"traditional", "hyve"}:
        fields_to_check = [
            "weakness_paraphrase",
            "claim_paraphrase",
            "positive_paraphrase",
            "negative_paraphrase",
        ]
        refs_to_check = [
            "weakness_ref",
            "claim_ref",
            "positive_ref",
            "negative_ref",
        ]

    for field, ref_key in zip(fields_to_check, refs_to_check):
        phr = getattr(payload.evidence, field) or ""
        src = source_texts.get(ref_key, "")
        score = score_similarity(phr, src)
        similarity_scores[field] = score

        if word_count(phr) < 5 or score < HIGH:
            review_status = "pending"

    return similarity_scores, review_status


def _csv_cell_for_ranked_items(items: Any) -> str:
    if not isinstance(items, list):
        return ""
    texts = []
    for item in items:
        if isinstance(item, dict):
            text = str(item.get("text", "")).strip()
        else:
            text = str(getattr(item, "text", "")).strip()
        if text:
            texts.append(text)
    return " | ".join(texts)


def _csv_cell_for_string_list(items: Any) -> str:
    if not isinstance(items, list):
        return ""
    texts = [str(item).strip() for item in items if str(item).strip()]
    return " | ".join(texts)


def _escape_pdf_text(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _sanitize_pdf_text(text: str) -> str:
    normalized = (
        text.replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2026", "...")
        .replace("\u00a0", " ")
    )
    return normalized.encode("latin-1", "replace").decode("latin-1")


def _wrap_report_line(text: str, width: int = 92) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if len(candidate) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def _render_simple_pdf(title: str, body: str) -> bytes:
    page_width = 612
    page_height = 792
    margin = 54
    title_font_size = 18
    body_font_size = 11
    line_height = 15
    max_lines_per_page = 44

    lines: list[tuple[str, int]] = []
    lines.append((title, title_font_size))
    lines.append(("", body_font_size))
    for paragraph in body.splitlines():
        if not paragraph.strip():
            lines.append(("", body_font_size))
            continue
        for wrapped in _wrap_report_line(paragraph.strip()):
            lines.append((wrapped, body_font_size))

    pages: list[list[tuple[str, int]]] = []
    current_page: list[tuple[str, int]] = []
    for line in lines:
        current_page.append(line)
        if len(current_page) >= max_lines_per_page:
            pages.append(current_page)
            current_page = []
    if current_page:
        pages.append(current_page)

    objects: list[bytes] = []

    def add_object(content: str | bytes) -> int:
        blob = content.encode("latin-1") if isinstance(content, str) else content
        objects.append(blob)
        return len(objects)

    font_id = add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    page_ids = []
    content_ids = []
    pages_id_placeholder = len(objects) + 1

    for page_lines in pages:
        y = page_height - margin
        stream_lines = ["BT"]
        for text, font_size in page_lines:
            escaped = _escape_pdf_text(_sanitize_pdf_text(text))
            stream_lines.append(f"/F1 {font_size} Tf")
            stream_lines.append(f"1 0 0 1 {margin} {y} Tm")
            stream_lines.append(f"({escaped}) Tj")
            y -= line_height if font_size == body_font_size else line_height + 6
        stream_lines.append("ET")
        stream = "\n".join(stream_lines).encode("latin-1", "replace")
        content_id = add_object(
            b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream"
        )
        content_ids.append(content_id)
        page_id = add_object(
            f"<< /Type /Page /Parent {pages_id_placeholder} 0 R /MediaBox [0 0 {page_width} {page_height}] "
            f"/Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>"
        )
        page_ids.append(page_id)

    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    pages_id = add_object(f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>")
    catalog_id = add_object(f"<< /Type /Catalog /Pages {pages_id} 0 R >>")

    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    xref_positions = [0]
    for index, obj in enumerate(objects, start=1):
        xref_positions.append(len(output))
        output.extend(f"{index} 0 obj\n".encode("ascii"))
        output.extend(obj)
        output.extend(b"\nendobj\n")

    xref_start = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for position in xref_positions[1:]:
        output.extend(f"{position:010d} 00000 n \n".encode("ascii"))
    output.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\nstartxref\n{xref_start}\n%%EOF".encode(
            "ascii"
        )
    )
    return bytes(output)


def _study_report_result_payload(result: models.ExperimentResult) -> dict[str, Any]:
    evidence = result.evidence or {}
    analysis = result.admin_analysis or {}
    return {
        "result_id": result.id,
        "participant_name": result.participant_name or "Anonymous participant",
        "platform": result.platform,
        "time_seconds": result.time_seconds,
        "confidence_rating": result.confidence_rating,
        "participant_helpful": result.participant_helpful,
        "review_status": result.review_status,
        "top_strengths": _ranked_finding_texts(evidence, "strengths"),
        "top_weaknesses": _ranked_finding_texts(evidence, "weaknesses"),
        "admin_summary": analysis.get("summary"),
        "strength_match_pct": analysis.get("strength_match_pct"),
        "weakness_match_pct": analysis.get("weakness_match_pct"),
        "overall_accuracy_pct": analysis.get("overall_accuracy_pct"),
        "manual_strength_match_pct": analysis.get("manual_strength_match_pct"),
        "manual_weakness_match_pct": analysis.get("manual_weakness_match_pct"),
        "manual_overall_accuracy_pct": analysis.get("manual_overall_accuracy_pct"),
        "analysis_generated_at": analysis.get("generated_at"),
        "review_notes": result.review_notes,
        "created_at": result.created_at.isoformat() if result.created_at else None,
    }


def _generate_study_report_text(
    study: models.ExperimentStudy,
    results: list[models.ExperimentResult],
) -> str:
    approved = sum(1 for result in results if result.review_status == "approved")
    pending = sum(1 for result in results if result.review_status == "pending")
    rejected = sum(1 for result in results if result.review_status == "rejected")
    hyve_results = [result for result in results if result.platform == "hyve"]
    traditional_results = [result for result in results if result.platform == "traditional"]

    def _avg(values: list[Optional[float]]) -> Optional[float]:
        actual = [value for value in values if value is not None]
        return round(sum(actual) / len(actual), 1) if actual else None

    payload = {
        "study": {
            "id": study.id,
            "title": study.title,
            "status": study.status,
            "description": study.description,
            "ground_truth_strengths": study.ground_truth_strengths or [],
            "ground_truth_weaknesses": study.ground_truth_weaknesses or [],
        },
        "overview": {
            "total_results": len(results),
            "approved_results": approved,
            "pending_results": pending,
            "rejected_results": rejected,
            "hyve_results": len(hyve_results),
            "traditional_results": len(traditional_results),
            "avg_confidence": _avg([result.confidence_rating for result in results]),
            "avg_time_seconds": _avg([result.time_seconds for result in results]),
            "hyve_avg_confidence": _avg([result.confidence_rating for result in hyve_results]),
            "traditional_avg_confidence": _avg([result.confidence_rating for result in traditional_results]),
            "hyve_avg_time_seconds": _avg([result.time_seconds for result in hyve_results]),
            "traditional_avg_time_seconds": _avg([result.time_seconds for result in traditional_results]),
        },
        "results": [_study_report_result_payload(result) for result in results],
    }

    prompt = f"""
You are preparing a research-style PDF report for an admin reviewing an experiment study.

Use the structured study data below. Write a polished report in plain text with short headings and concise paragraphs.

Required sections:
1. Executive Summary
2. Participation Overview
3. Accuracy Patterns
4. Confidence and Helpfulness
5. Ground Truth Alignment
6. Recommendations

Guidelines:
- Base the report on the actual data provided.
- Mention differences between HYVE and Traditional when the data supports it.
- Reference manual override scores when present.
- Be clear about how many results are approved, pending, or rejected.
- Keep the tone professional and practical for an admin or research lead.
- Return only the report text, with no markdown fences.

Structured data:
{json.dumps(payload, ensure_ascii=False)}
""".strip()

    try:
        provider = os.getenv("LLM_PROVIDER", "openai").lower()
        if provider == "gemini":
            from google import genai as _ggenai

            client = _ggenai.Client(api_key=os.getenv("GEMINI_API_KEY"))
            response = client.models.generate_content(
                model=os.getenv("STUDY_REPORT_MODEL", "gemini-2.0-flash"),
                contents=prompt,
            )
            text = (response.text or "").strip()
        else:
            import openai

            client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            response = client.chat.completions.create(
                model=os.getenv("STUDY_REPORT_MODEL", "gpt-4o-mini"),
                messages=[
                    {
                        "role": "system",
                        "content": "You write concise study reports for experiment admins using only the supplied data.",
                    },
                    {"role": "user", "content": prompt},
                ],
                timeout=60.0,
            )
            text = (response.choices[0].message.content or "").strip()

        if text:
            return text
    except Exception:
        pass

    lines = [
        f"Study Report: {study.title}",
        "",
        "Executive Summary",
        f"This study currently has {len(results)} result(s), with {approved} approved, {pending} pending, and {rejected} rejected.",
        "",
        "Ground Truth Alignment",
        f"Strengths reference: {', '.join(study.ground_truth_strengths or []) or 'None provided.'}",
        f"Weaknesses reference: {', '.join(study.ground_truth_weaknesses or []) or 'None provided.'}",
    ]
    return "\n".join(lines)


def _ranked_finding_texts(evidence: Any, key: str) -> list[str]:
    if not isinstance(evidence, dict):
        return []
    items = evidence.get(key)
    if not isinstance(items, list):
        return []

    texts: list[str] = []
    for item in items:
        if isinstance(item, dict):
            text = str(item.get("text", "")).strip()
        else:
            text = str(getattr(item, "text", "")).strip()
        if text:
            texts.append(text)
    return texts


def _average_best_similarity(participant_items: list[str], ground_truth_items: list[str]) -> float:
    if not participant_items or not ground_truth_items:
        return 0.0

    scores: list[float] = []
    for item in participant_items:
        best = max(score_similarity(item, truth) for truth in ground_truth_items)
        scores.append(best)

    return sum(scores) / len(scores)


def _clean_model_json_text(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
    if cleaned.endswith("```"):
        cleaned = cleaned.rsplit("\n", 1)[0]
    return cleaned.strip()


def _clamp_pct(value: Any) -> Optional[float]:
    if isinstance(value, str):
        value = value.strip().replace("%", "")
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return round(max(0.0, min(100.0, parsed)), 1)


def _build_admin_analysis_with_llm(
    result: models.ExperimentResult,
    study: models.ExperimentStudy,
    custom_prompt: Optional[str] = None,
) -> dict[str, Any]:
    evidence = result.evidence or {}
    participant_strengths = _ranked_finding_texts(evidence, "strengths")
    participant_weaknesses = _ranked_finding_texts(evidence, "weaknesses")
    ground_truth_strengths = study.ground_truth_strengths or []
    ground_truth_weaknesses = study.ground_truth_weaknesses or []
    normalized_prompt = (custom_prompt or "").strip()

    prompt = f"""
You are evaluating a participant's product-analysis submission against ground truth.

Score the submission based on meaning, not exact wording.

Return:
- strength_match_pct: 0 to 100
- weakness_match_pct: 0 to 100
- overall_accuracy_pct: 0 to 100
- summary: a concise 2 to 4 sentence admin summary covering accuracy, confidence, and whether the response seems useful

Ground-truth strengths:
{json.dumps(ground_truth_strengths, ensure_ascii=False)}

Ground-truth weaknesses:
{json.dumps(ground_truth_weaknesses, ensure_ascii=False)}

Participant strengths:
{json.dumps(participant_strengths, ensure_ascii=False)}

Participant weaknesses:
{json.dumps(participant_weaknesses, ensure_ascii=False)}

Confidence rating:
{result.confidence_rating if result.confidence_rating is not None else "Not provided"}

Helpfulness response:
{result.participant_helpful if result.participant_helpful is not None else "Not answered"}

Optional admin focus:
{normalized_prompt or "None"}

Return only valid JSON:
{{
  "strength_match_pct": 0,
  "weakness_match_pct": 0,
  "overall_accuracy_pct": 0,
  "summary": "..."
}}
""".strip()

    provider = os.getenv("LLM_PROVIDER", "openai").lower()
    if provider == "gemini":
        from google import genai as _ggenai

        client = _ggenai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        response = client.models.generate_content(
            model=os.getenv("STUDY_ANALYSIS_MODEL", "gemini-2.0-flash"),
            contents=prompt,
        )
        payload = json.loads(_clean_model_json_text(response.text or ""))
    else:
        import openai

        client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        response = client.chat.completions.create(
            model=os.getenv("STUDY_ANALYSIS_MODEL", "gpt-4o-mini"),
            messages=[
                {
                    "role": "system",
                    "content": "You evaluate participant findings against study ground truth and return JSON only.",
                },
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            timeout=30.0,
        )
        payload = json.loads(response.choices[0].message.content or "{}")

    strength_pct = _clamp_pct(payload.get("strength_match_pct"))
    weakness_pct = _clamp_pct(payload.get("weakness_match_pct"))
    overall_pct = _clamp_pct(payload.get("overall_accuracy_pct"))
    if strength_pct is None or weakness_pct is None:
        raise ValueError("LLM analysis did not return usable scores")
    if overall_pct is None:
        overall_pct = round((strength_pct + weakness_pct) / 2, 1)

    summary = str(payload.get("summary", "")).strip()
    if not summary:
        raise ValueError("LLM analysis did not return a summary")

    return {
        "summary": summary,
        "strength_match_pct": strength_pct,
        "weakness_match_pct": weakness_pct,
        "overall_accuracy_pct": overall_pct,
        "custom_prompt": normalized_prompt or None,
        "participant_strengths": participant_strengths,
        "participant_weaknesses": participant_weaknesses,
        "ground_truth_strengths": ground_truth_strengths,
        "ground_truth_weaknesses": ground_truth_weaknesses,
    }


def _build_admin_analysis_fallback(
    result: models.ExperimentResult,
    study: models.ExperimentStudy,
    custom_prompt: Optional[str] = None,
) -> dict[str, Any]:
    evidence = result.evidence or {}
    participant_strengths = _ranked_finding_texts(evidence, "strengths")
    participant_weaknesses = _ranked_finding_texts(evidence, "weaknesses")
    ground_truth_strengths = study.ground_truth_strengths or []
    ground_truth_weaknesses = study.ground_truth_weaknesses or []

    strength_avg = _average_best_similarity(participant_strengths, ground_truth_strengths)
    weakness_avg = _average_best_similarity(participant_weaknesses, ground_truth_weaknesses)
    overall_avg = (strength_avg + weakness_avg) / 2

    strength_pct = round(strength_avg * 100, 1)
    weakness_pct = round(weakness_avg * 100, 1)
    overall_pct = round(overall_avg * 100, 1)

    if strength_pct > weakness_pct:
        alignment_note = "The participant captured strengths more accurately than weaknesses."
    elif weakness_pct > strength_pct:
        alignment_note = "The participant captured weaknesses more accurately than strengths."
    else:
        alignment_note = "The participant showed similar accuracy across strengths and weaknesses."

    confidence_note = (
        f"Confidence was {result.confidence_rating}/5."
        if result.confidence_rating is not None
        else "Confidence was not provided."
    )
    helpfulness_note = (
        "They reported the platform was helpful."
        if result.participant_helpful is True
        else "They reported the platform was not helpful."
        if result.participant_helpful is False
        else "They did not answer the helpfulness question."
    )

    summary_parts = [alignment_note, confidence_note, helpfulness_note]
    normalized_prompt = (custom_prompt or "").strip()
    if normalized_prompt:
        summary_parts.insert(0, f"Prompt focus: {normalized_prompt}.")
    summary = " ".join(summary_parts)

    return {
        "summary": summary,
        "strength_match_pct": strength_pct,
        "weakness_match_pct": weakness_pct,
        "overall_accuracy_pct": overall_pct,
        "custom_prompt": normalized_prompt or None,
        "participant_strengths": participant_strengths,
        "participant_weaknesses": participant_weaknesses,
        "ground_truth_strengths": ground_truth_strengths,
        "ground_truth_weaknesses": ground_truth_weaknesses,
    }


def _build_admin_analysis(
    result: models.ExperimentResult,
    study: models.ExperimentStudy,
    custom_prompt: Optional[str] = None,
    existing_analysis: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    prior_analysis = existing_analysis or {}

    try:
        analysis = _build_admin_analysis_with_llm(
            result,
            study,
            custom_prompt=custom_prompt,
        )
    except Exception:
        analysis = _build_admin_analysis_fallback(
            result,
            study,
            custom_prompt=custom_prompt,
        )

    analysis["manual_strength_match_pct"] = prior_analysis.get("manual_strength_match_pct")
    analysis["manual_weakness_match_pct"] = prior_analysis.get("manual_weakness_match_pct")
    analysis["manual_overall_accuracy_pct"] = prior_analysis.get("manual_overall_accuracy_pct")
    analysis["manual_override_updated_at"] = prior_analysis.get("manual_override_updated_at")
    analysis["generated_at"] = datetime.utcnow().isoformat()
    return analysis


def _generate_study_copy(payload: schemas.StudyCopyAssistRequest, product: models.Product) -> str:
    field_guidance = {
        "description": "Write a concise participant-facing study description in 2-4 sentences. State the product, the purpose of the study, and what the participant will do.",
        "consent_text": "Write a short academic informed-consent paragraph for an anonymous product-understanding study. Mention voluntary participation, anonymous responses, and research use only.",
        "instructions_hyve": "Write participant instructions for the HYVE arm. The task is to identify the top 3 strengths and top 3 weaknesses of the product using the HYVE decision map.",
        "instructions_traditional": "Write participant instructions for the Traditional arm. The task is to identify the top 3 strengths and top 3 weaknesses of the product by reading raw reviews.",
    }
    if payload.field not in field_guidance:
        raise HTTPException(status_code=400, detail="Unsupported study copy field")

    base_prompt = f"""
You are helping an admin create copy for a controlled A/B product-understanding study.

Product name: {product.name}
Category: {product.category}
Product summary: {product.summary or 'No summary available.'}

Target field: {payload.field}
Task guidance: {field_guidance[payload.field]}

Current text:
{payload.current_text or '[empty]'}

Custom instruction:
{payload.instruction or '[none]'}

Return only the final text for the field. Do not use markdown fences, bullet labels, or explanations.
""".strip()

    provider = os.getenv("LLM_PROVIDER", "openai").lower()
    if provider == "gemini":
        from google import genai as _ggenai

        client = _ggenai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        response = client.models.generate_content(
            model=os.getenv("STUDY_COPY_MODEL", "gemini-2.0-flash"),
            contents=base_prompt,
        )
        return (response.text or "").strip()

    import openai

    client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = client.chat.completions.create(
        model=os.getenv("STUDY_COPY_MODEL", "gpt-4o-mini"),
        messages=[
            {"role": "system", "content": "You write concise, clear academic study copy."},
            {"role": "user", "content": base_prompt},
        ],
        timeout=30.0,
    )
    return (response.choices[0].message.content or "").strip()


@router.post("/results")
def record_experiment_result(payload: schemas.ExperimentResultCreate, db: Session = Depends(get_db)):
    """Record the result of an A/B testing session."""
    evidence_dict = payload.evidence.model_dump() if payload.evidence else {}

    db_result = models.ExperimentResult(
        product_id=payload.product_id,
        platform=payload.platform,
        time_seconds=payload.time_seconds,
        participant_name=payload.participant_name,
        evidence=evidence_dict,
        similarity_scores=None,
        review_status="pending",
        confidence_rating=payload.confidence_rating,
        participant_helpful=_parse_helpfulness_response(payload.helpfulness_response),
    )

    # Link to study participant via session_token
    if payload.session_token:
        participant = (
            db.query(models.ExperimentParticipant)
            .filter(models.ExperimentParticipant.session_token == payload.session_token)
            .first()
        )
        if participant:
            participant.completed = True
            db_result.study_id = participant.study_id
            db_result.participant_id = participant.id
            db.flush()

    db.add(db_result)
    db.commit()
    db.refresh(db_result)
    return {"status": "success", "id": db_result.id}


class ReviewUpdatePayload(schemas.BaseModel):
    review_status: str
    review_notes: Optional[str] = None


class AnalyzeRequest(schemas.BaseModel):
    custom_prompt: Optional[str] = None


class ManualAnalysisOverridePayload(schemas.BaseModel):
    manual_strength_match_pct: Optional[float] = None
    manual_weakness_match_pct: Optional[float] = None
    manual_overall_accuracy_pct: Optional[float] = None


def _public_result_query(db: Session):
    return db.query(models.ExperimentResult).filter(
        models.ExperimentResult.review_status == "approved",
        models.ExperimentResult.exclude_from_public.is_(False),
    )


@router.get("/review-queue")
def get_review_queue(
    platform: Optional[str] = None,
    status: str = "pending",
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required)
):
    query = db.query(models.ExperimentResult)
    if platform:
        query = query.filter(models.ExperimentResult.platform == platform)
    if status:
        query = query.filter(models.ExperimentResult.review_status == status)

    results = query.order_by(models.ExperimentResult.created_at.desc()).all()
    # Apply score filtering in-memory or let FE do it, per spec it says query params but we just need items right now.
    return {"items": results}


@router.patch("/results/{result_id}/review")
def update_review_status(
    result_id: int,
    payload: ReviewUpdatePayload,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required)
):
    result = db.query(models.ExperimentResult).filter(
        models.ExperimentResult.id == result_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")

    result_any: Any = result
    result_any.review_status = payload.review_status
    if payload.review_notes:
        result_any.review_notes = payload.review_notes
    result_any.reviewed_by = "admin"
    result_any.reviewed_at = datetime.utcnow()

    db.commit()
    db.refresh(result)
    return result


@router.post("/results/{result_id}/analyze", response_model=schemas.ExperimentResult)
def analyze_experiment_result(
    result_id: int,
    payload: Optional[AnalyzeRequest] = None,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    result = (
        db.query(models.ExperimentResult)
        .filter(models.ExperimentResult.id == result_id)
        .first()
    )
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")
    if not result.study_id:
        raise HTTPException(status_code=400, detail="Result is not linked to a study")

    study = (
        db.query(models.ExperimentStudy)
        .filter(models.ExperimentStudy.id == result.study_id)
        .first()
    )
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    if not (study.ground_truth_strengths and study.ground_truth_weaknesses):
        raise HTTPException(status_code=400, detail="Study ground truth is incomplete")

    result.admin_analysis = _build_admin_analysis(
        result,
        study,
        custom_prompt=payload.custom_prompt if payload else None,
        existing_analysis=result.admin_analysis or {},
    )
    db.commit()
    db.refresh(result)
    return result


@router.patch("/results/{result_id}/public-visibility", response_model=schemas.ExperimentResult)
def update_public_visibility(
    result_id: int,
    payload: schemas.PublicResultVisibilityUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    result = (
        db.query(models.ExperimentResult)
        .filter(models.ExperimentResult.id == result_id)
        .first()
    )
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")

    result.exclude_from_public = payload.exclude_from_public
    db.commit()
    db.refresh(result)
    return result


@router.delete("/results/{result_id}", status_code=204)
def delete_experiment_result(
    result_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    result = (
        db.query(models.ExperimentResult)
        .filter(models.ExperimentResult.id == result_id)
        .first()
    )
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")

    db.delete(result)
    db.commit()


@router.get("/public-results", response_model=List[schemas.PublicExperimentResultOut])
def list_public_results_for_admin(
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    rows = (
        db.query(
            models.ExperimentResult,
            models.ExperimentStudy.title.label("study_title"),
            models.Product.name.label("product_name"),
        )
        .join(models.Product, models.Product.id == models.ExperimentResult.product_id)
        .outerjoin(models.ExperimentStudy, models.ExperimentStudy.id == models.ExperimentResult.study_id)
        .filter(models.ExperimentResult.review_status == "approved")
        .order_by(models.ExperimentResult.created_at.desc())
        .all()
    )

    return [
        schemas.PublicExperimentResultOut(
            id=result.id,
            study_id=result.study_id,
            study_title=study_title,
            product_id=result.product_id,
            product_name=product_name,
            platform=result.platform,
            participant_name=result.participant_name,
            time_seconds=result.time_seconds,
            review_status=result.review_status,
            exclude_from_public=result.exclude_from_public,
            created_at=result.created_at,
        )
        for result, study_title, product_name in rows
    ]


@router.patch("/results/{result_id}/analysis", response_model=schemas.ExperimentResult)
def update_manual_analysis_override(
    result_id: int,
    payload: ManualAnalysisOverridePayload,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    result = (
        db.query(models.ExperimentResult)
        .filter(models.ExperimentResult.id == result_id)
        .first()
    )
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")

    analysis = dict(result.admin_analysis or {})
    if not analysis:
        raise HTTPException(
            status_code=400,
            detail="Analyze results before saving a manual override",
        )

    analysis["manual_strength_match_pct"] = payload.manual_strength_match_pct
    analysis["manual_weakness_match_pct"] = payload.manual_weakness_match_pct
    if payload.manual_overall_accuracy_pct is not None:
        manual_overall = payload.manual_overall_accuracy_pct
    elif (
        payload.manual_strength_match_pct is not None
        and payload.manual_weakness_match_pct is not None
    ):
        manual_overall = round(
            (payload.manual_strength_match_pct + payload.manual_weakness_match_pct) / 2,
            1,
        )
    else:
        manual_overall = analysis.get("manual_overall_accuracy_pct")

    analysis["manual_overall_accuracy_pct"] = manual_overall
    analysis["manual_override_updated_at"] = datetime.utcnow().isoformat()

    result.admin_analysis = analysis
    db.commit()
    db.refresh(result)
    return result


@router.get("/analytics", response_model=schemas.ExperimentAnalytics)
def get_experiment_analytics(db: Session = Depends(get_db)):
    """Get aggregated analytics for A/B testing."""
    # Platform stats
    stats = db.query(
        models.ExperimentResult.platform,
        func.avg(models.ExperimentResult.time_seconds).label("avg_time"),
        func.count(models.ExperimentResult.id).label("count")
    ).filter(
        models.ExperimentResult.review_status == "approved",
        models.ExperimentResult.exclude_from_public.is_(False),
    ).group_by(models.ExperimentResult.platform).all()

    platform_stats = [
        {"platform": s.platform, "avg_time": float(
            s.avg_time), "count": s.count}
        for s in stats
    ]

    # Total participants
    total = (
        db.query(func.count(models.ExperimentResult.id))
        .filter(
            models.ExperimentResult.review_status == "approved",
            models.ExperimentResult.exclude_from_public.is_(False),
        )
        .scalar()
    )

    # Recent activity
    recent = (
        _public_result_query(db)
        .order_by(models.ExperimentResult.created_at.desc())
        .limit(10)
        .all()
    )

    return {
        "platform_stats": platform_stats,
        "total_participants": total,
        "recent_activity": recent
    }


@router.get("/results", response_model=List[schemas.ExperimentResult])
def list_experiment_results(db: Session = Depends(get_db)):
    """List all experiment results for the detailed table."""
    return (
        _public_result_query(db)
        .order_by(models.ExperimentResult.created_at.desc())
        .all()
    )


@router.get("/studies/{study_id}/results", response_model=List[schemas.ExperimentResult])
def list_study_results(
    study_id: int,
    platform: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    query = db.query(models.ExperimentResult).filter(models.ExperimentResult.study_id == study_id)
    if platform:
        query = query.filter(models.ExperimentResult.platform == platform)
    if status:
        query = query.filter(models.ExperimentResult.review_status == status)
    return query.order_by(models.ExperimentResult.created_at.desc()).all()


# ─── Study Management (Admin) ────────────────────────────────────────────────

@router.post("/studies", response_model=schemas.ExperimentStudyOut)
def create_study(
    payload: schemas.ExperimentStudyCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    product = db.query(models.Product).filter(models.Product.id == payload.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.status != "ready":
        raise HTTPException(status_code=400, detail="Product must be in 'ready' status before creating a study")
    study = models.ExperimentStudy(**payload.model_dump())
    db.add(study)
    db.commit()
    db.refresh(study)
    return study


@router.post("/studies/ai-assist", response_model=schemas.StudyCopyAssistResponse)
def ai_assist_study_copy(
    payload: schemas.StudyCopyAssistRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    product = db.query(models.Product).filter(models.Product.id == payload.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    try:
        text = _generate_study_copy(payload, product)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI generation failed: {exc}") from exc

    if not text:
        raise HTTPException(status_code=502, detail="AI generation returned empty text")

    return schemas.StudyCopyAssistResponse(text=text)


@router.get("/studies", response_model=List[schemas.ExperimentStudyOut])
def list_studies(
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    return db.query(models.ExperimentStudy).order_by(models.ExperimentStudy.created_at.desc()).all()


@router.get("/studies/{study_id}", response_model=schemas.ExperimentStudyOut)
def get_study(
    study_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    study = db.query(models.ExperimentStudy).filter(models.ExperimentStudy.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    return study


@router.patch("/studies/{study_id}", response_model=schemas.ExperimentStudyOut)
def update_study(
    study_id: int,
    payload: schemas.ExperimentStudyUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    study = db.query(models.ExperimentStudy).filter(models.ExperimentStudy.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(study, field, value)
    db.commit()
    db.refresh(study)
    return study


@router.delete("/studies/{study_id}", status_code=204)
def delete_study(
    study_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    study = db.query(models.ExperimentStudy).filter(models.ExperimentStudy.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    db.delete(study)
    db.commit()


@router.post("/studies/{study_id}/invites", response_model=List[schemas.ExperimentInviteOut])
def generate_invites(
    study_id: int,
    payload: schemas.GenerateInvitesRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    study = db.query(models.ExperimentStudy).filter(models.ExperimentStudy.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    # Determine how many codes to generate and which emails to assign
    emails: list[str] = payload.emails or []
    count = len(emails) if emails else payload.count

    if count < 1 or count > 200:
        raise HTTPException(status_code=400, detail="count must be between 1 and 200")

    # Balanced platform assignment: check existing counts for this study first,
    # then fill greedily so totals stay as even as possible.
    hyve_count = (
        db.query(func.count(models.ExperimentInvite.id))
        .filter(
            models.ExperimentInvite.study_id == study_id,
            models.ExperimentInvite.assigned_platform == "hyve",
        )
        .scalar()
        or 0
    )
    trad_count = (
        db.query(func.count(models.ExperimentInvite.id))
        .filter(
            models.ExperimentInvite.study_id == study_id,
            models.ExperimentInvite.assigned_platform == "traditional",
        )
        .scalar()
        or 0
    )
    platforms: list[str] = []
    h, t = hyve_count, trad_count
    for _ in range(count):
        if h <= t:
            platforms.append("hyve")
            h += 1
        else:
            platforms.append("traditional")
            t += 1

    invites = []
    for i, platform in enumerate(platforms):
        code = str(uuid_lib.uuid4()).replace("-", "")[:12].upper()
        email = emails[i] if i < len(emails) else None
        invite = models.ExperimentInvite(
            study_id=study_id,
            code=code,
            assigned_platform=platform,
            participant_email=email,
        )
        db.add(invite)
        invites.append(invite)
    db.commit()
    for inv in invites:
        db.refresh(inv)

    # Send emails in background if addresses were provided
    if emails and email_configured():
        def _send_all(invs: list, title: str) -> None:
            for inv in invs:
                if inv.participant_email:
                    try:
                        send_invite_email(
                            to_email=inv.participant_email,
                            invite_code=inv.code,
                            study_title=title,
                            platform=inv.assigned_platform,
                        )
                        # Update sent status (new db session to avoid thread conflicts)
                        from database import SessionLocal
                        with SessionLocal() as bg_db:
                            row = bg_db.query(models.ExperimentInvite).filter(
                                models.ExperimentInvite.id == inv.id
                            ).first()
                            if row:
                                row.email_sent = True
                                row.email_sent_at = datetime.utcnow()
                                bg_db.commit()
                    except Exception:
                        pass  # individual failures don't abort the batch

        background_tasks.add_task(_send_all, list(invites), study.title)

    return invites


@router.get("/studies/{study_id}/invites", response_model=List[schemas.ExperimentInviteOut])
def list_invites(
    study_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    return (
        db.query(models.ExperimentInvite)
        .filter(models.ExperimentInvite.study_id == study_id)
        .order_by(models.ExperimentInvite.created_at.asc())
        .all()
    )


@router.post("/studies/{study_id}/invites/{invite_id}/send-email", response_model=schemas.ExperimentInviteOut)
def send_invite_email_endpoint(
    study_id: int,
    invite_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    """Send (or resend) the invite email for a single code."""
    invite = (
        db.query(models.ExperimentInvite)
        .filter(
            models.ExperimentInvite.id == invite_id,
            models.ExperimentInvite.study_id == study_id,
        )
        .first()
    )
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    if not invite.participant_email:
        raise HTTPException(status_code=400, detail="No email address on this invite")
    if invite.used:
        raise HTTPException(status_code=409, detail="Invite already used — cannot resend")
    if not email_configured():
        raise HTTPException(
            status_code=503,
            detail="Email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD in your .env file.",
        )

    study = invite.study

    def _send(inv: models.ExperimentInvite, title: str) -> None:
        try:
            send_invite_email(
                to_email=inv.participant_email,
                invite_code=inv.code,
                study_title=title,
                platform=inv.assigned_platform,
            )
            from database import SessionLocal
            with SessionLocal() as bg_db:
                row = bg_db.query(models.ExperimentInvite).filter(
                    models.ExperimentInvite.id == inv.id
                ).first()
                if row:
                    row.email_sent = True
                    row.email_sent_at = datetime.utcnow()
                    bg_db.commit()
        except Exception as exc:
            raise RuntimeError(str(exc)) from exc

    background_tasks.add_task(_send, invite, study.title)

    # Optimistically mark as sent in the response (background will confirm in DB)
    return invite


@router.delete("/studies/{study_id}/invites/{invite_id}", status_code=204)
def delete_invite(
    study_id: int,
    invite_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    """Delete an invite code (admins may delete used codes too)."""
    invite = (
        db.query(models.ExperimentInvite)
        .filter(
            models.ExperimentInvite.id == invite_id,
            models.ExperimentInvite.study_id == study_id,
        )
        .first()
    )
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    db.delete(invite)
    db.commit()


class BulkDeleteInvitesRequest(schemas.BaseModel):
    ids: List[int]


@router.delete("/studies/{study_id}/invites", status_code=204)
def bulk_delete_invites(
    study_id: int,
    payload: BulkDeleteInvitesRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    """Bulk-delete invite codes by ID. Deletes both used and unused codes."""
    (
        db.query(models.ExperimentInvite)
        .filter(
            models.ExperimentInvite.study_id == study_id,
            models.ExperimentInvite.id.in_(payload.ids),
        )
        .delete(synchronize_session=False)
    )
    db.commit()


# ─── Study Analytics + Export (Admin) ─────────────────────────────────────────

@router.get("/studies/{study_id}/analytics", response_model=schemas.StudyAnalyticsOut)
def get_study_analytics(
    study_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    study = db.query(models.ExperimentStudy).filter(models.ExperimentStudy.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    invites = db.query(models.ExperimentInvite).filter(models.ExperimentInvite.study_id == study_id).all()
    total_invites = len(invites)
    used_invites = sum(1 for i in invites if i.used)

    results = (
        db.query(models.ExperimentResult)
        .filter(models.ExperimentResult.study_id == study_id)
        .all()
    )
    completions = len(results)
    pending_review = sum(1 for r in results if r.review_status == "pending")
    approved = sum(1 for r in results if r.review_status == "approved")
    rejected = sum(1 for r in results if r.review_status == "rejected")

    hyve_results = [r for r in results if r.platform == "hyve"]
    trad_results = [r for r in results if r.platform == "traditional"]

    def avg(vals):
        return sum(vals) / len(vals) if vals else None

    return schemas.StudyAnalyticsOut(
        study_id=study.id,
        product_id=study.product_id,
        title=study.title,
        status=study.status,
        total_invites=total_invites,
        used_invites=used_invites,
        completions=completions,
        pending_review=pending_review,
        approved=approved,
        rejected=rejected,
        hyve_count=len(hyve_results),
        traditional_count=len(trad_results),
        hyve_avg_time=avg([r.time_seconds for r in hyve_results if r.time_seconds]),
        traditional_avg_time=avg([r.time_seconds for r in trad_results if r.time_seconds]),
        hyve_avg_confidence=avg([r.confidence_rating for r in hyve_results if r.confidence_rating]),
        traditional_avg_confidence=avg([r.confidence_rating for r in trad_results if r.confidence_rating]),
    )


@router.get("/studies/{study_id}/export")
def export_study_results(
    study_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    study = db.query(models.ExperimentStudy).filter(models.ExperimentStudy.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    results = (
        db.query(models.ExperimentResult)
        .filter(models.ExperimentResult.study_id == study_id)
        .order_by(models.ExperimentResult.created_at.asc())
        .all()
    )

    output = io_lib.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "result_id", "study_id", "platform", "participant_name", "time_seconds",
        "confidence_rating", "participant_helpful", "review_status",
        "top_strengths", "top_weaknesses",
        "study_ground_truth_strengths", "study_ground_truth_weaknesses",
        "admin_analysis_summary", "strength_match_pct", "weakness_match_pct",
        "overall_accuracy_pct", "manual_strength_match_pct",
        "manual_weakness_match_pct", "manual_overall_accuracy_pct",
        "analysis_generated_at", "manual_override_updated_at", "review_notes",
        "strength_1_score", "strength_2_score", "strength_3_score",
        "weakness_1_score", "weakness_2_score", "weakness_3_score",
        "legacy_weakness_paraphrase", "legacy_claim_paraphrase",
        "legacy_positive_paraphrase", "legacy_negative_paraphrase",
        "created_at",
    ])
    for r in results:
        ev = r.evidence or {}
        sc = r.similarity_scores or {}
        analysis = r.admin_analysis or {}
        writer.writerow([
            r.id,
            r.study_id,
            r.platform,
            r.participant_name or "",
            r.time_seconds,
            r.confidence_rating,
            r.participant_helpful,
            r.review_status,
            _csv_cell_for_ranked_items(ev.get("strengths")),
            _csv_cell_for_ranked_items(ev.get("weaknesses")),
            _csv_cell_for_string_list(study.ground_truth_strengths),
            _csv_cell_for_string_list(study.ground_truth_weaknesses),
            analysis.get("summary", ""),
            analysis.get("strength_match_pct", ""),
            analysis.get("weakness_match_pct", ""),
            analysis.get("overall_accuracy_pct", ""),
            analysis.get("manual_strength_match_pct", ""),
            analysis.get("manual_weakness_match_pct", ""),
            analysis.get("manual_overall_accuracy_pct", ""),
            analysis.get("generated_at", ""),
            analysis.get("manual_override_updated_at", ""),
            r.review_notes or "",
            sc.get("strength_1", ""),
            sc.get("strength_2", ""),
            sc.get("strength_3", ""),
            sc.get("weakness_1", ""),
            sc.get("weakness_2", ""),
            sc.get("weakness_3", ""),
            ev.get("weakness_paraphrase", ""),
            ev.get("claim_paraphrase", ""),
            ev.get("positive_paraphrase", ""),
            ev.get("negative_paraphrase", ""),
            r.created_at.isoformat() if r.created_at else "",
        ])

    output.seek(0)
    filename = f"study_{study_id}_results.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/studies/{study_id}/report.pdf")
def export_study_report_pdf(
    study_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    study = db.query(models.ExperimentStudy).filter(models.ExperimentStudy.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    results = (
        db.query(models.ExperimentResult)
        .filter(models.ExperimentResult.study_id == study_id)
        .order_by(models.ExperimentResult.created_at.asc())
        .all()
    )

    report_text = _generate_study_report_text(study, results)
    pdf_bytes = _render_simple_pdf(f"Study Report: {study.title}", report_text)
    filename = f"study_{study_id}_report.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Public Link Management (Admin) ──────────────────────────────────────────

@router.post("/studies/{study_id}/public-link", response_model=schemas.PublicLinkOut)
def generate_public_link(
    study_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    """Generate (or rotate) the public join token for a study."""
    study = db.query(models.ExperimentStudy).filter(models.ExperimentStudy.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    token = str(uuid_lib.uuid4()).replace("-", "")
    study.public_token = token  # type: ignore[assignment]
    study.public_link_active = True
    db.commit()
    return schemas.PublicLinkOut(public_token=token)


@router.patch("/studies/{study_id}/public-link/disable", status_code=204)
def disable_public_link(
    study_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    """Disable the public join link while keeping the token."""
    study = db.query(models.ExperimentStudy).filter(models.ExperimentStudy.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    if not study.public_token:
        raise HTTPException(status_code=400, detail="No public link to disable")
    study.public_link_active = False
    db.commit()


@router.patch("/studies/{study_id}/public-link/enable", status_code=204)
def enable_public_link(
    study_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    """Enable an existing public join link token."""
    study = db.query(models.ExperimentStudy).filter(models.ExperimentStudy.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    if not study.public_token:
        raise HTTPException(status_code=400, detail="No public link to enable")
    study.public_link_active = True
    db.commit()


@router.delete("/studies/{study_id}/public-link", status_code=204)
def delete_public_link(
    study_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(admin_required),
):
    """Delete the public join link token entirely."""
    study = db.query(models.ExperimentStudy).filter(models.ExperimentStudy.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    study.public_token = None  # type: ignore[assignment]
    study.public_link_active = False
    db.commit()


# ─── Public Join Flow (no auth) ───────────────────────────────────────────────

@router.get("/public/join/{public_token}", response_model=schemas.PublicStudyInfoOut)
def get_public_study_info(public_token: str, db: Session = Depends(get_db)):
    """Return study title, description, and consent text for the join landing page."""
    study = (
        db.query(models.ExperimentStudy)
        .filter(models.ExperimentStudy.public_token == public_token)
        .first()
    )
    if not study:
        raise HTTPException(status_code=404, detail="Study link not found")
    return schemas.PublicStudyInfoOut(
        title=study.title,
        description=study.description,
        consent_text=study.consent_text,
        instructions_hyve=study.instructions_hyve,
        instructions_traditional=study.instructions_traditional,
        status=study.status,
        public_link_active=bool(study.public_link_active),
    )


@router.post("/public/join/{public_token}", response_model=schemas.PublicJoinOut)
def public_join_study(public_token: str, db: Session = Depends(get_db)):
    """
    Atomically create an invite + participant for a public join link.
    Uses the same balanced platform assignment as admin-generated codes.
    """
    study = (
        db.query(models.ExperimentStudy)
        .filter(models.ExperimentStudy.public_token == public_token)
        .first()
    )
    if not study:
        raise HTTPException(status_code=404, detail="Study link not found")
    if not study.public_link_active:
        raise HTTPException(status_code=403, detail="This public link is inactive")
    if study.status != "active":
        raise HTTPException(status_code=403, detail="This study is not currently accepting participants")

    # Balanced platform assignment (same greedy logic as generate_invites)
    hyve_count = (
        db.query(func.count(models.ExperimentInvite.id))
        .filter(
            models.ExperimentInvite.study_id == study.id,
            models.ExperimentInvite.assigned_platform == "hyve",
        )
        .scalar()
        or 0
    )
    trad_count = (
        db.query(func.count(models.ExperimentInvite.id))
        .filter(
            models.ExperimentInvite.study_id == study.id,
            models.ExperimentInvite.assigned_platform == "traditional",
        )
        .scalar()
        or 0
    )
    assigned_platform = "hyve" if hyve_count <= trad_count else "traditional"

    # Create invite
    code = str(uuid_lib.uuid4()).replace("-", "")[:12].upper()
    invite = models.ExperimentInvite(
        study_id=study.id,
        code=code,
        assigned_platform=assigned_platform,
        used=True,
        used_at=datetime.utcnow(),
    )
    db.add(invite)
    db.flush()  # get invite.id without committing

    # Create participant
    session_token = str(uuid_lib.uuid4())
    participant = models.ExperimentParticipant(
        study_id=study.id,
        invite_id=invite.id,
        session_token=session_token,
        assigned_platform=assigned_platform,
        consent_given_at=datetime.utcnow(),
        started_at=datetime.utcnow(),
    )
    db.add(participant)
    db.commit()

    instructions = (
        study.instructions_hyve if assigned_platform == "hyve" else study.instructions_traditional
    ) or ""

    return schemas.PublicJoinOut(
        invite_code=code,
        session_token=session_token,
        assigned_platform=assigned_platform,
        product_id=study.product_id,
        instructions=instructions,
    )


# ─── Participant Flow (Public, no auth) ───────────────────────────────────────

@router.get("/study/{invite_code}", response_model=schemas.InviteResolveOut)
def resolve_invite(invite_code: str, db: Session = Depends(get_db)):
    invite = (
        db.query(models.ExperimentInvite)
        .filter(models.ExperimentInvite.code == invite_code.upper())
        .first()
    )
    if not invite:
        raise HTTPException(status_code=404, detail="Invite code not found")
    study = invite.study
    instructions = (
        study.instructions_hyve
        if invite.assigned_platform == "hyve"
        else study.instructions_traditional
    ) or ""
    return schemas.InviteResolveOut(
        study_id=study.id,
        product_id=study.product_id,
        title=study.title,
        description=study.description,
        consent_text=study.consent_text,
        assigned_platform=invite.assigned_platform,
        instructions=instructions,
        valid=not invite.used and study.status == "active",
        already_used=invite.used,
        study_status=study.status,
    )


@router.post("/study/{invite_code}/start", response_model=schemas.SessionStartOut)
def start_study_session(invite_code: str, db: Session = Depends(get_db)):
    invite = (
        db.query(models.ExperimentInvite)
        .filter(models.ExperimentInvite.code == invite_code.upper())
        .first()
    )
    if not invite:
        raise HTTPException(status_code=404, detail="Invite code not found")
    if invite.used:
        raise HTTPException(status_code=409, detail="This invite code has already been used")
    study = invite.study
    if study.status != "active":
        raise HTTPException(status_code=403, detail="This study is not currently active")

    session_token = str(uuid_lib.uuid4())
    participant = models.ExperimentParticipant(
        study_id=study.id,
        invite_id=invite.id,
        session_token=session_token,
        assigned_platform=invite.assigned_platform,
        consent_given_at=datetime.utcnow(),
        started_at=datetime.utcnow(),
    )
    invite.used = True
    invite.used_at = datetime.utcnow()
    db.add(participant)
    db.commit()

    instructions = (
        study.instructions_hyve
        if invite.assigned_platform == "hyve"
        else study.instructions_traditional
    ) or ""

    return schemas.SessionStartOut(
        session_token=session_token,
        assigned_platform=invite.assigned_platform,
        product_id=study.product_id,
        instructions=instructions,
    )
