"""baseline schema marker

Revision ID: 20260425_0001
Revises: 
Create Date: 2026-04-25
"""
from typing import Sequence, Union

from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = "20260425_0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Baseline revision: existing databases are stamped to this revision.
    # New/empty databases are bootstrapped by backend/migrate.py using SQLAlchemy metadata.
    pass


def downgrade() -> None:
    pass
