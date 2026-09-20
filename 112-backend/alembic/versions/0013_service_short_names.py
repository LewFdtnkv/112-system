"""Separate service short labels from official names; preserve dispatched labels."""

import sqlalchemy as sa
from alembic import op

revision = "0013_service_short_names"
down_revision = "0012_manual_card_recipients"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("services", sa.Column("short_name", sa.String(100), nullable=True))
    op.add_column(
        "service_responses", sa.Column("service_short_name", sa.String(100), nullable=True)
    )


def downgrade():
    op.drop_column("service_responses", "service_short_name")
    op.drop_column("services", "short_name")
