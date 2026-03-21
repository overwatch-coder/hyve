import models
from database import engine, SessionLocal
from index import batch_ingest_reviews
from schemas import BatchIngestRequest, BatchReviewItem
from ingest_reviews import EARBUDS_REVIEWS, DESK_REVIEWS, MEALKIT_REVIEWS

def reset_db():
    print("=" * 60)
    print("HYVE — INTERNAL DATABASE INITIALIZATION")
    print("=" * 60)
    
    print("\n-> Initializing tables...")
    models.Base.metadata.create_all(bind=engine)
    print("  [OK] Tables initialized safely.")
    
    db = SessionLocal()
    try:
        if db.query(models.Product).first():
            print("\n  [SKIP] Existing data detected. Database is already initialized.")
            print("  Aborting seed process to protect production records.")
            return

        products_and_reviews = [
            ("ProBuds ANC 500", "Electronics", EARBUDS_REVIEWS),
            ("ErgoRise Standing Desk", "Furniture", DESK_REVIEWS),
            ("FreshPlate Meal Kit", "Food & Delivery", MEALKIT_REVIEWS),
        ]

        for name, category, reviews_data in products_and_reviews:
            print(f"\n-> Seeding Product: {name} ({category})")
            
            # Create product via direct DB call
            product = models.Product(
                name=name, 
                category=category, 
                status="processing", 
                ingest_type="batch"
            )
            db.add(product)
            db.commit()
            db.refresh(product)
            print(f"  [OK] Product created (ID: {product.id})")
            
            # Prepare payload for the internal ingestion function
            print(f"  -> Processing {len(reviews_data)} reviews via AI pipeline...")
            payload = BatchIngestRequest(
                reviews=[BatchReviewItem(**r) for r in reviews_data]
            )
            
            # Call the internal function from index.py directly (no HTTP needed)
            batch_ingest_reviews(product.id, payload, db)
            
            # Mark ready
            product.status = "ready"
            product.processing_step = "Analysis Complete"
            db.commit()
            print(f"  [OK] Analysis and clustering complete.")

        print("\n" + "=" * 60)
        print("DATABASE INITIALIZATION SUCCESSFUL")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n[CRITICAL ERROR] Seeding failed: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    reset_db()
