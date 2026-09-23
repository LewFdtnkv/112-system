"""Retain historical group references after disbanding its membership."""

import sqlalchemy as sa
from alembic import op

revision = "0020_disband_groups"
down_revision = "0019_silent_call_cards"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("training_groups", sa.Column("disbanded_at", sa.DateTime(timezone=True)))


def downgrade():
    op.drop_column("training_groups", "disbanded_at")
