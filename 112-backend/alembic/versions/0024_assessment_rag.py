"""PostgreSQL retrieval memory for semantic assessment."""

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision = "0024_assessment_rag"
down_revision = "0023_dds_stream"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "assessment_examples",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("source_key", sa.String(200), nullable=False, unique=True),
        sa.Column("created_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("source_job_id", sa.Uuid(), sa.ForeignKey("ai_jobs.id", ondelete="RESTRICT")),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("criterion_code", sa.String(100), nullable=False),
        sa.Column("policy_version", sa.String(50), nullable=False),
        *[
            sa.Column(name, sa.Text(), nullable=False)
            for name in ("situation", "reference", "answer", "reason", "search_text")
        ],
        sa.Column("verdict", sa.String(20), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("withdrawn_at", sa.DateTime(timezone=True)),
        sa.Column("embedding", Vector(1024)),
        sa.Column("embedding_model", sa.String(255)),
        sa.Column("embedded_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("kind IN ('text', 'services', 'dds')", name="kind"),
        sa.CheckConstraint("role IN ('operator_112', 'dds')", name="role"),
        sa.CheckConstraint(
            "verdict IN ('correct', 'partial', 'incorrect', 'uncertain')", name="verdict"
        ),
    )
    op.create_index(
        "ix_assessment_examples_scope",
        "assessment_examples",
        ["active", "kind", "role", "criterion_code"],
    )


def downgrade():
    op.drop_table("assessment_examples")
    # The extension can be used by other applications/tables; do not drop it.
