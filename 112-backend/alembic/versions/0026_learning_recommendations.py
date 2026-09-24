"""Learning recommendations and a separate methodology corpus."""

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision = "0026_learning_recommendations"
down_revision = "0025_rag_preferences"
branch_labels = depends_on = None


def upgrade():
    op.drop_constraint(op.f("ck_ai_jobs_ai_purpose"), "ai_jobs", type_="check")
    op.alter_column("ai_jobs", "purpose", type_=sa.String(14))
    op.create_check_constraint(
        op.f("ck_ai_jobs_ai_purpose"),
        "ai_jobs",
        "purpose IN ('generation', 'evaluation', 'recommendation')",
    )
    op.add_column(
        "ai_jobs",
        sa.Column("student_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="RESTRICT")),
    )
    op.create_index("ix_ai_jobs_student_id", "ai_jobs", ["student_id"])
    op.create_check_constraint(
        "recommendation_target", "ai_jobs", "purpose != 'recommendation' OR student_id IS NOT NULL"
    )
    op.alter_column("teaching_messages", "teacher_id", nullable=True)
    op.add_column(
        "teaching_messages",
        sa.Column("source", sa.String(30), nullable=False, server_default="teacher"),
    )
    op.add_column(
        "teaching_messages", sa.Column("ai_job_id", sa.Uuid(), sa.ForeignKey("ai_jobs.id"))
    )
    op.create_unique_constraint(
        "uq_teaching_messages_ai_job_id", "teaching_messages", ["ai_job_id"]
    )
    op.add_column(
        "teaching_messages",
        sa.Column("details", postgresql.JSONB(), nullable=False, server_default="{}"),
    )
    op.create_check_constraint(
        "sender",
        "teaching_messages",
        "(source = 'teacher' AND teacher_id IS NOT NULL AND ai_job_id IS "
        "NULL) OR (source = 'learning_advice' AND teacher_id IS NULL AND ai_job_id IS NOT NULL)",
    )
    op.create_table(
        "learning_guides",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("version", sa.String(40), nullable=False),
        sa.Column("skill", sa.String(40), nullable=False),
        sa.Column("strategy", sa.String(40), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("embedding", Vector(1024)),
        sa.Column("embedding_model", sa.String(255)),
    )
    op.create_index("ix_learning_guides_skill", "learning_guides", ["skill"])


def downgrade():
    raise RuntimeError("Recommendation history must be exported before a destructive downgrade")
