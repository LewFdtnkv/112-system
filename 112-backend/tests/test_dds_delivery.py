from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from test_catalog_dds import api as api
from test_catalog_dds import dds as dds
from test_dds_crews import crews as crews
from test_teacher_api import teaching as teaching

from app.models import Assignment, Attempt, Lesson, LessonExecution, ServiceResponse
from app.services.deadlines import enforce_deadlines
from app.services.learning import learning_result

pytestmark = pytest.mark.anyio


async def stream(c, api, offsets=(0, 40, 130), **launch):
    scenario = await c.d.t.post(
        "scenarios",
        c.base
        | {
            "card_ids": c.base["card_ids"] * len(offsets),
            "arrival_offsets_seconds": list(offsets),
        },
    )
    lesson = await c.d.t.post(
        "lessons/start",
        {
            "request_id": str(uuid4()),
            "group_id": c.d.group["id"],
            "scenario_version_id": scenario["id"],
            **launch,
        },
    )
    path = f"student/lessons/{lesson['id']}"
    return lesson, path


async def test_arrivals_independent_of_opening_and_completion(crews, api, db_session):
    lesson, path = await stream(crews, api)
    initial = await api("GET", path, actor="student")
    assert initial["delivery"] == "dds-stream-v1"
    assert not initial["execution_started_at"]
    assert all(not a["available"] and not a["card"] for a in initial["assignments"])
    await api("POST", path + "/start", actor="student2", status=404)
    work = await api("POST", path + "/start", actor="student")
    assert len([a for a in work["assignments"] if a["card"]]) == 1
    assert work["assignments"][0]["first_opened_at"] is None
    retry = await api("POST", path + "/start", actor="student")
    assert retry["execution_started_at"] == work["execution_started_at"]
    second = work["assignments"][1]
    await api("POST", f"student/assignments/{second['id']}/start", actor="student", status=409)
    assignment = await db_session.get(Assignment, UUID(second["id"]))
    assignment.scheduled_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()
    # The server sweep, without any browser command, releases the second card.
    row = await db_session.scalar(
        select(Lesson).where(Lesson.id == UUID(lesson["id"])).with_for_update()
    )
    await enforce_deadlines(db_session, row)
    work = await api("GET", path, actor="student")
    assert len([a for a in work["assignments"] if a["card"]]) == 2
    assert all(a["status"] == "in_progress" for a in work["assignments"][:2])
    assert work["assignments"][0]["first_opened_at"] is None
    b = await api("POST", f"student/assignments/{second['id']}/start", actor="student")
    a = await api(
        "POST", f"student/assignments/{work['assignments'][0]['id']}/start", actor="student"
    )
    assert a["id"] != b["id"]
    assert a["dds"]["first_decision_at"] is None
    assert a["dds"]["reaction_norm_seconds"] == 30
    assert (
        await db_session.scalar(
            select(func.count())
            .select_from(Attempt)
            .join(Assignment)
            .where(Assignment.lesson_id == UUID(lesson["id"]))
        )
        == 2
    )
    assert not (await api("GET", path, actor="student"))["assignments"][2]["card"]


async def test_first_manual_status_is_reaction_and_retry_does_not_reset(crews, api, db_session):
    lesson, path = await stream(crews, api, offsets=(0,))
    work = await api("POST", path + "/start", actor="student")
    assignment = work["assignments"][0]
    a = await api("POST", f"student/assignments/{assignment['id']}/start", actor="student")
    attempt = await db_session.get(Attempt, UUID(a["id"]))
    response = await db_session.scalar(
        select(ServiceResponse).where(ServiceResponse.id == UUID(a["dds"]["response_id"]))
    )
    response.added_at = response.sent_at = response.received_at = datetime.now(UTC) - timedelta(
        seconds=35
    )
    await db_session.commit()
    a = await api("GET", f"student/attempts/{a['id']}", actor="student")
    command = crews.command(a)
    a = await api("POST", f"student/attempts/{a['id']}/dds/crews", command, actor="student")
    first = a["dds"]["first_decision_at"]
    assert first and a["dds"]["status"] == "received"
    repeated = await api("POST", f"student/attempts/{a['id']}/dds/crews", command, actor="student")
    assert repeated["dds"]["first_decision_at"] == first
    assert attempt.first_response_at is not None
    from app.schemas.student import StudentAttemptRead
    from app.services.dds_assessment import check_dds

    check = check_dds(attempt.settings_snapshot["dds_policy"], StudentAttemptRead.model_validate(a))
    timing = next(f for f in check.fields if f.field == "dds.reaction")
    assert timing.status == "different" and not timing.scored
    assert a["status"] == "in_progress"  # 30 s is not an exercise termination deadline.


async def test_prefill_not_reaction_and_future_cards_expire_as_unfinished(crews, api, db_session):
    lesson, path = await stream(
        crews,
        api,
        offsets=(0, 60),
        learning={
            "kind": "skill_practice",
            "target_skills": ["dds_response"],
        },
    )
    work = await api("POST", path + "/start", actor="student")
    a = await api(
        "GET", f"student/attempts/{work['assignments'][0]['attempt_id']}", actor="student"
    )
    assert a["dds"]["crews"] and a["dds"]["first_decision_at"] is None
    row = await db_session.get(Lesson, UUID(lesson["id"]))
    row.available_until = datetime.now(UTC) - timedelta(milliseconds=1)
    await db_session.commit()
    work = await api("GET", path, actor="student")
    assert work["status"] == "finished"
    assert work["assignments"][0]["status"] == "interrupted"
    assert not work["assignments"][1]["attempt_id"]


async def test_schedule_validation_and_personal_clock(crews, api, db_session):
    for offsets in ([0], [1, 2], [0, -1], [0, 900], [0, True]):
        await crews.d.t.post(
            "scenarios",
            crews.base
            | {
                "card_ids": crews.base["card_ids"] * 2,
                "arrival_offsets_seconds": offsets,
            },
            expected=422,
        )
    lesson, path = await stream(crews, api, offsets=(0, 0))
    work = await api("POST", path + "/start", actor="student")
    assert all(a["card"] for a in work["assignments"])
    execution = await db_session.get(
        LessonExecution, (UUID(lesson["id"]), crews.d.t.accounts["student"].id)
    )
    assert execution.started_at == datetime.fromisoformat(work["execution_started_at"])


def test_overlapping_attempts_do_not_double_lesson_duration():
    now = datetime.now(UTC)
    attempts = [
        SimpleNamespace(
            started_at=now + timedelta(seconds=start),
            ended_at=now + timedelta(seconds=end),
            settings_snapshot={},
        )
        for start, end in [(0, 100), (20, 50), (90, 150)]
    ]
    assert learning_result(attempts).duration.value == 150


async def test_dds_caller_is_forbidden_and_parallel_context_is_separate(crews, api, db_session):
    from fastapi import HTTPException

    from app.services.semantic_assessment.process import summarize_process
    from app.services.telephony.calls import new_call

    _, path = await stream(crews, api, offsets=(0, 0))
    work = await api("POST", path + "/start", actor="student")
    a, b = work["assignments"]
    for row in (a, b):
        await api("POST", f"student/assignments/{row['id']}/start", actor="student")
    attempt = await db_session.get(Attempt, UUID(a["attempt_id"]))
    with pytest.raises(HTTPException) as error:
        await new_call(
            db_session,
            None,
            attempt,
            SimpleNamespace(contact_key="caller"),
            command_id=uuid4(),
            direction="outgoing",
            transport="manual",
        )
    assert error.value.status_code == 422
    # Close this attempt's evidence after opening the other card.
    from app.models import AttemptEvent
    from app.services.audit import append_event

    last = await append_event(db_session, attempt.id, "dds.submitted", {})
    context = await summarize_process(db_session, attempt.id, last.sequence)
    assert any(
        e["kind"] == "dds.card_opened" and e["other_card"]
        for e in context["parallel_card_activity"]
    )
    assert all("payload" not in e for e in context["parallel_card_activity"])
    assert not await db_session.scalar(
        select(AttemptEvent).where(
            AttemptEvent.attempt_id == attempt.id, AttemptEvent.kind == "call.requested"
        )
    )
