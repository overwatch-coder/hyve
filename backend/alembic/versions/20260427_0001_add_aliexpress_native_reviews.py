"""Add aliexpress_native_reviews table for community reviews on AliExpress products

Revision ID: 20260427_0001
Revises: 20260426_0002
Create Date: 2026-04-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260427_0001"
down_revision: Union[str, Sequence[str], None] = "20260426_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "aliexpress_native_reviews",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("aliexpress_product_item_id", sa.String(), nullable=False),
        sa.Column("device_id", sa.String(), nullable=True),
        sa.Column("author_name", sa.String(), nullable=True),
        sa.Column("star_rating", sa.Float(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["aliexpress_product_item_id"],
            ["aliexpress_products.item_id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "aliexpress_product_item_id",
            "device_id",
            name="uq_aliexpress_native_review_device",
        ),
    )
    op.create_index(
        op.f("ix_aliexpress_native_reviews_id"),
        "aliexpress_native_reviews",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_aliexpress_native_reviews_aliexpress_product_item_id"),
        "aliexpress_native_reviews",
        ["aliexpress_product_item_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_aliexpress_native_reviews_device_id"),
        "aliexpress_native_reviews",
        ["device_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_aliexpress_native_reviews_device_id"),
        table_name="aliexpress_native_reviews",
    )
    op.drop_index(
        op.f("ix_aliexpress_native_reviews_aliexpress_product_item_id"),
        table_name="aliexpress_native_reviews",
    )
    op.drop_index(
        op.f("ix_aliexpress_native_reviews_id"),
        table_name="aliexpress_native_reviews",
    )
    op.drop_table("aliexpress_native_reviews")
