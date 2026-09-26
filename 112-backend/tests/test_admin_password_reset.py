from uuid import uuid4

import pytest
from sqlalchemy import select
from test_teacher_api import PASSWORD
from test_teacher_api import teaching as teaching

from app.core.security import verify_password
from app.models import UserActivity

pytestmark = pytest.mark.anyio
TEMPORARY = "admin-temporary-password"
PERMANENT = "new-personal-password"


@pytest.mark.parametrize("role", ["student", "teacher", "admin"])
async def test_reset_revokes_sessions_and_requires_different_password(
    teaching, db_client, db_session, role
):
    t = teaching
    user = t.accounts[role]
    url = f"/api/v1/users/{user.id}/reset-password"
    credentials = {"username": user.username, "password": PASSWORD}
    pairs = [
        (await db_client.post("/api/v1/auth/login", json=credentials)).json() for _ in range(2)
    ]
    before_role = user.role
    response = await db_client.post(
        url, headers=t.headers["admin"], json={"temporary_password": TEMPORARY}
    )
    assert response.status_code == 200
    assert response.json()["must_change_password"] is True
    assert response.json()["role"] == before_role
    assert response.json()["password_changed_at"]
    assert TEMPORARY not in response.text and "password_hash" not in response.text
    for pair in pairs:
        old_headers = {"Authorization": f"Bearer {pair['access_token']}"}
        assert (await db_client.get("/api/v1/users/me", headers=old_headers)).status_code == 401
        assert (
            await db_client.post(
                "/api/v1/auth/refresh", json={"refresh_token": pair["refresh_token"]}
            )
        ).status_code == 401
        assert (
            await db_client.post(
                "/api/v1/auth/change-password",
                headers=old_headers,
                json={"current_password": PASSWORD, "new_password": PERMANENT},
            )
        ).status_code == 401
    assert (await db_client.post("/api/v1/auth/login", json=credentials)).status_code == 401
    pair = (
        await db_client.post("/api/v1/auth/login", json=credentials | {"password": TEMPORARY})
    ).json()
    assert pair["must_change_password"] is True
    headers = {"Authorization": f"Bearer {pair['access_token']}"}
    for protected in ("users/me", "views/users", "student/overview"):
        result = await db_client.get(f"/api/v1/{protected}", headers=headers)
        assert result.status_code == 403 and result.json()["detail"] == "password_change_required"
    assert (
        await db_client.post(
            "/api/v1/auth/change-password",
            headers=headers,
            json={"current_password": TEMPORARY, "new_password": TEMPORARY},
        )
    ).status_code == 400
    changed = await db_client.post(
        "/api/v1/auth/change-password",
        headers=headers,
        json={"current_password": TEMPORARY, "new_password": PERMANENT},
    )
    assert changed.status_code == 200 and not changed.json()["must_change_password"]
    assert (
        await db_client.get(
            "/api/v1/users/me",
            headers={"Authorization": f"Bearer {changed.json()['access_token']}"},
        )
    ).status_code == 200
    assert (
        await db_client.post("/api/v1/auth/login", json=credentials | {"password": TEMPORARY})
    ).status_code == 401
    events = list(
        await db_session.scalars(
            select(UserActivity).where(
                UserActivity.user_id == user.id, UserActivity.kind == "account.password_reset"
            )
        )
    )
    assert len(events) == 1 and events[0].actor_id == t.accounts["admin"].id
    assert not events[0].details and not events[0].reason


async def test_reset_permissions_and_validation(teaching, db_client, db_session):
    t = teaching
    user = t.accounts["student"]
    url = f"/api/v1/users/{user.id}/reset-password"
    for actor in ("teacher", "student", None):
        response = await db_client.post(
            url, headers=t.headers[actor] if actor else {}, json={"temporary_password": TEMPORARY}
        )
        assert response.status_code == (403 if actor else 401)
    for value in ("short", " " * 12, "x" * 129, None, 123456789012):
        response = await db_client.post(
            url, headers=t.headers["admin"], json={"temporary_password": value}
        )
        assert response.status_code == 422
        assert response.json()["detail"][0]["loc"] == ["body", "temporary_password"]
        assert "input" not in response.json()["detail"][0]
    assert (
        await db_client.post(
            url,
            headers=t.headers["admin"],
            json={"temporary_password": TEMPORARY, "must_change_password": False},
        )
    ).status_code == 422
    assert (
        await db_client.post(
            f"/api/v1/users/{uuid4()}/reset-password",
            headers=t.headers["admin"],
            json={"temporary_password": TEMPORARY},
        )
    ).status_code == 404
    await db_session.refresh(user)
    assert verify_password(PASSWORD, user.password_hash) and not user.must_change_password


async def test_reset_does_not_reactivate_disabled_user(teaching, db_client):
    t = teaching
    user = t.accounts["student"]
    base = f"/api/v1/users/{user.id}"
    assert (
        await db_client.patch(
            base, headers=t.headers["admin"], json={"is_active": False, "reason": "Test"}
        )
    ).status_code == 200
    response = await db_client.post(
        base + "/reset-password", headers=t.headers["admin"], json={"temporary_password": TEMPORARY}
    )
    assert response.status_code == 200 and not response.json()["is_active"]
    assert (
        await db_client.post(
            "/api/v1/auth/login", json={"username": user.username, "password": TEMPORARY}
        )
    ).status_code == 401
