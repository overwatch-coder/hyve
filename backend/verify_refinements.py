
import os
import sys
from sqlalchemy.orm import Session
from database import SessionLocal, engine
import models
from pipeline import cluster_product_claims

def test_pipeline_refinement():
    # Ensure tables exist
    models.Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # 1. Create a dummy product
        product = models.Product(
            name="Test Refinement Product",
            category="Testing",
            status="ready"
        )
        db.add(product)
        db.commit()
        db.refresh(product)
        
        # 2. Add some dummy reviews
        reviews = [
            "The battery life is amazing, lasted 2 days!",
            "Battery is okay, but charging is slow.",
            "Really poor battery performance, drains in 4 hours.",
            "The camera takes stunning photos in daylight.",
            "Low light camera performance is terrible and grainy.",
            "Build quality feels premium and solid.",
            "It feels bit heavy but the metal build is nice.",
            "Screen is bright but has some color shift at angles.",
            "The price is too high for what it offers.",
            "Excellent value for money, highly recommended."
        ]
        
        for text in reviews:
            review = models.Review(
                product_id=product.id,
                original_text=text,
                source="test"
            )
            db.add(review)
        db.commit()
        
        # 3. Trigger claim extraction (manual mock since we don't want to call real LLM for every test run if possible, 
        # but here we want to test the CLUSTERING and RECOMMENDATION logic)
        print(f"DEBUG: Processing claims for product {product.id}...")
        
        # We need to add claims first so they can be clustered
        # In a real run, pipeline.process_review_sync would do this.
        # Here we'll add some mock claims.
        claims_data = [
            {"text": "Battery life is amazing", "polarity": "positive", "severity": 0.1},
            {"text": "Charging is slow", "polarity": "negative", "severity": 0.4},
            {"text": "Drains in 4 hours", "polarity": "negative", "severity": 0.8},
            {"text": "Stunning photos in daylight", "polarity": "positive", "severity": 0.1},
            {"text": "Grainy low light performance", "polarity": "negative", "severity": 0.6},
            {"text": "Build quality feels premium", "polarity": "positive", "severity": 0.2},
            {"text": "Feels bit heavy", "polarity": "neutral", "severity": 0.3},
            {"text": "Metal build is nice", "polarity": "positive", "severity": 0.2},
            {"text": "Screen is bright", "polarity": "positive", "severity": 0.1},
            {"text": "Color shift at angles", "polarity": "negative", "severity": 0.5},
            {"text": "Too high price", "polarity": "negative", "severity": 0.7},
            {"text": "Excellent value for money", "polarity": "positive", "severity": 0.1}
        ]
        
        for c in claims_data:
            claim = models.Claim(
                review_id=1, # just as placeholder
                claim_text=c["text"],
                sentiment_polarity=c["polarity"],
                severity=c["severity"]
            )
            # Link to the product reviews manually for clustering
            # Actually cluster_product_claims looks at claims joined with reviews for product_id
            # So we need to link them to the real reviews we created
            
        # Let's just use the existing reviews
        db_reviews = db.query(models.Review).filter(models.Review.product_id == product.id).all()
        for i, r in enumerate(db_reviews):
            # Give each review 1-2 claims
            for j in range(2):
                idx = (i * 2 + j) % len(claims_data)
                claim = models.Claim(
                    review_id=r.id,
                    claim_text=claims_data[idx]["text"],
                    sentiment_polarity=claims_data[idx]["polarity"],
                    severity=claims_data[idx]["severity"]
                )
                db.add(claim)
        db.commit()

        # 4. Run clustering and recommendation generation
        print("DEBUG: Running cluster_product_claims with Mock LLM Data...")
        
        # Inject mock theme naming/recommendation results
        mock_theme_names = {
            0: {"name": "Battery Performance", "recommendation": "Improve efficiency for high-drain tasks."},
            1: {"name": "Build & Weight", "recommendation": "Optimize material density to reduce overall mass."},
            2: {"name": "Camera Optics", "recommendation": "Enhance low-light sensor processing."},
            3: {"name": "Display Quality", "recommendation": "Calibrate panels to minimize off-angle shift."},
            4: {"name": "Market Value", "recommendation": "Consider bundling accessories to justify high price point."}
        }
        
        # Monkey patch pipeline._generate_theme_names for the test
        import pipeline
        original_gen = pipeline._generate_theme_names
        pipeline._generate_theme_names = lambda x: mock_theme_names
        
        try:
            result = cluster_product_claims(product.id, db)
            print(f"DEBUG: Result: {result}")
        finally:
            pipeline._generate_theme_names = original_gen
        
        # 5. Verify Themes and Recommendations
        themes = db.query(models.Theme).filter(models.Theme.product_id == product.id).all()
        print(f"DEBUG: Generated {len(themes)} themes.")
        
        for theme in themes:
            print(f"Theme: {theme.name}")
            print(f"  Ratio: {theme.positive_ratio}")
            print(f"  Rec: {theme.recommendation}")
            assert theme.recommendation is not None or len(themes) == 0
            
        assert 1 <= len(themes) <= 6
        
        print("SUCCESS: Backend refinement verified.")
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # Cleanup
        # db.query(models.Product).filter(models.Product.id == product.id).delete()
        # db.commit()
        db.close()

if __name__ == "__main__":
    test_pipeline_refinement()
