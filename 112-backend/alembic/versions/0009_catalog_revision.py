"""Protect catalog and profile draft edits against stale writes."""

import sqlalchemy as sa
from alembic import op

revision = "0009_catalog_revision"
down_revision = "0008_automatic_assessment"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("classifier_versions", "service_profiles"):
        op.add_column(
            table, sa.Column("revision", sa.Integer(), nullable=False, server_default="1")
        )


def downgrade():
    for table in ("classifier_versions", "service_profiles"):
        op.drop_column(table, "revision")
