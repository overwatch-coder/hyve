import os
from dotenv import load_dotenv
load_dotenv()

from celery import Celery
from database import SessionLocal
import models
from ai_engine import extract_claims_from_llm, cluster_claims

# Use redis running on localhost by default
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "hyve_worker",
    broker=REDIS_URL,
    backend=REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

@celery_app.task
def process_review_ai_task(review_id: int):
    """
    Background task to process a single review.
    1. Extracts claims using LLM.
    2. Embeds claims and assigns themes.
    3. Calculates sentiment and severity.
    4. Saves to database.
    """
    print(f"Starting AI processing for review {review_id}")
    db = SessionLocal()
    
    try:
        # 1. Fetch review from DB
        review = db.query(models.Review).filter(models.Review.id == review_id).first()
        if not review:
            print(f"Review {review_id} not found.")
            return {"status": "error", "message": "Review not found"}
            
        # 2. Call LLM for extraction
        provider = os.getenv("LLM_PROVIDER", "openai")
        print(f"Extracting claims using {provider}...")
        try:
            extraction_result = extract_claims_from_llm(review.original_text, provider)
            claims_data = extraction_result.get("claims", [])
        except Exception as e:
            print(f"LLM Extraction failed: {e}")
            return {"status": "error", "message": f"LLM Extraction failed: {str(e)}"}
            
        if not claims_data:
            print(f"No claims extracted for review {review_id}")
            return {"status": "success", "message": "No claims extracted"}
            
        # 3. Save extracted claims to DB
        saved_claims = []
        for claim_dict in claims_data:
            new_claim = models.Claim(
                review_id=review.id,
                claim_text=claim_dict.get("claim_text", ""),
                evidence_text=claim_dict.get("evidence_text", ""),
                context_text=claim_dict.get("context_text", ""),
                sentiment_polarity=claim_dict.get("sentiment_polarity", "neutral"),
                severity=float(claim_dict.get("severity", 0.0))
            )
            db.add(new_claim)
            db.flush() # flush to get claim id
            saved_claims.append(new_claim)
            
        db.commit()
        
        # 4. Trigger clustering (In a real scenario, clustering might run per product periodically rather than per review. 
        # For this prototype, we'll demonstrate the sentence-transformer logic on the newly extracted claims).
        claims_texts = [c.claim_text for c in saved_claims if c.claim_text]
        if claims_texts:
            cluster_labels = cluster_claims(claims_texts)
            
            # Map clusters to Themes (Simplified prototype logic: generate a theme name for each unique cluster, like "Theme X")
            unique_clusters = set(cluster_labels)
            theme_mapping = {}
            for cid in unique_clusters:
                theme = models.Theme(
                    product_id=review.product_id,
                    name=f"Theme Cluster {cid}",
                    claim_count=0
                )
                db.add(theme)
                db.flush()
                theme_mapping[cid] = theme
                
            # Assign clusters back to claims
            for claim, cluster_id in zip(saved_claims, cluster_labels):
                claim.theme_id = theme_mapping[cluster_id].id
                theme_mapping[cluster_id].claim_count += 1
                if claim.sentiment_polarity == "positive":
                    theme_mapping[cluster_id].positive_ratio += 1.0 # Will normalize later
                    
            db.commit()
            
        print(f"Finished AI processing for review {review_id}")
        return {"status": "success", "review_id": review_id, "claims_extracted": len(claims_data)}
        
    finally:
        db.close()
