from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from test_student_workflow import exercise as exercise
from test_teacher_api import teaching as teaching

from app.models import Lesson, LessonEvaluation

pytestmark = pytest.mark.anyio


async def test_overview_active_priority_windows_and_pagination(exercise, db_session):
    e = exercise
    await e.start()
    for n in range(8):
        await e.t.post(
            "lessons/start",
            e.d.payload
            | {
                "request_id": str(uuid4()),
                "student_id": str(e.t.accounts["student"].id),
                "title": f"Новое занятие {n}",
            },
        )
    future = await e.t.post(
        "lessons/start",
        e.d.payload
        | {
            "request_id": str(uuid4()),
            "available_from": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
            "student_id": str(e.t.accounts["student"].id),
        },
    )
    expired = await e.t.post(
        "lessons/start",
        e.d.payload | {"request_id": str(uuid4()), "student_id": str(e.t.accounts["student"].id)},
    )
    row = await db_session.get(Lesson, UUID(expired["id"]))
    row.available_from = datetime.now(UTC) - timedelta(days=2)
    row.available_until = datetime.now(UTC) - timedelta(days=1)
    await db_session.commit()
    data = await e.request("GET", "student/overview")
    active = data["active_lessons"]
    assert active["total"] == 1 and len(active["items"]) == 1
    assert active["items"][0]["lesson_id"] == e.lesson["id"]
    assert active["items"][0]["completed_at"] is None
    available = data["available_lessons"]
    assert available["total"] == 8 and len(available["items"]) == 6
    rest = (await e.request("GET", "student/overview?available_offset=6"))["available_lessons"]
    ids = [r["lesson_id"] for r in active["items"] + available["items"] + rest["items"]]
    assert len(set(ids)) == 9 and expired["id"] not in ids and future["id"] not in ids
    clamped = (await e.request("GET", "student/overview?available_offset=60"))["available_lessons"]
    assert clamped["offset"] == 6 and clamped["items"] == rest["items"]
    assert data["performance"]["overall_percent"] is None
    assert data["performance"]["recent_percent"] is None
    assert "HIDDEN_TEACHER_ANSWER" not in str(data)
    assert (await e.request("GET", "student/overview", actor="student2"))["active_lessons"][
        "total"
    ] == 0


async def test_overview_recent_five_normalized_scores_latest_revision_and_scope(
    exercise, db_session
):
    e = exercise
    student_id = e.t.accounts["student"].id
    now = datetime.now(UTC)
    lesson_ids = []
    # Chronological completion, scales 0/5, 1/5, ... 5/5, 3/4.
    for index, (score, maximum) in enumerate(
        [(0, 5), (1, 5), (2, 5), (3, 5), (4, 5), (5, 5), (3, 4)]
    ):
        lesson = await e.t.post(
            "lessons/start",
            e.d.payload | {"request_id": str(uuid4()), "student_id": str(student_id)},
        )
        row = await db_session.get(Lesson, UUID(lesson["id"]))
        row.status = "finished"
        row.started_at = now - timedelta(days=10 - index, hours=1)
        row.ended_at = now - timedelta(days=10 - index)
        grade = LessonEvaluation(
            lesson_id=row.id,
            student_id=student_id,
            reviewer_id=None,
            request_id=uuid4(),
            revision=1,
            method="rules",
            score=score,
            max_score=maximum,
            comment="Автоматически",
        )
        db_session.add(grade)
        await db_session.flush()
        if index == 0:
            db_session.add(
                LessonEvaluation(
                    lesson_id=row.id,
                    student_id=student_id,
                    reviewer_id=e.t.accounts["teacher"].id,
                    request_id=uuid4(),
                    revision=2,
                    method="teacher",
                    score=1,
                    max_score=2,
                    comment="Пересмотр старого урока",
                    supersedes_id=grade.id,
                )
            )
        lesson_ids.append(str(row.id))
    await db_session.commit()
    own = await e.request("GET", "student/overview")
    p = own["performance"]
    assert p["total_lessons"] == 8 and p["graded_lessons"] == 7
    assert p["recent_count"] == 5 and p["recent_percent"] == 71
    assert p["overall_percent"] == 60.71
    assert [r["lesson_id"] for r in p["recent_lessons"]] == list(reversed(lesson_ids[-5:]))
    path = f"teaching/students/{student_id}/overview"
    teacher = await e.request("GET", path, actor="teacher")
    assert teacher["performance"] == p
    await e.request("GET", path, actor="other", status=404)
    await e.request("GET", path, status=403)
    await e.request("GET", path, actor="admin", status=403)
    await e.request("GET", "student/overview", actor="teacher", status=403)
    # Another teacher's lesson remains visible to its student, never to this teacher.
    foreign = await db_session.get(Lesson, UUID(lesson_ids[-1]))
    foreign.teacher_id = e.t.accounts["other"].id
    await db_session.commit()
    teacher = await e.request("GET", path, actor="teacher")
    assert teacher["performance"]["graded_lessons"] == 6
    assert teacher["performance"]["overall_percent"] == 58.33
    assert foreign.id not in [
        UUID(r["lesson_id"]) for r in teacher["performance"]["recent_lessons"]
    ]
    history = await e.request("GET", f"views/lessons?student_id={student_id}", actor="other")
    assert history["total"] == 1
    await e.request(
        "GET", f"views/lessons?student_id={e.t.accounts['student2'].id}", actor="other", status=404
    )
