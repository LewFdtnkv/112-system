import asyncio
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from test_student_workflow import exercise as exercise
from test_teacher_api import teaching as teaching
from test_teacher_concurrency import concurrent_teaching as concurrent_teaching

from app.models import Assignment, LessonEvaluation
from app.schemas.lesson_evaluation import LessonGradeCreate
from app.schemas.student import CardSubmit, DraftSave
from app.services.lesson_evaluation import grade_lesson
from app.services.lessons import start_lesson
from app.services.student import save_card, start_attempt, submit_card

pytestmark = pytest.mark.anyio


async def test_teacher_reviews_and_grades_entire_lesson(exercise, db_session):
    e = exercise
    prefix = f"lessons/{e.lesson['id']}/students/{e.t.accounts['student'].id}"
    payload = {
        "request_id": str(uuid4()),
        "expected_revision": 1,
        "score": 4,
        "max_score": 5,
        "comment": "Сведения записаны, адрес можно уточнить",
    }
    await e.request("POST", f"{prefix}/evaluations", payload, actor="teacher", status=409)
    assert await e.request("GET", f"student/lessons/{e.lesson['id']}/evaluation") is None
    review = await e.request("GET", f"{prefix}/work", actor="teacher")
    assert not review["submitted"] and review["assignments"][0]["attempt"] is None
    assert (
        review["assignments"][0]["source_snapshot"]["data"]["description"]
        == "HIDDEN_TEACHER_ANSWER"
    )
    for index in range(3):
        await e.complete(index)
    review = await e.request("GET", f"{prefix}/work", actor="teacher")
    assert review["submitted"] and len(review["assignments"]) == 3
    assert review["assignments"][0]["attempt"]["card"]["data"]["description"] == "Слова ученика"
    grade = await e.request("POST", f"{prefix}/evaluations", payload, actor="teacher", status=201)
    assert (
        grade["revision"] == 2
        and grade["score"] == "4"
        and grade["supersedes_id"] == review["evaluations"][0]["id"]
    )
    replay = await e.request("POST", f"{prefix}/evaluations", payload, actor="teacher")
    assert replay["id"] == grade["id"]
    await e.request(
        "POST", f"{prefix}/evaluations", payload | {"score": 3}, actor="teacher", status=409
    )
    await e.request(
        "POST",
        f"{prefix}/evaluations",
        payload | {"request_id": str(uuid4())},
        actor="teacher",
        status=409,
    )
    revised = await e.request(
        "POST",
        f"{prefix}/evaluations",
        payload
        | {
            "request_id": str(uuid4()),
            "expected_revision": 2,
            "score": 5,
            "comment": "Уточнение допустимо по условию задачи",
        },
        actor="teacher",
        status=201,
    )
    assert revised["revision"] == 3 and revised["supersedes_id"] == grade["id"]
    result = await e.request("GET", f"student/lessons/{e.lesson['id']}/evaluation")
    assert result["id"] == revised["id"]
    assert await db_session.scalar(select(func.count()).select_from(LessonEvaluation)) == 3
    history = (await e.request("GET", f"{prefix}/work", actor="teacher"))["evaluations"]
    assert [row["comment"] for row in history if row["method"] == "teacher"] == [
        payload["comment"],
        revised["comment"],
    ]


async def test_grading_permissions_and_validation(exercise):
    e = exercise
    prefix = f"lessons/{e.lesson['id']}/students/{e.t.accounts['student'].id}"
    payload = {"request_id": str(uuid4()), "score": 1, "max_score": 5, "comment": "Test"}
    for actor, status in (("student", 403), ("admin", 403), ("other", 404)):
        await e.request("GET", f"{prefix}/work", actor=actor, status=status)
        await e.request("POST", f"{prefix}/evaluations", payload, actor=actor, status=status)
    await e.request(
        "GET", f"student/lessons/{e.lesson['id']}/evaluation", actor="student2", status=404
    )
    for patch in (
        {"score": 6},
        {"score": -1},
        {"score": "NaN"},
        {"max_score": 0},
        {"comment": " "},
        {"score": 1.001},
        {"expected_revision": -1},
    ):
        await e.request(
            "POST", f"{prefix}/evaluations", payload | patch, actor="teacher", status=422
        )


@pytest.mark.parametrize("same_request", [False, True])
async def test_concurrent_grades_preserve_history(concurrent_teaching, same_request):
    d = concurrent_teaching
    async with d.factory() as session:
        lesson, _ = await start_lesson(session, d.teacher_id, d.payload)
        assignment = await session.scalar(
            select(Assignment).where(Assignment.lesson_id == lesson.id)
        )
        attempt, _ = await start_attempt(session, assignment.id, d.student_id)
        attempt = await save_card(
            session,
            attempt.id,
            d.student_id,
            DraftSave(
                revision=1,
                classifier_entry_id=d.entry_id,
                data={"address_text": "Test", "description": "Test"},
            ),
        )
        await submit_card(
            session, attempt.id, d.student_id, CardSubmit(revision=attempt.card.revision)
        )
    payload = LessonGradeCreate(
        request_id=uuid4(), expected_revision=1, score=4, max_score=5, comment="Test grade"
    )
    second = payload if same_request else payload.model_copy(update={"request_id": uuid4()})

    async def grade(body):
        async with d.factory() as session:
            try:
                _, created = await grade_lesson(
                    session, lesson.id, d.student_id, d.teacher_id, body
                )
                return 201 if created else 200
            except HTTPException as exc:
                return exc.status_code

    statuses = await asyncio.wait_for(asyncio.gather(grade(payload), grade(second)), timeout=10)
    assert sorted(statuses) == ([200, 201] if same_request else [201, 409])
