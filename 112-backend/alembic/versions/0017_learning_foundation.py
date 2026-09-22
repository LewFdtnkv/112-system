"""Freeze learning purpose and assistance policy independently of the training role."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0017_learning_foundation"
down_revision = "0016_dds_crews"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "lessons", sa.Column("learning", postgresql.JSONB(), nullable=False, server_default="{}")
    )
    # Preserve historical modes; never reinterpret a past examination as practice.
    op.execute("""
        UPDATE lessons l SET learning = jsonb_build_object(
            'version', 'learning-v1',
            'kind', COALESCE((SELECT a.mode::text FROM assignments a
                             WHERE a.lesson_id = l.id
                             ORDER BY a.position, a.id LIMIT 1), 'practice'),
            'objective', '', 'target_skills', '[]'::jsonb,
            'assistance', jsonb_build_object('mode', 'none', 'max_level', 'goal',
                                             'on_request', false, 'idle_seconds', null))
    """)
    op.execute("""UPDATE assignments a
                  SET settings = a.settings || jsonb_build_object('learning', l.learning)
                  FROM lessons l WHERE a.lesson_id = l.id""")
    op.execute("""UPDATE attempts t
                  SET settings_snapshot = t.settings_snapshot ||
                      jsonb_build_object('learning', a.settings->'learning')
                  FROM assignments a WHERE t.assignment_id = a.id""")


def downgrade():
    op.execute("UPDATE attempts SET settings_snapshot = settings_snapshot - 'learning'")
    op.execute("UPDATE assignments SET settings = settings - 'learning'")
    op.drop_column("lessons", "learning")
