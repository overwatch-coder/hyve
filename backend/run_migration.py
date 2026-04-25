from database import engine
from sqlalchemy import text
with engine.connect() as conn:
    conn.execute(text("ALTER TABLE experiment_results ADD COLUMN IF NOT EXISTS evidence JSON"))
    conn.execute(text("ALTER TABLE experiment_results ADD COLUMN IF NOT EXISTS similarity_scores JSON"))
    conn.execute(text("ALTER TABLE experiment_results ADD COLUMN IF NOT EXISTS review_status VARCHAR DEFAULT 'approved'"))
    conn.execute(text("ALTER TABLE experiment_results ADD COLUMN IF NOT EXISTS review_notes VARCHAR"))
    conn.execute(text("ALTER TABLE experiment_results ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR"))
    conn.execute(text("ALTER TABLE experiment_results ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP"))
    conn.execute(text("ALTER TABLE experiment_results ADD COLUMN IF NOT EXISTS study_id INTEGER REFERENCES experiment_studies(id) ON DELETE SET NULL"))
    conn.execute(text("ALTER TABLE experiment_results ADD COLUMN IF NOT EXISTS participant_id INTEGER REFERENCES experiment_participants(id) ON DELETE SET NULL"))
    conn.execute(text("ALTER TABLE experiment_results ADD COLUMN IF NOT EXISTS confidence_rating INTEGER"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_experiment_results_study_id ON experiment_results(study_id)"))
    conn.commit()
print("Migration complete.")
