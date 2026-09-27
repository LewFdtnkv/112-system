"""Teacher recording library and frozen card voice variants."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0033_card_recordings"
down_revision = "0032_dds_generation"
branch_labels = depends_on = None


def upgrade():
    op.create_table(
        "recordings",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "created_by_id",
            sa.UUID(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("purpose", sa.String(16), nullable=False),
        sa.Column(
            "audio_id",
            sa.UUID(),
            sa.ForeignKey("speech_assets.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.CheckConstraint("purpose IN ('caller', 'greeting', 'acknowledgment')", name="purpose"),
    )
    op.create_index("ix_recordings_created_by_id", "recordings", ["created_by_id"])
    op.create_index("ix_recordings_audio_id", "recordings", ["audio_id"])
    op.add_column(
        "card_templates",
        sa.Column("audio", postgresql.JSONB(), server_default="{}", nullable=False),
    )
    op.add_column(
        "call_cues",
        sa.Column("audio_variants", postgresql.JSONB(), server_default="[]", nullable=False),
    )
    # Existing scenario recordings remain attached exactly as before. Import each asset once
    # per author into the library, without rewriting any scenario or past call.
    op.execute("""
        INSERT INTO recordings (id, created_by_id, title, purpose, audio_id)
        SELECT gen_random_uuid(), owner_id, left(title, 255), purpose, audio_id FROM (
          SELECT DISTINCT ON (s.created_by_id, c.audio_id)
            s.created_by_id AS owner_id, c.audio_id,
            COALESCE(sc.snapshot->>'title', 'Запись') || ' — ' || c.contact_name AS title,
            CASE WHEN c.contact_key = 'caller' THEN 'caller' ELSE 'greeting' END AS purpose
          FROM call_cues c JOIN scenario_cards sc ON sc.id = c.scenario_card_id
          JOIN scenario_versions v ON v.id = sc.scenario_version_id
          JOIN scenarios s ON s.id = v.scenario_id
          ORDER BY s.created_by_id, c.audio_id, sc.position
        ) old_recordings
    """)


def downgrade():
    op.drop_column("call_cues", "audio_variants")
    op.drop_column("card_templates", "audio")
    op.drop_table("recordings")
