import json
from typing import Any
from database import SessionLocal
from models import ExperimentResult
from experiment_scoring import score_similarity

def backfill_experiment_review_status():
    print("Starting backfill for ExperimentResult review statuses...")
    db = SessionLocal()
    try:
        results = db.query(ExperimentResult).all()
        updated_count = 0
        for row in results:
            result: Any = row
            if not result.evidence:
                continue

            evidence_data = result.evidence
            if isinstance(evidence_data, str):
                try:
                    evidence_data = json.loads(evidence_data)
                except json.JSONDecodeError:
                    continue

            if not isinstance(evidence_data, dict):
                continue
            
            similarity_scores = result.similarity_scores or {}
            if isinstance(similarity_scores, str):
                similarity_scores = json.loads(similarity_scores)
            if not isinstance(similarity_scores, dict):
                similarity_scores = dict(similarity_scores)
                
            source_texts = evidence_data.get("source_texts", {})
            platform = result.platform
            
            fields_to_check = []
            refs_to_check = []
            if platform == "traditional":
                fields_to_check = ["negative_paraphrase", "positive_paraphrase"]
                refs_to_check = ["negative_ref", "positive_ref"]
            elif platform == "hyve":
                fields_to_check = ["weakness_paraphrase", "claim_paraphrase", "strategy_paraphrase"]
                refs_to_check = ["weakness_ref", "claim_ref", "strategy_ref"]

            auto_reject = False
            for field, ref_key in zip(fields_to_check, refs_to_check):
                phr = evidence_data.get(field, "")
                if not phr: phr = ""
                
                src = source_texts.get(ref_key, "")
                if src and phr:
                    score = score_similarity(phr, src)
                    similarity_scores[field] = score
                    if score < 0.55:
                        auto_reject = True
            
            new_status = "rejected" if auto_reject else "approved"
            
            # If word count is low etc., handled when saved, but here we just do basic similarity
            
            # check if there's any update
            needs_update = False
            if result.review_status != new_status:
                result.review_status = new_status
                needs_update = True
                
            if result.similarity_scores != similarity_scores:
                result.similarity_scores = similarity_scores
                needs_update = True
                
            if needs_update:
                updated_count += 1
                
        if updated_count > 0:
            db.commit()
        print(f"Backfill completed. Updated {updated_count} records.")
    except Exception as e:
        print(f"Error during backfill: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    backfill_experiment_review_status()
