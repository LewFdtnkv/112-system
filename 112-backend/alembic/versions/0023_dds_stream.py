"""DDS arrival schedules and personal lesson execution clocks."""

import sqlalchemy as sa
from alembic import op

revision = "0023_dds_stream"
down_revision = "0022_semantic_assessment"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "scenario_cards",
        sa.Column("arrival_offset_seconds", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_check_constraint("arrival_offset", "scenario_cards", "arrival_offset_seconds >= 0")
    op.execute(
        "UPDATE scenario_cards c SET arrival_offset_seconds = (position - 1) * 60 "
        "FROM scenario_versions v WHERE v.id = c.scenario_version_id AND v.role = 'dds'"
    )
    for name in ("scheduled_at", "released_at"):
        op.add_column("assignments", sa.Column(name, sa.DateTime(timezone=True), nullable=True))
    for name in ("first_opened_at", "first_response_at"):
        op.add_column("attempts", sa.Column(name, sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "lesson_executions",
        sa.Column(
            "lesson_id",
            sa.Uuid(),
            sa.ForeignKey("lessons.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column(
            "student_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "active_attempt_id",
            sa.Uuid(),
            sa.ForeignKey("attempts.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )


def downgrade():
    op.drop_table("lesson_executions")
    for name in ("first_response_at", "first_opened_at"):
        op.drop_column("attempts", name)
    for name in ("released_at", "scheduled_at"):
        op.drop_column("assignments", name)
    op.drop_constraint("ck_scenario_cards_arrival_offset", "scenario_cards", type_="check")
    op.drop_column("scenario_cards", "arrival_offset_seconds")
