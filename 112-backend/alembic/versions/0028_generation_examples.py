"""Explicit teacher approval of generation examples, withdrawn on editing."""

import sqlalchemy as sa
from alembic import op

revision = "0028_generation_examples"
down_revision = "0027_crew_dialogue"
branch_labels = depends_on = None


def upgrade():
    op.add_column(
        "card_templates",
        sa.Column("generation_example", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_column("card_templates", "generation_example")
