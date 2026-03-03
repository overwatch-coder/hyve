import os
import json
from sqlalchemy.orm import Session
from database import SessionLocal, engine
import models
import datetime

def seed():
    # Make sure tables exist
    models.Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    try:
        # Check if we already have products
        if db.query(models.Product).count() > 0:
            print("Database already seeded.")
            return

        print("Seeding database with sample data...")

        # 1. Create a Product
        product1 = models.Product(
            name="Smartphone X",
            category="Electronics",
            overall_sentiment_score=0.45
        )
        db.add(product1)
        db.flush()
        
        # 2. Create Themes
        theme_battery = models.Theme(
            product_id=product1.id,
            name="Battery Life",
            positive_ratio=0.3,
            claim_count=2
        )
        theme_camera = models.Theme(
            product_id=product1.id,
            name="Camera Quality",
            positive_ratio=0.8,
            claim_count=2
        )
        db.add(theme_battery)
        db.add(theme_camera)
        db.flush()

        # 3. Create Reviews & Claims
        
        review1 = models.Review(
            product_id=product1.id,
            original_text="The battery life is really poor, it barely lasts 5 hours on a full charge. The camera is amazing though, especially for portraits.",
            star_rating=3.0,
            source="Manual Seed"
        )
        db.add(review1)
        db.flush()

        claim1 = models.Claim(
            review_id=review1.id,
            theme_id=theme_battery.id,
            claim_text="Battery lasts only 5 hours",
            evidence_text="barely lasts 5 hours on a full charge",
            context_text="General use",
            sentiment_polarity="negative",
            severity=0.8
        )
        claim2 = models.Claim(
            review_id=review1.id,
            theme_id=theme_camera.id,
            claim_text="Great portrait camera",
            evidence_text="camera is amazing though, especially for portraits",
            context_text="Photography",
            sentiment_polarity="positive",
            severity=0.0
        )
        
        db.add(claim1)
        db.add(claim2)
        
        db.commit()
        print("Done seeding database!")

    except Exception as e:
        print(f"Error seeding database: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed()
