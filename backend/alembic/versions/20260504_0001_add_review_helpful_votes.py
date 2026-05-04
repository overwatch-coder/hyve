"""add helpful votes to hyve reviews

Revision ID: 20260504_0001
Revises: 20260429_0001
Create Date: 2026-05-04
"""

from alembic import op
import sqlalchemy as sa


revision = "20260504_0001"
down_revision = "20260429_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reviews",
        sa.Column("helpful_votes", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column("reviews", "helpful_votes", server_default=None)
    op.create_index(
        "ix_reviews_product_helpful_created",
        "reviews",
        ["product_id", "helpful_votes", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_reviews_product_helpful_created", table_name="reviews")
    op.drop_column("reviews", "helpful_votes")
