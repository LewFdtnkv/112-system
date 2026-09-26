from io import BytesIO

import pytest
from PIL import Image
from sqlalchemy import select
from test_teacher_api import teaching as teaching

from app.models import UserActivity

pytestmark = pytest.mark.anyio


@pytest.mark.parametrize("actor", ["student", "teacher", "admin"])
async def test_own_profile_and_photo_persist_without_changing_permissions(
    teaching, db_client, db_session, actor
):
    t = teaching
    headers = t.headers[actor]
    before = (await db_client.get("/api/v1/users/me", headers=headers)).json()
    response = await db_client.patch(
        "/api/v1/users/me",
        headers=headers,
        json={"first_name": "Анна", "last_name": "Петрова", "middle_name": None},
    )
    assert response.status_code == 200
    after = (await db_client.get("/api/v1/users/me", headers=headers)).json()
    assert after["first_name"] == "Анна" and after["middle_name"] is None
    assert after["role"] == before["role"] and after["username"] == before["username"]
    assert after["is_active"] == before["is_active"]
    event = await db_session.scalar(
        select(UserActivity).where(
            UserActivity.user_id == t.accounts[actor].id, UserActivity.kind == "account.updated"
        )
    )
    assert event.actor_id == t.accounts[actor].id
    buffer = BytesIO()
    Image.new("RGB", (600, 400), "blue").save(buffer, "PNG")
    uploaded = await db_client.put(
        "/api/v1/users/me/photo", headers=headers, content=buffer.getvalue()
    )
    assert uploaded.status_code == 204
    photo = await db_client.get(f"/api/v1/users/{before['id']}/photo", headers=headers)
    assert photo.status_code == 200
    with Image.open(BytesIO(photo.content)) as image:
        assert image.format == "JPEG" and max(image.size) == 512
    assert (
        await db_client.put("/api/v1/users/me/photo", headers=headers, content=b"<svg/>")
    ).status_code == 422
    # A failed upload must not replace the existing photo.
    assert (
        await db_client.get(f"/api/v1/users/{before['id']}/photo", headers=headers)
    ).content == photo.content
    assert (
        await db_client.put("/api/v1/users/me/photo", headers=headers, content=b"x" * 2_000_001)
    ).status_code == 413


@pytest.mark.parametrize(
    "extra",
    [
        {"role": "admin"},
        {"is_admin": True},
        {"is_active": False},
        {"username": "another"},
        {"first_name": "x" * 101},
    ],
)
async def test_profile_rejects_privilege_login_and_invalid_field_changes(
    teaching, db_client, extra
):
    response = await db_client.patch(
        "/api/v1/users/me", headers=teaching.headers["student"], json=extra
    )
    assert response.status_code == 422


async def test_profile_does_not_allow_modifying_another_user(teaching, db_client):
    t = teaching
    for path in (f"/api/v1/users/{t.accounts['student2'].id}",):
        assert (
            await db_client.patch(path, headers=t.headers["student"], json={"first_name": "Other"})
        ).status_code == 403
    assert (
        await db_client.put(
            f"/api/v1/admin/users/{t.accounts['student2'].id}/photo",
            headers=t.headers["student"],
            content=b"bad",
        )
    ).status_code == 403
    assert (
        await db_client.patch("/api/v1/users/me", json={"first_name": "Anonymous"})
    ).status_code == 401
