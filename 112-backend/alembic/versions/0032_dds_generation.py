"""Separate DDS jobs reference an existing card without claiming its generation provenance."""

import sqlalchemy as sa
from alembic import op

revision = "0032_dds_generation"
down_revision = "0031_dds_card_exercises"
branch_labels = depends_on = None


def upgrade():
    op.drop_constraint(op.f("ck_ai_jobs_ai_purpose"), "ai_jobs", type_="check")
    op.alter_column("ai_jobs", "purpose", type_=sa.String(14))
    op.create_check_constraint(
        op.f("ck_ai_jobs_ai_purpose"),
        "ai_jobs",
        "purpose IN ('recommendation','generation','evaluation','dds_generation')",
    )
    op.add_column("ai_jobs", sa.Column("target_card_id", sa.UUID(), nullable=True))
    op.add_column("ai_jobs", sa.Column("parent_job_id", sa.UUID(), nullable=True))
    for column, table in [("target_card_id", "card_templates"), ("parent_job_id", "ai_jobs")]:
        op.create_foreign_key(
            op.f(f"fk_ai_jobs_{column}_{table}"),
            "ai_jobs",
            table,
            [column],
            ["id"],
            ondelete="RESTRICT",
        )
        op.create_index(op.f(f"ix_ai_jobs_{column}"), "ai_jobs", [column])


def downgrade():
    # Jobs are audit history: explicitly remove DDS jobs before downgrading, never silently delete.
    op.drop_column("ai_jobs", "parent_job_id")
    op.drop_column("ai_jobs", "target_card_id")
    op.drop_constraint(op.f("ck_ai_jobs_ai_purpose"), "ai_jobs", type_="check")
    op.create_check_constraint(
        op.f("ck_ai_jobs_ai_purpose"),
        "ai_jobs",
        "purpose IN ('recommendation','generation','evaluation')",
    )
