"""add experiment result public visibility

Revision ID: 20260429_0001
Revises: 20260427_0002
Create Date: 2026-04-29
"""

from alembic import op
import sqlalchemy as sa


revision = "20260429_0001"
down_revision = "20260427_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "experiment_results",
        sa.Column("exclude_from_public", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("experiment_results", "exclude_from_public", server_default=None)


def downgrade() -> None:
    op.drop_column("experiment_results", "exclude_from_public")
