"""Add admin-reviewed study workflow columns

Revision ID: 20260427_0002
Revises: 20260427_0001
Create Date: 2026-04-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260427_0002"
down_revision: Union[str, Sequence[str], None] = "20260427_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_tables(conn) -> set[str]:
    return set(sa.inspect(conn).get_table_names())


def _existing_cols(conn, table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(conn).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    tables = _existing_tables(bind)

    if "experiment_studies" in tables:
        study_cols = _existing_cols(bind, "experiment_studies")

        if "ground_truth_strengths" not in study_cols:
            op.add_column(
                "experiment_studies",
                sa.Column("ground_truth_strengths", sa.JSON(), nullable=True),
            )

        if "ground_truth_weaknesses" not in study_cols:
            op.add_column(
                "experiment_studies",
                sa.Column("ground_truth_weaknesses", sa.JSON(), nullable=True),
            )

    if "experiment_results" in tables:
        result_cols = _existing_cols(bind, "experiment_results")

        if "participant_helpful" not in result_cols:
            op.add_column(
                "experiment_results",
                sa.Column("participant_helpful", sa.Boolean(), nullable=True),
            )

        if "admin_analysis" not in result_cols:
            op.add_column(
                "experiment_results",
                sa.Column("admin_analysis", sa.JSON(), nullable=True),
            )


def downgrade() -> None:
    bind = op.get_bind()
    tables = _existing_tables(bind)

    if "experiment_results" in tables:
        result_cols = _existing_cols(bind, "experiment_results")

        for column_name in ("admin_analysis", "participant_helpful"):
            if column_name in result_cols:
                op.drop_column("experiment_results", column_name)

    if "experiment_studies" in tables:
        study_cols = _existing_cols(bind, "experiment_studies")

        for column_name in ("ground_truth_weaknesses", "ground_truth_strengths"):
            if column_name in study_cols:
                op.drop_column("experiment_studies", column_name)
