from database import engine
from sqlalchemy import text
with engine.connect() as conn:
    conn.execute(text("ALTER TABLE experiment_results ADD COLUMN IF NOT EXISTS evidence JSON"))
    conn.execute(text("ALTER TABLE experiment_results ADD COLUMN IF NOT EXISTS similarity_scores JSON"))
    conn.execute(text("ALTER TABLE experiment_results ADD COLUMN IF NOT EXISTS review_status VARCHAR DEFAULT 'approved'"))
    conn.execute(text("ALTER TABLE experiment_results ADD COLUMN IF NOT EXISTS review_notes VARCHAR"))
    conn.execute(text("ALTER TABLE experiment_results ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR"))
    conn.execute(text("ALTER TABLE experiment_results ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP"))
    conn.commit()
