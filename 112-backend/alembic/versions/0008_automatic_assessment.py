"""Persist automatic grades and their evidence without replacing manual history."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0008_automatic_assessment"
down_revision = "0007_exclusive_user_role"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "lesson_evaluations",
        sa.Column("method", sa.String(20), nullable=False, server_default="teacher"),
    )
    op.add_column(
        "lesson_evaluations",
        sa.Column("assessment_details", postgresql.JSONB(none_as_null=True), nullable=True),
    )
    op.alter_column("lesson_evaluations", "reviewer_id", nullable=True)
    op.create_check_constraint("method", "lesson_evaluations", "method IN ('rules', 'teacher')")
    op.create_check_constraint(
        "reviewer_method",
        "lesson_evaluations",
        "(method = 'teacher' AND reviewer_id IS NOT NULL) OR "
        "(method = 'rules' AND reviewer_id IS NULL)",
    )
    op.add_column(
        "evaluations",
        sa.Column("context_snapshot", postgresql.JSONB(), nullable=False, server_default="{}"),
    )


def downgrade():
    # Automatic records cannot be converted into teacher decisions without losing provenance.
    count = (
        op.get_bind()
        .execute(sa.text("SELECT count(*) FROM lesson_evaluations WHERE method = 'rules'"))
        .scalar()
    )
    if count:
        raise RuntimeError("Automatic grades exist; downgrade requires an explicit data migration")
    op.drop_column("evaluations", "context_snapshot")
    op.drop_constraint(
        op.f("ck_lesson_evaluations_reviewer_method"), "lesson_evaluations", type_="check"
    )
    op.drop_constraint(op.f("ck_lesson_evaluations_method"), "lesson_evaluations", type_="check")
    op.alter_column("lesson_evaluations", "reviewer_id", nullable=False)
    op.drop_column("lesson_evaluations", "assessment_details")
    op.drop_column("lesson_evaluations", "method")
