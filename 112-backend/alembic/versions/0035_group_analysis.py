"""Allow group recommendations in the existing leased AI queue."""

import sqlalchemy as sa
from alembic import op

revision = "0035_group_analysis"
down_revision = "0034_dds_qa4"
branch_labels = depends_on = None


def upgrade():
    op.alter_column("ai_jobs", "purpose", type_=sa.String(20))
    op.drop_constraint(op.f("ck_ai_jobs_ai_purpose"), "ai_jobs", type_="check")
    op.create_check_constraint(
        "ai_purpose",
        "ai_jobs",
        "purpose IN ('generation','dds_generation','evaluation',"
        "'recommendation','group_recommendation')",
    )


def downgrade():
    if op.get_bind().scalar(
        sa.text("SELECT count(*) FROM ai_jobs WHERE purpose = 'group_recommendation'")
    ):
        raise RuntimeError("Group analysis audit history exists; downgrade would lose data")
    op.drop_constraint(op.f("ck_ai_jobs_ai_purpose"), "ai_jobs", type_="check")
    op.create_check_constraint(
        "ai_purpose",
        "ai_jobs",
        "purpose IN ('generation','dds_generation','evaluation','recommendation')",
    )
