"""add public_token and public_link_active to experiment_studies

Revision ID: 20260426_0001
Revises: 20260425_0001
Create Date: 2026-04-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260426_0001"
down_revision: Union[str, Sequence[str], None] = "20260425_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add public_token column (nullable, unique) — used for public join links
    op.add_column(
        "experiment_studies",
        sa.Column("public_token", sa.String(), nullable=True),
    )
    op.create_unique_constraint(
        "uq_experiment_studies_public_token",
        "experiment_studies",
        ["public_token"],
    )
    op.create_index(
        "ix_experiment_studies_public_token",
        "experiment_studies",
        ["public_token"],
        unique=True,
    )

    # Add public_link_active column (non-nullable, defaults to False)
    op.add_column(
        "experiment_studies",
        sa.Column(
            "public_link_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_index("ix_experiment_studies_public_token", table_name="experiment_studies")
    op.drop_constraint(
        "uq_experiment_studies_public_token",
        "experiment_studies",
        type_="unique",
    )
    op.drop_column("experiment_studies", "public_token")
    op.drop_column("experiment_studies", "public_link_active")
