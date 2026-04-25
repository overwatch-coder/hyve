from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    conn.execute(text(
        "ALTER TABLE experiment_studies ADD COLUMN IF NOT EXISTS public_token VARCHAR"
    ))
    conn.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_experiment_studies_public_token "
        "ON experiment_studies(public_token) WHERE public_token IS NOT NULL"
    ))
    conn.commit()

print("Migration complete: public_token added to experiment_studies.")
