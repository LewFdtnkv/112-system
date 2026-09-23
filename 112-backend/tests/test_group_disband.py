from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from test_student_workflow import exercise as exercise
from test_teacher_api import teaching as teaching

from app.models import GroupMembership, User, UserActivity

pytestmark = pytest.mark.anyio


async def test_disband_preserves_work_results_accounts_and_other_memberships(exercise, db_session):
    e = exercise
    group_id = e.d.group["id"]
    student_id = e.t.accounts["student"].id
    other = await e.t.post("groups", {"name": "Другая группа"})
    await e.request("PUT", f"groups/{other['id']}/students/{student_id}", actor="teacher")
    message = await e.t.post("messages", {"group_id": group_id, "text": "Учебное объявление"})
    await e.complete()
    disbanded = await e.request("POST", f"groups/{group_id}/disband", actor="teacher")
    assert disbanded["disbanded_at"]
    assert await e.request("POST", f"groups/{group_id}/disband", actor="teacher") == disbanded
    assert await e.request("GET", f"groups/{group_id}", actor="teacher") == disbanded
    assert await e.request("GET", f"groups/{group_id}/students", actor="teacher") == []
    assert [g["id"] for g in await e.request("GET", "groups", actor="teacher")] == [other["id"]]
    listing = await e.request("GET", "views/groups", actor="teacher")
    assert listing["total"] == 1 and listing["items"][0]["id"] == other["id"]
    assert (await e.request("GET", "views/groups?q=Учебная", actor="teacher"))["total"] == 0
    assert await db_session.get(GroupMembership, (UUID(other["id"]), student_id))
    assert (await db_session.get(User, student_id)).is_active
    assert (
        await db_session.scalar(
            select(func.count())
            .select_from(UserActivity)
            .where(UserActivity.kind == "group.disbanded")
        )
        == 2
    )
    inbox = await e.request("GET", "student/messages")
    assert inbox["items"][0]["id"] == message["id"]

    # Idempotent replay of an existing launch is valid even after disbanding.
    replay = await e.t.post(
        "lessons/start", e.d.payload | {"student_id": str(student_id)}, expected=200
    )
    assert replay["id"] == e.lesson["id"]
    await e.complete(1)
    await e.complete(2)
    work = await e.request("GET", f"student/lessons/{e.lesson['id']}")
    assert work["work_status"] == "submitted"
    assert (await e.request("GET", f"student/lessons/{e.lesson['id']}/evaluation"))[
        "score"
    ] is not None
    # Remove the last membership too: historical assignments still authorize the teacher.
    await e.request("POST", f"groups/{other['id']}/disband", actor="teacher")
    profile = await e.request("GET", f"teaching/students/{student_id}", actor="teacher")
    assert profile["lessons"]["total"] == 1


async def test_disband_authorization_and_rejects_new_group_operations(teaching, db_client):
    t = teaching
    d = await t.prepare()
    group_id = d.group["id"]
    for actor, expected in (("other", 404), ("student", 403), ("admin", 403)):
        await t.post(f"groups/{group_id}/disband", {}, actor=actor, expected=expected)
    response = await db_client.post(f"/api/v1/groups/{group_id}/disband")
    assert response.status_code == 401
    await t.post(f"groups/{group_id}/disband", {}, expected=200)
    await t.post("lessons/start", d.payload | {"request_id": str(uuid4())}, expected=409)
    await t.post("messages", {"group_id": group_id, "text": "Новое объявление"}, expected=409)
    target = await t.post("groups", {"name": "Действующая группа"})
    student_id = t.accounts["student"].id
    for method, path, body, status in (
        ("PUT", f"groups/{group_id}/students/{student_id}", None, 409),
        ("PUT", f"groups/{target['id']}/students/{student_id}", None, 200),
        (
            "POST",
            f"groups/{target['id']}/students/{student_id}/transfer",
            {"target_group_id": group_id},
            409,
        ),
        (
            "POST",
            f"groups/{group_id}/students/{student_id}/transfer",
            {"target_group_id": target["id"]},
            409,
        ),
    ):
        response = await db_client.request(
            method, f"/api/v1/{path}", json=body, headers=t.headers["teacher"]
        )
        assert response.status_code == status, response.text
    # Empty groups can be disbanded too.
    empty = await t.post("groups", {"name": "Пустая группа"})
    assert (await t.post(f"groups/{empty['id']}/disband", {}, expected=200))["disbanded_at"]
