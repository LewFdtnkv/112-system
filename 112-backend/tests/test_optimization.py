from unittest.mock import AsyncMock

import pytest
from sqlalchemy import event
from test_student_workflow import exercise as exercise
from test_teacher_api import teaching as teaching

from app.services import deadlines

pytestmark = pytest.mark.anyio


async def test_dashboard_query_budget_and_no_hidden_answers(exercise, db_session):
    connection = await db_session.connection()
    statements = []

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(connection.sync_connection, "before_cursor_execute", record)
    try:
        dashboard = await exercise.request("GET", "student/overview")
    finally:
        event.remove(connection.sync_connection, "before_cursor_execute", record)
    # Authorization remains database-backed; dashboard stats/history/pages/groups are bounded.
    assert len(statements) <= 4
    assert "HIDDEN_TEACHER_ANSWER" not in str(dashboard)


async def test_presence_change_does_not_recheck_every_unfinished_grade(exercise, monkeypatch):
    from datetime import UTC, datetime, timedelta
    from uuid import UUID

    from app.models import Lesson
    from app.services.lesson_presence import execution_for

    e = exercise
    await e.start()
    lesson = await e.t.db_session.get(Lesson, UUID(e.lesson["id"]))
    execution = await execution_for(e.t.db_session, lesson.id, e.t.accounts["student"].id)
    execution.last_seen_at = datetime.now(UTC) - timedelta(minutes=2)
    await e.t.db_session.flush()
    publish = AsyncMock()
    monkeypatch.setattr(deadlines, "publish_lesson_result", publish)
    assert await deadlines.enforce_deadlines(e.t.db_session, lesson)
    assert execution.paused_at is not None
    publish.assert_not_awaited()
