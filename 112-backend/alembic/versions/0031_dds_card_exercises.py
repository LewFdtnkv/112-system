"""Store DDS starting history and pending crew reports with library cards."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0031_dds_card_exercises"
down_revision = "0030_lesson_clocks"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("card_templates", sa.Column("dds_exercise", postgresql.JSONB(), nullable=True))


def downgrade():
    op.drop_column("card_templates", "dds_exercise")
