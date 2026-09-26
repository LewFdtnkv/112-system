"""Personal lesson deadlines and persistent card pauses."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0030_lesson_clocks"
down_revision = "0029_incident_numbers"
branch_labels = depends_on = None


def upgrade():
    op.add_column("lessons", sa.Column("time_limit_seconds", sa.Integer()))
    op.create_check_constraint(
        op.f("ck_lessons_time_limit"),
        "lessons",
        "time_limit_seconds IS NULL OR time_limit_seconds > 0",
    )
    for name in ("ended_at", "paused_at", "last_seen_at"):
        op.add_column("lesson_executions", sa.Column(name, sa.DateTime(timezone=True)))
    op.add_column("lesson_executions", sa.Column("session_id", sa.Uuid()))
    op.add_column(
        "attempts", sa.Column("pauses", postgresql.JSONB(), nullable=False, server_default="[]")
    )
    op.execute("""
        UPDATE lessons l SET time_limit_seconds = a.seconds FROM
        (SELECT lesson_id, max(time_limit_seconds) seconds FROM assignments GROUP BY lesson_id) a
        WHERE a.lesson_id = l.id
    """)
    op.execute("""
        INSERT INTO lesson_executions (lesson_id, student_id, started_at)
        SELECT a.lesson_id, a.student_id, min(t.started_at) FROM assignments a
        LEFT JOIN attempts t ON t.assignment_id = a.id
        GROUP BY a.lesson_id, a.student_id
        ON CONFLICT (lesson_id, student_id) DO NOTHING
    """)
    op.execute("""
        UPDATE lesson_executions e SET ended_at = l.ended_at
        FROM lessons l WHERE e.lesson_id = l.id AND l.status = 'finished'
    """)
    op.execute("""
        UPDATE lesson_executions e SET ended_at = done.ended_at FROM (
          SELECT a.lesson_id, a.student_id, max(t.ended_at) ended_at FROM assignments a
          LEFT JOIN attempts t ON t.assignment_id = a.id
          GROUP BY a.lesson_id, a.student_id
          HAVING count(*) = count(t.ended_at)
        ) done WHERE e.lesson_id = done.lesson_id AND e.student_id = done.student_id
        AND e.ended_at IS NULL
    """)
    op.execute("""
        UPDATE lesson_executions SET paused_at = CURRENT_TIMESTAMP
        WHERE started_at IS NOT NULL AND ended_at IS NULL
    """)
    op.execute("""
        UPDATE attempts t SET pauses = jsonb_build_array(jsonb_build_object(
          'start', e.paused_at, 'end', NULL))
        FROM assignments a JOIN lessons l ON l.id = a.lesson_id
        JOIN lesson_executions e ON e.lesson_id = a.lesson_id AND e.student_id = a.student_id
        WHERE t.assignment_id = a.id AND t.status = 'in_progress'
        AND l.time_limit_seconds IS NULL AND e.paused_at IS NOT NULL
    """)


def downgrade():
    op.drop_column("attempts", "pauses")
    for name in ("session_id", "last_seen_at", "paused_at", "ended_at"):
        op.drop_column("lesson_executions", name)
    op.drop_constraint(op.f("ck_lessons_time_limit"), "lessons", type_="check")
    op.drop_column("lessons", "time_limit_seconds")
