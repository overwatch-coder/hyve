import models
from database import engine
from ingest_reviews import main as ingest_reviews_main

def reset_db():
    print("Resetting database...")
    # Drop all tables
    models.Base.metadata.drop_all(bind=engine)
    print("Dropped all tables.")
    
    # Recreate all tables
    models.Base.metadata.create_all(bind=engine)
    print("Recreated all tables.")
    
    # Seed with initial structure if needed (Using python seed.py) if you don't have api keys
    # But ingest_reviews.py will do most of the work if you have api keys
    ingest_reviews_main()
    print("Database reset and seeded complete.")

if __name__ == "__main__":
    reset_db()
