"""add teacher lesson evaluations

Revision ID: 0005_lesson_evaluations
Revises: 0004_teacher_authoring
Create Date: 2026-09-19 00:26:31.631344
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_lesson_evaluations"
down_revision: str | None = "0004_teacher_authoring"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "lesson_evaluations",
        sa.Column("lesson_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("reviewer_id", sa.Uuid(), nullable=False),
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("supersedes_id", sa.Uuid(), nullable=True),
        sa.Column("score", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("max_score", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "length(btrim(comment)) > 0", name=op.f("ck_lesson_evaluations_comment_required")
        ),
        sa.CheckConstraint("revision > 0", name=op.f("ck_lesson_evaluations_positive_revision")),
        sa.CheckConstraint(
            "score >= 0 AND max_score > 0 AND score <= max_score",
            name=op.f("ck_lesson_evaluations_score_range"),
        ),
        sa.CheckConstraint(
            "supersedes_id IS NULL OR supersedes_id != id",
            name=op.f("ck_lesson_evaluations_not_own_predecessor"),
        ),
        sa.ForeignKeyConstraint(
            ["lesson_id"],
            ["lessons.id"],
            name=op.f("fk_lesson_evaluations_lesson_id_lessons"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["reviewer_id"],
            ["users.id"],
            name=op.f("fk_lesson_evaluations_reviewer_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["student_id"],
            ["users.id"],
            name=op.f("fk_lesson_evaluations_student_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["supersedes_id", "lesson_id", "student_id"],
            [
                "lesson_evaluations.id",
                "lesson_evaluations.lesson_id",
                "lesson_evaluations.student_id",
            ],
            name=op.f("fk_lesson_evaluations_supersedes_id_lesson_evaluations"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_lesson_evaluations")),
        sa.UniqueConstraint("id", "lesson_id", "student_id", name=op.f("uq_lesson_evaluations_id")),
        sa.UniqueConstraint(
            "lesson_id", "student_id", "request_id", name="uq_lesson_evaluations_request"
        ),
        sa.UniqueConstraint(
            "lesson_id", "student_id", "revision", name=op.f("uq_lesson_evaluations_lesson_id")
        ),
    )
    op.create_index(
        op.f("ix_lesson_evaluations_reviewer_id"),
        "lesson_evaluations",
        ["reviewer_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_lesson_evaluations_student_id"), "lesson_evaluations", ["student_id"], unique=False
    )
    op.create_index(
        op.f("ix_lesson_evaluations_supersedes_id"),
        "lesson_evaluations",
        ["supersedes_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_lesson_evaluations_supersedes_id"), table_name="lesson_evaluations")
    op.drop_index(op.f("ix_lesson_evaluations_student_id"), table_name="lesson_evaluations")
    op.drop_index(op.f("ix_lesson_evaluations_reviewer_id"), table_name="lesson_evaluations")
    op.drop_table("lesson_evaluations")
