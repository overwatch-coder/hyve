"""add experiment study tables and public link columns

Revision ID: 20260426_0001
Revises: 20260425_0001
Create Date: 2026-04-26

Handles two scenarios:
  A) experiment_studies table is missing entirely (legacy DB without study feature)
     → creates experiment_studies, experiment_invites, experiment_participants in full
  B) experiment_studies exists but is missing public_token / public_link_active
     → adds only the missing columns
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260426_0001"
down_revision: Union[str, Sequence[str], None] = "20260425_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_tables(conn) -> set:
    return set(sa.inspect(conn).get_table_names())


def _existing_cols(conn, table: str) -> set:
    return {c["name"] for c in sa.inspect(conn).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    tables = _existing_tables(bind)

    if "experiment_studies" not in tables:
        # ── Scenario A: create all three study-related tables from scratch ──
        op.create_table(
            "experiment_studies",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=False),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("consent_text", sa.Text(), nullable=True),
            sa.Column("instructions_hyve", sa.Text(), nullable=True),
            sa.Column("instructions_traditional", sa.Text(), nullable=True),
            sa.Column("status", sa.String(), server_default="draft", nullable=False),
            sa.Column("public_token", sa.String(), nullable=True, unique=True),
            sa.Column("public_link_active", sa.Boolean(), nullable=False,
                      server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_experiment_studies_public_token", "experiment_studies",
                        ["public_token"], unique=True)

    else:
        # ── Scenario B: table exists — add only missing columns ──
        cols = _existing_cols(bind, "experiment_studies")

        if "public_token" not in cols:
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

        if "public_link_active" not in cols:
            op.add_column(
                "experiment_studies",
                sa.Column(
                    "public_link_active",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.text("false"),
                ),
            )

    if "experiment_invites" not in tables:
        op.create_table(
            "experiment_invites",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("study_id", sa.Integer(),
                      sa.ForeignKey("experiment_studies.id"), nullable=False),
            sa.Column("code", sa.String(), nullable=False, unique=True),
            sa.Column("assigned_platform", sa.String(), nullable=False),
            sa.Column("used", sa.Boolean(), server_default=sa.text("false"), nullable=False),
            sa.Column("used_at", sa.DateTime(), nullable=True),
            sa.Column("participant_email", sa.String(), nullable=True),
            sa.Column("email_sent", sa.Boolean(), server_default=sa.text("false"), nullable=False),
            sa.Column("email_sent_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_experiment_invites_code", "experiment_invites", ["code"], unique=True)
        op.create_index("ix_experiment_invites_participant_email",
                        "experiment_invites", ["participant_email"])

    if "experiment_participants" not in tables:
        op.create_table(
            "experiment_participants",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("study_id", sa.Integer(),
                      sa.ForeignKey("experiment_studies.id"), nullable=False),
            sa.Column("invite_id", sa.Integer(),
                      sa.ForeignKey("experiment_invites.id"), nullable=False, unique=True),
            sa.Column("session_token", sa.String(), nullable=False, unique=True),
            sa.Column("assigned_platform", sa.String(), nullable=False),
            sa.Column("consent_given_at", sa.DateTime(), nullable=True),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("completed", sa.Boolean(), server_default=sa.text("false"), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_experiment_participants_session_token",
                        "experiment_participants", ["session_token"], unique=True)

    # ── Patch experiment_results: add study-linkage columns if missing ──
    if "experiment_results" in _existing_tables(bind):
        result_cols = _existing_cols(bind, "experiment_results")

        if "study_id" not in result_cols:
            op.add_column(
                "experiment_results",
                sa.Column("study_id", sa.Integer(),
                          sa.ForeignKey("experiment_studies.id"), nullable=True),
            )
            op.create_index("ix_experiment_results_study_id",
                            "experiment_results", ["study_id"])

        if "participant_id" not in result_cols:
            op.add_column(
                "experiment_results",
                sa.Column("participant_id", sa.Integer(),
                          sa.ForeignKey("experiment_participants.id"), nullable=True, unique=True),
            )

        if "confidence_rating" not in result_cols:
            op.add_column(
                "experiment_results",
                sa.Column("confidence_rating", sa.Integer(), nullable=True),
            )

        if "review_notes" not in result_cols:
            op.add_column(
                "experiment_results",
                sa.Column("review_notes", sa.Text(), nullable=True),
            )

        if "reviewed_by" not in result_cols:
            op.add_column(
                "experiment_results",
                sa.Column("reviewed_by", sa.String(), nullable=True),
            )

        if "reviewed_at" not in result_cols:
            op.add_column(
                "experiment_results",
                sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            )


def downgrade() -> None:
    bind = op.get_bind()
    tables = _existing_tables(bind)

    if "experiment_participants" in tables:
        op.drop_table("experiment_participants")

    if "experiment_invites" in tables:
        op.drop_table("experiment_invites")

    if "experiment_studies" in tables:
        op.drop_index("ix_experiment_studies_public_token", table_name="experiment_studies")
        try:
            op.drop_constraint("uq_experiment_studies_public_token",
                               "experiment_studies", type_="unique")
        except Exception:
            pass
        op.drop_column("experiment_studies", "public_token")
        op.drop_column("experiment_studies", "public_link_active")
