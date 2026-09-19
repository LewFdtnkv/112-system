from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from test_teacher_api import teaching as teaching

from app.models import Attempt, AttemptEvent, ClassifierRoute, IncidentCard, Lesson, ServiceResponse

pytestmark = pytest.mark.anyio


@pytest.fixture
async def exercise(teaching, db_client):
    t = teaching
    t.card_payload["data"]["description"] = "HIDDEN_TEACHER_ANSWER"
    d = await t.prepare()
    lesson = await t.post(
        "lessons/start", d.payload | {"student_id": str(t.accounts["student"].id)}
    )

    async def request(method, path, payload=None, actor="student", status=200):
        response = await db_client.request(
            method, f"/api/v1/{path}", json=payload, headers=t.headers[actor]
        )
        assert response.status_code == status, response.text
        return response.json()

    work = await request("GET", f"student/lessons/{lesson['id']}")

    async def start(index=0):
        return await request(
            "POST", f"student/assignments/{work['assignments'][index]['id']}/start", status=201
        )

    async def fill(attempt):
        return await request(
            "PUT",
            f"student/attempts/{attempt['id']}/card",
            {
                "revision": attempt["card"]["revision"],
                "classifier_entry_id": str(t.entry.id),
                "data": {
                    "address_text": "Учебный адрес",
                    "description": "Слова ученика",
                    "features": {"has_victims": False},
                },
            },
        )

    async def complete(index=0):
        attempt = await fill(await start(index))
        return await request(
            "POST",
            f"student/attempts/{attempt['id']}/submit",
            {"revision": attempt["card"]["revision"]},
        )

    from types import SimpleNamespace

    return SimpleNamespace(**locals())


async def test_sequential_operator_workflow(exercise, db_session):
    e = exercise
    assert [a["available"] for a in e.work["assignments"]] == [True, False, False]
    assert "HIDDEN_TEACHER_ANSWER" not in str(e.work)
    second = e.work["assignments"][1]["id"]
    await e.request("POST", f"student/assignments/{second}/start", status=409)
    first = await e.start()
    assert first["card"]["data"]["description"] is None
    assert first["card"]["classifier_entry_id"] is None
    assert first["notified_services"] == [] and "HIDDEN_TEACHER_ANSWER" not in str(first)
    again = await e.request("POST", f"student/assignments/{first['assignment_id']}/start")
    assert again["id"] == first["id"] and again["started_at"] == first["started_at"]
    filled = await e.fill(first)
    routes = await e.request("GET", f"student/attempts/{first['id']}/recipients")
    assert routes == [{"service_id": str(e.t.service.id), "name": e.t.service.name}]
    body = {"revision": filled["card"]["revision"]}
    completed = await e.request("POST", f"student/attempts/{first['id']}/submit", body)
    assert completed["status"] == "completed" and completed["ended_at"]
    assert completed["card"]["status"] == "notified"
    assert completed["notified_services"] == routes
    assert await e.request("POST", f"student/attempts/{first['id']}/submit", body) == completed
    await e.request(
        "PUT",
        f"student/attempts/{first['id']}/card",
        {
            "revision": completed["card"]["revision"],
            "data": {},
        },
        status=409,
    )
    assert (await e.request("GET", f"student/lessons/{e.lesson['id']}"))["status"] == "active"
    await e.complete(1)
    await e.complete(2)
    work = await e.request("GET", f"student/lessons/{e.lesson['id']}")
    assert work["work_status"] == "submitted" and work["status"] == "finished" and work["ended_at"]
    assert not any(a["available"] for a in work["assignments"])
    for model in (Attempt, IncidentCard, ServiceResponse):
        assert await db_session.scalar(select(func.count()).select_from(model)) == 3
    events = list(
        await db_session.scalars(
            select(AttemptEvent)
            .where(
                AttemptEvent.attempt_id == UUID(first["id"]),
            )
            .order_by(AttemptEvent.sequence)
        )
    )
    assert [event.kind for event in events] == [
        "attempt.started",
        "card.draft_saved",
        "card.notified",
        "assessment.rules_completed",
        "command.rejected",
    ]


async def test_student_cannot_read_other_work_or_teacher_answers(exercise):
    e = exercise
    first = await e.start()
    for method, path, payload in [
        ("GET", f"student/lessons/{e.lesson['id']}", None),
        ("POST", f"student/assignments/{first['assignment_id']}/start", None),
        ("GET", f"student/attempts/{first['id']}", None),
        ("GET", f"student/attempts/{first['id']}/classifier-entries", None),
        ("GET", f"student/attempts/{first['id']}/recipients", None),
        ("PUT", f"student/attempts/{first['id']}/card", {"revision": 1, "data": {}}),
        ("POST", f"student/attempts/{first['id']}/submit", {"revision": 1}),
    ]:
        await e.request(method, path, payload, actor="student2", status=404)
    assert await e.request("GET", "student/lessons", actor="student2") == []
    await e.request("GET", f"scenarios/{e.d.scenario['id']}", status=403)
    await e.request("GET", "student/lessons", actor="teacher", status=403)


async def test_drafts_and_submit_validation(exercise, db_session):
    e = exercise
    first = await e.start()
    path = f"student/attempts/{first['id']}"
    await e.request("POST", f"{path}/submit", {"revision": 1}, status=422)
    await e.request(
        "PUT",
        f"{path}/card",
        {"revision": 1, "classifier_entry_id": str(uuid4()), "data": {}},
        status=422,
    )
    await e.request(
        "PUT", f"{path}/card", {"revision": 1, "data": {}, "status": "notified"}, status=422
    )
    partial = await e.request(
        "PUT", f"{path}/card", {"revision": 1, "data": {"caller_name": "Имя"}}
    )
    assert partial["card"]["revision"] == 2
    await e.request("PUT", f"{path}/card", {"revision": 1, "data": {}}, status=409)
    await e.request("POST", f"{path}/submit", {"revision": 1}, status=409)
    filled = await e.fill(partial)
    route = await db_session.scalar(
        select(ClassifierRoute).where(ClassifierRoute.entry_id == e.t.entry.id)
    )
    route.conditions = {"unknown_rule": True}
    await db_session.commit()
    await e.request("POST", f"{path}/submit", {"revision": filled["card"]["revision"]}, status=409)
    assert await db_session.scalar(select(func.count()).select_from(ServiceResponse)) == 0
    assert (await e.request("GET", path))["status"] == "in_progress"


async def test_group_lesson_finishes_only_after_all_students(teaching, db_client, db_session):
    t = teaching
    d = await t.prepare()
    lesson = await t.post("lessons/start", d.payload)
    for actor in ("student", "student2"):
        headers = t.headers[actor]
        work = (
            await db_client.get(f"/api/v1/student/lessons/{lesson['id']}", headers=headers)
        ).json()
        for assignment in work["assignments"]:
            attempt = (
                await db_client.post(
                    f"/api/v1/student/assignments/{assignment['id']}/start", headers=headers
                )
            ).json()
            filled = await db_client.put(
                f"/api/v1/student/attempts/{attempt['id']}/card",
                headers=headers,
                json={
                    "revision": 1,
                    "classifier_entry_id": str(t.entry.id),
                    "data": t.card_payload["data"],
                },
            )
            response = await db_client.post(
                f"/api/v1/student/attempts/{attempt['id']}/submit",
                headers=headers,
                json={"revision": filled.json()["card"]["revision"]},
            )
            assert response.status_code == 200, response.text
        row = await db_session.get(Lesson, UUID(lesson["id"]))
        assert row.status == ("active" if actor == "student" else "finished")
