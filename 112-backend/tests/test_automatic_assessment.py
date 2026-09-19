from uuid import UUID, uuid4

import pytest
from sqlalchemy import delete, func, select
from test_student_workflow import exercise as exercise
from test_teacher_api import teaching as teaching

from app.models import Attempt, CriterionEvidence, CriterionResult, Evaluation, LessonEvaluation
from app.schemas.assessment import AssessmentPolicy
from app.schemas.student import StudentAttemptRead
from app.services.automatic_assessment import weighted_criteria
from app.services.field_evaluation import check_fields

pytestmark = pytest.mark.anyio


async def test_automatic_result_is_persisted_on_last_card_and_replay_is_safe(exercise, db_session):
    e = exercise
    first = await e.complete(0)
    assert await e.request("GET", f"student/lessons/{e.lesson['id']}/evaluation") is None
    for index in (1, 2):
        await e.complete(index)
    grade = await e.request("GET", f"student/lessons/{e.lesson['id']}/evaluation")
    assert grade["method"] == "rules" and grade["reviewer_id"] is None
    assert grade["score"] == "100.00" and grade["revision"] == 1
    assert grade["assessment_details"]["evaluated_cards"] == 3
    assert grade["assessment_details"]["unverified_fields"] == 6
    assert "HIDDEN_TEACHER_ANSWER" not in str(grade)
    await e.request(
        "POST", f"student/attempts/{first['id']}/submit", {"revision": first["card"]["revision"]}
    )
    assert await db_session.scalar(select(func.count()).select_from(Evaluation)) == 3
    assert await db_session.scalar(select(func.count()).select_from(LessonEvaluation)) == 1
    assert await db_session.scalar(select(func.count()).select_from(CriterionResult)) == 6
    assert await db_session.scalar(select(func.count()).select_from(CriterionEvidence)) == 12
    attempt = await db_session.get(Attempt, UUID(first["id"]))
    assert attempt.settings_snapshot["assessment_policy"]["version"] == "weighted-fields-v1"


async def test_weighted_groups_do_not_reward_extra_address_fields(exercise):
    attempt = StudentAttemptRead.model_validate(await exercise.complete())
    source = {
        "classifier_entry_id": str(uuid4()),
        "recipients": [{"service_id": str(exercise.t.service.id), "name": "ДДС"}],
        "data": {"address_details": {"house": "7", "street": "Учебная"}},
    }
    attempt.card.data.address_details = {"house": "7", "street": "Учебная"}
    criteria = weighted_criteria(check_fields(source, attempt), AssessmentPolicy())
    assert sum(item["score"] for item in criteria) == 55
    assert sum(item["max_score"] for item in criteria) == 80
    for key in ("locality", "district", "area", "entrance", "floor"):
        source["data"]["address_details"][key] = "1"
        attempt.card.data.address_details[key] = "1"
    more = weighted_criteria(check_fields(source, attempt), AssessmentPolicy())
    assert sum(item["score"] for item in more) == 55
    assert sum(item["max_score"] for item in more) == 80


async def test_first_student_gets_result_before_entire_group_finishes(exercise):
    e = exercise
    group = await e.t.post("lessons/start", e.d.payload | {"request_id": str(uuid4())})
    work = await e.request("GET", f"student/lessons/{group['id']}")
    for assignment in work["assignments"]:
        attempt = await e.request(
            "POST", f"student/assignments/{assignment['id']}/start", status=201
        )
        filled = await e.fill(attempt)
        await e.request(
            "POST",
            f"student/attempts/{filled['id']}/submit",
            {"revision": filled["card"]["revision"]},
        )
    assert (await e.request("GET", f"student/lessons/{group['id']}"))["status"] == "active"
    assert (await e.request("GET", f"student/lessons/{group['id']}/evaluation"))[
        "method"
    ] == "rules"
    assert (
        await e.request("GET", f"student/lessons/{group['id']}/evaluation", actor="student2")
        is None
    )


async def test_scenario_policy_is_versioned_and_validated(teaching, db_client):
    t = teaching
    prepared = await t.prepare()
    body = {
        "title": "Веса",
        "role": "operator_112",
        "card_ids": [prepared.first["id"]],
        "assessment_policy": {
            "weights": {
                "classification": 50,
                "notification": 20,
                "address": 20,
                "caller": 5,
                "victims": 5,
            }
        },
    }
    version = await t.post("scenarios", body)
    changed = await t.post(
        f"scenarios/{version['id']}/versions",
        body | {"assessment_policy": {"weights": {"classification": 10}}},
    )
    original = (
        await db_client.get(f"/api/v1/scenarios/{version['id']}", headers=t.headers["teacher"])
    ).json()
    assert original["assessment_policy"]["weights"]["classification"] == 50
    assert changed["assessment_policy"]["weights"]["classification"] == 10
    for value in (0, -1, 101):
        await t.post(
            "scenarios",
            body | {"assessment_policy": {"weights": {"classification": value}}},
            expected=422,
        )


async def clear_assessments(session):
    # Simulate completed cards written by the pre-0008 application.
    await session.execute(delete(CriterionEvidence))
    await session.execute(delete(CriterionResult))
    await session.execute(delete(Evaluation))
    await session.execute(delete(LessonEvaluation))
    await session.flush()


async def test_lesson_straddling_upgrade_backfills_earlier_cards(exercise, db_session):
    await exercise.complete(0)
    await clear_assessments(db_session)
    await exercise.complete(1)
    await exercise.complete(2)
    grade = await exercise.request("GET", f"student/lessons/{exercise.lesson['id']}/evaluation")
    assert grade["score"] == "100.00"
    assert grade["assessment_details"]["evaluated_cards"] == 3
    assert await db_session.scalar(select(func.count()).select_from(Evaluation)) == 3


async def test_legacy_backfill_is_owned_idempotent_and_preserves_teacher(exercise, db_session):
    e = exercise
    for index in range(3):
        await e.complete(index)
    await clear_assessments(db_session)
    prefix = f"lessons/{e.lesson['id']}/students/{e.t.accounts['student'].id}"
    await e.request("POST", f"{prefix}/automatic-evaluation", actor="student", status=403)
    grade = await e.request("POST", f"{prefix}/automatic-evaluation", actor="teacher")
    assert grade["method"] == "rules" and grade["score"] == "100.00"
    assert (await e.request("POST", f"{prefix}/automatic-evaluation", actor="teacher"))[
        "id"
    ] == grade["id"]
    manual = await e.request(
        "POST",
        f"{prefix}/evaluations",
        {
            "request_id": str(uuid4()),
            "expected_revision": 1,
            "score": 70,
            "max_score": 100,
            "comment": "Пересмотр",
        },
        actor="teacher",
        status=201,
    )
    assert (await e.request("POST", f"{prefix}/automatic-evaluation", actor="teacher"))[
        "id"
    ] == manual["id"]
    assert await db_session.scalar(select(func.count()).select_from(LessonEvaluation)) == 2
