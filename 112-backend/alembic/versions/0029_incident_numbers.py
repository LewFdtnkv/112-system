"""Assign permanent integer display numbers while retaining UUID card identities."""

import sqlalchemy as sa
from alembic import op

revision = "0029_incident_numbers"
down_revision = "0028_generation_examples"
branch_labels = depends_on = None


def upgrade():
    # The old optional text field was neither populated nor exposed by the application.
    # PostgreSQL fills existing rows and allocates subsequent numbers atomically.
    op.drop_column("incident_cards", "display_number")
    op.add_column(
        "incident_cards",
        sa.Column("display_number", sa.Integer(), sa.Identity(always=True), nullable=False),
    )
    op.create_unique_constraint(
        "uq_incident_cards_display_number", "incident_cards", ["display_number"]
    )


def downgrade():
    op.drop_constraint("uq_incident_cards_display_number", "incident_cards", type_="unique")
    op.execute("ALTER TABLE incident_cards ALTER COLUMN display_number DROP IDENTITY")
    op.alter_column(
        "incident_cards",
        "display_number",
        type_=sa.String(50),
        nullable=True,
        postgresql_using="display_number::varchar(50)",
    )
