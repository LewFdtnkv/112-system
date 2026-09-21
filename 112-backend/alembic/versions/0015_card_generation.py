"""Track teacher-owned generation jobs and their atomically created cards."""

import sqlalchemy as sa
from alembic import op

revision = "0015_card_generation"
down_revision = "0014_card_template_editing"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("ai_jobs", sa.Column("created_by_id", sa.UUID(), nullable=True))
    op.add_column("ai_jobs", sa.Column("card_template_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_ai_jobs_created_by_id_users",
        "ai_jobs",
        "users",
        ["created_by_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_ai_jobs_card_template_id_card_templates",
        "ai_jobs",
        "card_templates",
        ["card_template_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_ai_jobs_created_by_id", "ai_jobs", ["created_by_id"])
    op.create_unique_constraint("uq_ai_jobs_card_template_id", "ai_jobs", ["card_template_id"])


def downgrade():
    op.drop_constraint("uq_ai_jobs_card_template_id", "ai_jobs", type_="unique")
    op.drop_index("ix_ai_jobs_created_by_id", "ai_jobs")
    op.drop_constraint("fk_ai_jobs_card_template_id_card_templates", "ai_jobs", type_="foreignkey")
    op.drop_constraint("fk_ai_jobs_created_by_id_users", "ai_jobs", type_="foreignkey")
    op.drop_column("ai_jobs", "card_template_id")
    op.drop_column("ai_jobs", "created_by_id")
