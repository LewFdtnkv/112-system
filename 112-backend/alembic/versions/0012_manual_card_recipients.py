"""Persist the operator's explicit service selection separately from EKP recommendations."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0012_manual_card_recipients"
down_revision = "0011_classifier_presentation"
branch_labels = None
depends_on = None


def upgrade():
    # NULL follows EKP; [] is an explicit decision to register without notifying.
    op.add_column(
        "incident_cards",
        sa.Column("recipient_service_ids", postgresql.JSONB(none_as_null=True), nullable=True),
    )


def downgrade():
    op.drop_column("incident_cards", "recipient_service_ids")
