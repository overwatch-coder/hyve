import models
from database import engine, SessionLocal

def reset_db():
    print("Resetting database...")
    # Drop all tables
    models.Base.metadata.drop_all(bind=engine)
    print("Dropped all tables.")
    
    # Recreate all tables
    models.Base.metadata.create_all(bind=engine)
    print("Recreated all tables.")
    
    # Optionally seed with initial structure if needed
    # (But ingest_reviews.py will do most of the work)
    print("Database reset complete.")

if __name__ == "__main__":
    reset_db()
