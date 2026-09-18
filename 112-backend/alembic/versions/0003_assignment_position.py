"""Order assignments within each student's lesson."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_assignment_position"
down_revision: str | None = "0002_training_domain"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("assignments", sa.Column("position", sa.Integer(), nullable=True))
    # Preserve existing rows; previous creation order is the deterministic initial order.
    op.execute(
        sa.text("""
        WITH ordered AS (
            SELECT id, row_number() OVER (
                PARTITION BY lesson_id, student_id ORDER BY created_at, id
            ) AS position
            FROM assignments
        )
        UPDATE assignments SET position = ordered.position
        FROM ordered WHERE assignments.id = ordered.id
    """)
    )
    op.alter_column("assignments", "position", nullable=False)
    op.create_check_constraint(
        op.f("ck_assignments_positive_position"), "assignments", "position > 0"
    )
    op.create_unique_constraint(
        op.f("uq_assignments_lesson_id"), "assignments", ["lesson_id", "student_id", "position"]
    )


def downgrade() -> None:
    op.drop_constraint(op.f("uq_assignments_lesson_id"), "assignments", type_="unique")
    op.drop_constraint(op.f("ck_assignments_positive_position"), "assignments", type_="check")
    op.drop_column("assignments", "position")
