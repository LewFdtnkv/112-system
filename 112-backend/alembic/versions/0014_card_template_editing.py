"""Track edits to unused library cards and reject stale writes."""

import sqlalchemy as sa
from alembic import op

revision = "0014_card_template_editing"
down_revision = "0013_service_short_names"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "card_templates", sa.Column("revision", sa.Integer(), server_default="1", nullable=False)
    )
    op.add_column(
        "card_templates",
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.execute("UPDATE card_templates SET updated_at = created_at")
    op.create_check_constraint("positive_revision", "card_templates", "revision > 0")


def downgrade():
    op.drop_constraint(op.f("ck_card_templates_positive_revision"), "card_templates", type_="check")
    op.drop_column("card_templates", "updated_at")
    op.drop_column("card_templates", "revision")
