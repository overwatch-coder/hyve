from __future__ import annotations

import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from dotenv import load_dotenv
from sqlalchemy import inspect, text

import models
from database import engine


BASE_DIR = Path(__file__).resolve().parent


def build_alembic_config() -> Config:
    cfg = Config(str(BASE_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BASE_DIR / "alembic"))
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        cfg.set_main_option("sqlalchemy.url", db_url)
    return cfg


def bootstrap_if_needed() -> None:
    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    has_alembic_version = "alembic_version" in table_names

    if has_alembic_version:
        return

    user_tables = [name for name in table_names if name != "alembic_version"]
    cfg = build_alembic_config()

    if not user_tables:
        # Fresh database: create the current schema in full, then stamp HEAD
        # (all migrations are implicitly included via create_all).
        models.Base.metadata.create_all(bind=engine)
        command.stamp(cfg, "head")
    else:
        # Existing legacy database: stamp at the BASELINE revision only.
        # The upgrade() call in run() will then apply all subsequent migrations
        # (e.g. adding new columns introduced after the baseline).
        command.stamp(cfg, "20260425_0001")


def run() -> None:
    load_dotenv()

    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))

    bootstrap_if_needed()

    cfg = build_alembic_config()
    command.upgrade(cfg, "head")


if __name__ == "__main__":
    run()
