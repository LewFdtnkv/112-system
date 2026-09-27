"""Personal, expiring study referrals issued with learning recommendations."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0036_learning_referrals"
down_revision = "0035_group_analysis"
branch_labels = depends_on = None


def upgrade():
    op.create_table(
        "learning_referrals",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "message_id",
            sa.Uuid(),
            sa.ForeignKey("teaching_messages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "student_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column(
            "scenario_version_id",
            sa.Uuid(),
            sa.ForeignKey("scenario_versions.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "teacher_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("skill", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("learning", postgresql.JSONB(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "lesson_id", sa.Uuid(), sa.ForeignKey("lessons.id", ondelete="RESTRICT"), unique=True
        ),
        sa.UniqueConstraint("message_id", "skill"),
    )
    op.create_index("ix_learning_referrals_message_id", "learning_referrals", ["message_id"])
    op.create_index("ix_learning_referrals_student_id", "learning_referrals", ["student_id"])


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM learning_referrals")):
        raise RuntimeError("Learning referral history exists; downgrade would lose data")
    op.drop_table("learning_referrals")
