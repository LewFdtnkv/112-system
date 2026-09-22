"""A silent call has no known incident type; ARM flags use existing JSON storage."""

from alembic import op

revision = "0019_silent_call_cards"
down_revision = "0018_learning_workflows"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("card_templates", "classifier_entry_id", nullable=True)


def downgrade():
    # PostgreSQL refuses downgrade while silent-call templates exist; never invent a type.
    op.alter_column("card_templates", "classifier_entry_id", nullable=False)
