"""Per-teacher visibility and exclusion of shared RAG examples."""

import sqlalchemy as sa
from alembic import op

revision = "0025_rag_preferences"
down_revision = "0024_assessment_rag"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "assessment_memory_preferences",
        sa.Column(
            "teacher_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column(
            "example_id",
            sa.Uuid(),
            sa.ForeignKey("assessment_examples.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column("disabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("removed", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade():
    op.drop_table("assessment_memory_preferences")
