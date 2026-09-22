"""Simplify assistance settings; preserve previous intent without enabling new workflows."""

from alembic import op

revision = "0018_learning_workflows"
down_revision = "0017_learning_foundation"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE OR REPLACE FUNCTION pg_temp.learning_v2(p jsonb) RETURNS jsonb LANGUAGE sql AS $$
        SELECT jsonb_build_object(
          'version', 'learning-v2',
          'kind', CASE WHEN p->>'kind' IN ('skill_practice','review')
                           AND (COALESCE(p->'target_skills','[]'::jsonb)
                                - 'interface') = '[]'::jsonb
                       THEN 'practice' ELSE COALESCE(p->>'kind','practice') END,
          'objective', COALESCE(p->>'objective',''),
          'target_skills', CASE WHEN p->>'kind' IN ('skill_practice','review')
                               THEN COALESCE(p->'target_skills','[]'::jsonb) - 'interface'
                               ELSE '[]'::jsonb END,
          'assistance', jsonb_build_object('max_level',
              CASE WHEN p->'assistance'->>'mode' IN ('text','visual')
                   THEN COALESCE(p->'assistance'->>'max_level','goal') ELSE 'none' END,
              'on_request', COALESCE((p->'assistance'->>'on_request')::boolean, true)))
        $$
    """)
    op.execute("UPDATE lessons SET learning = pg_temp.learning_v2(learning)")
    for table, column in (("assignments", "settings"), ("attempts", "settings_snapshot")):
        op.execute(f"""UPDATE {table} SET {column} = {column} || jsonb_build_object(
            'learning_legacy', {column}->'learning',
            'learning', pg_temp.learning_v2({column}->'learning'))""")


def downgrade():
    for table, column in (("assignments", "settings"), ("attempts", "settings_snapshot")):
        op.execute(f"""UPDATE {table} SET {column} = ({column} - 'learning_legacy') ||
            jsonb_build_object('learning', {column}->'learning_legacy')
            WHERE {column} ? 'learning_legacy'""")
    op.execute("""UPDATE lessons l SET learning = a.settings->'learning'
        FROM assignments a WHERE a.lesson_id = l.id
          AND a.settings->'learning'->>'version' = 'learning-v1'""")
