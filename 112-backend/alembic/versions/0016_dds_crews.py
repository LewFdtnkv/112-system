"""Independent crew assignments; directories are versioned in profile rules."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0016_dds_crews"
down_revision = "0015_card_generation"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "crew_assignments",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "attempt_id",
            sa.UUID(),
            sa.ForeignKey("attempts.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("response_id", sa.UUID(), nullable=False),
        sa.Column("crew_code", sa.String(100), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("crew_number", sa.String(100)),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column(
            "assigned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
        sa.ForeignKeyConstraint(
            ["response_id", "attempt_id"],
            ["service_responses.id", "service_responses.attempt_id"],
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("response_id", "crew_code"),
        sa.CheckConstraint("revision > 0", name="positive_revision"),
        sa.CheckConstraint(
            "status IN ('assigned','responding','arrived','in_progress','completed','cancelled')",
            name="valid_status",
        ),
    )
    op.create_index("ix_crew_assignments_attempt_id", "crew_assignments", ["attempt_id"])
    op.create_index("ix_crew_assignments_response_id", "crew_assignments", ["response_id"])


def downgrade():
    op.drop_table("crew_assignments")
