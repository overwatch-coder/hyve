"""Add AliExpress product and review tables for RapidAPI integration

Revision ID: 20260426_0002
Revises: 20260426_0001
Create Date: 2026-04-26

Creates three new tables:
  - aliexpress_categories: caches category data from RapidAPI
  - aliexpress_products: caches product metadata (itemId, title, price, rating, etc.)
  - aliexpress_reviews: caches reviews fetched from RapidAPI
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260426_0002"
down_revision: Union[str, Sequence[str], None] = "20260426_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create aliexpress_categories table
    op.create_table(
        "aliexpress_categories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("rapidapi_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("url", sa.String(), nullable=True),
        sa.Column("has_children", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("rapidapi_id", name="uq_aliexpress_categories_rapidapi_id"),
    )
    op.create_index("ix_aliexpress_categories_rapidapi_id", "aliexpress_categories", ["rapidapi_id"], unique=True)

    # Create aliexpress_products table
    op.create_table(
        "aliexpress_products",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("brand", sa.String(), nullable=True),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("image_url", sa.String(), nullable=True),
        sa.Column("price", sa.Float(), nullable=True),
        sa.Column("promotion_price", sa.Float(), nullable=True),
        sa.Column("rating", sa.Float(), nullable=True),
        sa.Column("sales_count", sa.Integer(), nullable=True),
        sa.Column("free_shipping", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("shipping_fee", sa.Float(), nullable=True),
        sa.Column("aliexpress_url", sa.String(), nullable=True),
        sa.Column("search_index", sa.String(), nullable=True),
        sa.Column("cached_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("item_id", name="uq_aliexpress_products_item_id"),
    )
    op.create_index("ix_aliexpress_products_item_id", "aliexpress_products", ["item_id"], unique=True)
    op.create_index("ix_aliexpress_products_search_index", "aliexpress_products", ["search_index"])

    # Create aliexpress_reviews table
    op.create_table(
        "aliexpress_reviews",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("aliexpress_product_item_id", sa.String(), nullable=False),
        sa.Column("rapidapi_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("rating", sa.Float(), nullable=False),
        sa.Column("reviewer_name", sa.String(), nullable=True),
        sa.Column("helpful_votes", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["aliexpress_product_item_id"],
            ["aliexpress_products.item_id"],
            name="fk_aliexpress_reviews_product_item_id",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("rapidapi_id", name="uq_aliexpress_reviews_rapidapi_id"),
    )
    op.create_index("ix_aliexpress_reviews_aliexpress_product_item_id", "aliexpress_reviews", ["aliexpress_product_item_id"])
    op.create_index("ix_aliexpress_reviews_rapidapi_id", "aliexpress_reviews", ["rapidapi_id"], unique=True)


def downgrade() -> None:
    # Drop indexes and tables in reverse order
    op.drop_index("ix_aliexpress_reviews_rapidapi_id", table_name="aliexpress_reviews")
    op.drop_index("ix_aliexpress_reviews_aliexpress_product_item_id", table_name="aliexpress_reviews")
    op.drop_table("aliexpress_reviews")

    op.drop_index("ix_aliexpress_products_search_index", table_name="aliexpress_products")
    op.drop_index("ix_aliexpress_products_item_id", table_name="aliexpress_products")
    op.drop_table("aliexpress_products")

    op.drop_index("ix_aliexpress_categories_rapidapi_id", table_name="aliexpress_categories")
    op.drop_table("aliexpress_categories")
