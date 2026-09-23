"""Allow traceable hybrid lesson grades without changing historical grades."""

import sqlalchemy as sa
from alembic import op

revision = "0022_semantic_assessment"
down_revision = "0021_telephony"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint(op.f("ck_lesson_evaluations_method"), "lesson_evaluations", type_="check")
    op.drop_constraint(
        op.f("ck_lesson_evaluations_reviewer_method"), "lesson_evaluations", type_="check"
    )
    op.create_check_constraint(
        "method", "lesson_evaluations", "method IN ('rules', 'teacher', 'hybrid')"
    )
    op.create_check_constraint(
        "reviewer_method",
        "lesson_evaluations",
        "(method = 'teacher' AND reviewer_id IS NOT NULL) OR "
        "(method IN ('rules', 'hybrid') AND reviewer_id IS NULL)",
    )


def downgrade():
    if op.get_bind().scalar(
        sa.text("SELECT count(*) FROM lesson_evaluations WHERE method = 'hybrid'")
    ):
        raise RuntimeError("Hybrid evaluations exist; downgrade would lose provenance")
    op.drop_constraint(op.f("ck_lesson_evaluations_method"), "lesson_evaluations", type_="check")
    op.drop_constraint(
        op.f("ck_lesson_evaluations_reviewer_method"), "lesson_evaluations", type_="check"
    )
    op.create_check_constraint("method", "lesson_evaluations", "method IN ('rules', 'teacher')")
    op.create_check_constraint(
        "reviewer_method",
        "lesson_evaluations",
        "(method = 'teacher' AND reviewer_id IS NOT NULL) OR "
        "(method = 'rules' AND reviewer_id IS NULL)",
    )
