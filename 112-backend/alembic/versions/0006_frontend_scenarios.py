"""Preserve scenario editor fields without changing published compositions."""

import sqlalchemy as sa
from alembic import op

revision = "0006_frontend_scenarios"
down_revision = "0005_lesson_evaluations"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "scenario_versions",
        sa.Column("category", sa.String(255), server_default="", nullable=False),
    )
    op.add_column(
        "scenario_versions",
        sa.Column("duration_minutes", sa.Integer(), server_default="15", nullable=False),
    )
    op.add_column(
        "scenario_versions",
        sa.Column("norm_seconds", sa.Integer(), server_default="30", nullable=False),
    )


def downgrade():
    op.drop_column("scenario_versions", "norm_seconds")
    op.drop_column("scenario_versions", "duration_minutes")
    op.drop_column("scenario_versions", "category")
