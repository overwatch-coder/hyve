from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    conn.execute(text(
        "ALTER TABLE experiment_studies ADD COLUMN IF NOT EXISTS public_link_active BOOLEAN DEFAULT FALSE"
    ))
    conn.execute(text(
        "UPDATE experiment_studies "
        "SET public_link_active = TRUE "
        "WHERE public_token IS NOT NULL AND public_link_active IS DISTINCT FROM TRUE"
    ))
    conn.commit()

print("Migration complete: public_link_active added to experiment_studies.")
