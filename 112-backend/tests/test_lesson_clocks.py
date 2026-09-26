from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from test_catalog_dds import api as api
from test_catalog_dds import dds as dds
from test_dds_crews import crews as crews
from test_dds_delivery import stream
from test_student_workflow import exercise as exercise
from test_teacher_api import teaching as teaching

from app.models import Assignment, Attempt, Lesson, LessonEvaluation, LessonExecution
from app.services.deadlines import enforce_deadlines
from app.services.lesson_clock import elapsed_seconds
from app.services.lesson_presence import leave

pytestmark = pytest.mark.anyio


async def test_personal_limit_starts_once_and_closes_only_its_student(exercise, db_session):
    e = exercise
    lesson = await e.t.post(
        "lessons/start", e.d.payload | {"request_id": str(uuid4()), "time_limit_seconds": 120}
    )
    path = f"student/lessons/{lesson['id']}"
    before = await e.request("GET", path)
    assert before["execution_started_at"] is None and before["deadline_at"] is None
    first = await e.request("POST", path + "/start")
    repeated = await e.request("POST", path + "/start")
    assert first["execution_started_at"] == repeated["execution_started_at"]
    assert first["deadline_at"] == repeated["deadline_at"]
    other = await e.request("POST", path + "/start", actor="student2")
    execution = await db_session.get(
        LessonExecution, (UUID(lesson["id"]), e.t.accounts["student"].id)
    )
    execution.started_at = datetime.now(UTC) - timedelta(seconds=121)
    await db_session.commit()
    expired = await e.request("GET", path)
    assert expired["work_status"] == "submitted" and expired["status"] == "active"
    assert not any(a["available"] for a in expired["assignments"])
    await e.request("POST", path + "/start", status=409)
    fresh = await e.request("GET", path, actor="student2")
    assert fresh["work_status"] == "in_progress" and fresh["deadline_at"] == other["deadline_at"]
    grade = await e.request("GET", path + "/evaluation")
    assert grade["assessment_details"]["missed_cards"] == 3 and float(grade["score"]) == 0
    # Manual override is allowed even while the other student's execution is active.
    await e.request(
        "POST",
        f"lessons/{lesson['id']}/students/{execution.student_id}/evaluations",
        {
            "request_id": str(uuid4()),
            "expected_revision": 1,
            "score": 10,
            "max_score": 100,
            "comment": "Проверено",
        },
        actor="teacher",
        status=201,
    )
    await e.request("GET", path)
    assert (
        len(
            list(
                await db_session.scalars(
                    select(LessonEvaluation).where(LessonEvaluation.lesson_id == UUID(lesson["id"]))
                )
            )
        )
        == 2
    )


async def test_unlimited_pause_persists_and_old_session_cannot_pause_resume(
    exercise, db_session, db_client
):
    e = exercise
    lesson = await db_session.get(Lesson, UUID(e.lesson["id"]))
    lesson.time_limit_seconds = None
    await db_session.commit()
    a = await e.start()
    path = f"student/lessons/{lesson.id}"
    work = await e.request("GET", path)
    execution = await db_session.get(LessonExecution, (lesson.id, e.t.accounts["student"].id))
    attempt = await db_session.get(Attempt, UUID(a["id"]))
    now = datetime.now(UTC)
    attempt.started_at = now - timedelta(seconds=100)
    await leave(db_session, lesson, execution, now - timedelta(seconds=80))
    await db_session.commit()
    assert elapsed_seconds(attempt, now) == pytest.approx(20)
    paused = await e.request("GET", path)
    assert paused["paused_at"] and paused["execution_started_at"] == work["execution_started_at"]
    response = await db_client.put(
        f"/api/v1/student/attempts/{attempt.id}/card",
        headers=e.t.headers["student"],
        json={"revision": 1, "data": {}},
    )
    assert response.status_code == 409
    overview = await e.request("GET", "student/overview")
    assert overview["active_lessons"]["total"] == 0
    assert overview["available_lessons"]["items"][0]["paused_at"]
    resumed = await e.request("POST", path + "/start")
    assert (
        not resumed["paused_at"] and resumed["presence_session_id"] != work["presence_session_id"]
    )
    assert elapsed_seconds(attempt) < 22
    for action in ["presence", "leave"]:
        response = await db_client.post(
            f"/api/v1/{path}/{action}",
            headers=e.t.headers["student"],
            json={"session_id": work["presence_session_id"]},
        )
        assert response.status_code == 409
    assert not (await e.request("GET", path))["paused_at"]
    await e.fill(a)
    response = await db_client.post(
        f"/api/v1/{path}/leave",
        headers=e.t.headers["student"],
        json={"session_id": resumed["presence_session_id"]},
    )
    assert response.status_code == 204
    assert (await e.request("GET", path))["paused_at"]


async def test_timed_exit_does_not_pause_cards_or_extend_deadline(exercise, db_session, db_client):
    e = exercise
    a = await e.start()
    path = f"student/lessons/{e.lesson['id']}"
    work = await e.request("GET", path)
    response = await db_client.post(
        f"/api/v1/{path}/leave",
        headers=e.t.headers["student"],
        json={"session_id": work["presence_session_id"]},
    )
    assert response.status_code == 204
    attempt = await db_session.get(Attempt, UUID(a["id"]))
    assert not attempt.pauses
    resumed = await e.request("POST", path + "/start")
    assert resumed["deadline_at"] == work["deadline_at"]
    assert resumed["execution_started_at"] == work["execution_started_at"]


async def test_unlimited_window_still_expires_and_disconnect_pauses(exercise, db_session):
    e = exercise
    lesson = await db_session.get(Lesson, UUID(e.lesson["id"]))
    lesson.time_limit_seconds = None
    await db_session.commit()
    a = await e.start()
    execution = await db_session.get(LessonExecution, (lesson.id, e.t.accounts["student"].id))
    now = datetime.now(UTC)
    execution.last_seen_at = now - timedelta(seconds=50)
    attempt = await db_session.get(Attempt, UUID(a["id"]))
    attempt.started_at = now - timedelta(seconds=100)
    await db_session.commit()
    await enforce_deadlines(db_session, lesson, now)
    assert execution.paused_at == now - timedelta(seconds=5)
    assert elapsed_seconds(attempt, now) == pytest.approx(95)
    lesson.available_until = now + timedelta(seconds=2)
    await db_session.commit()
    await enforce_deadlines(db_session, lesson, now + timedelta(seconds=3))
    assert attempt.status == "interrupted" and execution.ended_at == lesson.available_until
    assert elapsed_seconds(attempt) == pytest.approx(95)


async def test_deadline_is_earlier_of_window_and_duration(exercise, db_session):
    e = exercise
    lesson = await db_session.get(Lesson, UUID(e.lesson["id"]))
    lesson.available_until = datetime.now(UTC) + timedelta(seconds=10)
    await db_session.commit()
    work = await e.request("POST", f"student/lessons/{lesson.id}/start")
    assert datetime.fromisoformat(work["deadline_at"]) == lesson.available_until


async def test_dds_pause_freezes_arrival_schedule_and_reaction(crews, api, db_session):
    lesson_data, path = await stream(crews, api, offsets=(0, 60), time_limit_seconds=None)
    work = await api("POST", path + "/start", actor="student")
    lesson = await db_session.get(Lesson, UUID(lesson_data["id"]))
    first = await db_session.get(Attempt, UUID(work["assignments"][0]["attempt_id"]))
    execution = await db_session.get(LessonExecution, (lesson.id, first.student_id))
    pending = await db_session.get(Assignment, UUID(work["assignments"][1]["id"]))
    scheduled = pending.scheduled_at
    now = datetime.now(UTC)
    await leave(db_session, lesson, execution, now)
    await db_session.commit()
    await enforce_deadlines(db_session, lesson, now + timedelta(seconds=120))
    assert pending.released_at is None
    # Resume after a simulated 2-minute absence: remaining arrival delay is retained.
    execution.paused_at = now - timedelta(seconds=120)
    first.pauses = [{"start": execution.paused_at.isoformat(), "end": None}]
    await db_session.commit()
    resumed = await api("POST", path + "/start", actor="student")
    assert not resumed["paused_at"]
    assert pending.scheduled_at >= scheduled + timedelta(seconds=120)
    assert first.pauses[-1]["end"] is not None
