"""Durable, server-controlled crew notification dialogue."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0027_crew_dialogue"
down_revision = "0026_learning_recommendations"
branch_labels = depends_on = None


def upgrade():
    op.add_column("training_calls", sa.Column("dialogue", JSONB(), nullable=True))


def downgrade():
    op.drop_column("training_calls", "dialogue")
