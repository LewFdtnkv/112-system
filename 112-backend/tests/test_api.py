from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, refresh_token_hash, verify_password
from app.main import app
from app.models import AuthSession, User

NEW_PASSWORD = "new-admin-password-112"


def bearer(pair: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {pair['access_token']}"}


async def login(client: AsyncClient, username: str = "admin", password: str = "admin") -> dict:
    response = await client.post(
        "/api/v1/auth/login", json={"username": username, "password": password}
    )
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    return response.json()


async def refresh(client: AsyncClient, pair: dict):
    return await client.post("/api/v1/auth/refresh", json={"refresh_token": pair["refresh_token"]})


@pytest.mark.anyio
async def test_public_health_and_missing_credentials() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/health/live")).json() == {"status": "ok"}
        for path in ("/api/v1/users/me", "/api/v1/users", f"/api/v1/users/{uuid4()}"):
            response = await client.get(path)
            assert response.status_code == 401
            assert response.headers["www-authenticate"] == "Bearer"
        assert (await client.get("/api/v1/workstations")).status_code == 404


@pytest.mark.anyio
async def test_bootstrap_requires_password_change(db_client: AsyncClient, db_session: AsyncSession):
    admin = await db_session.scalar(select(User).where(User.username == "admin"))
    assert admin.is_admin and not admin.is_teacher and admin.is_active
    assert admin.must_change_password and admin.password_hash != "admin"
    assert verify_password("admin", admin.password_hash)
    pair = await login(db_client, " ADMIN ")
    assert pair["must_change_password"] is True
    assert pair["token_type"] == "bearer" and pair["expires_in"] > 0
    for path in ("/api/v1/users/me", "/api/v1/users", f"/api/v1/users/{admin.id}"):
        response = await db_client.get(path, headers=bearer(pair))
        assert response.status_code == 403
        assert response.json()["detail"] == "password_change_required"
    rotated = await refresh(db_client, pair)
    assert rotated.status_code == 200 and rotated.json()["must_change_password"] is True
    assert (
        await db_client.get("/api/v1/users/me", headers=bearer(rotated.json()))
    ).status_code == 403
    second_session = await login(db_client)
    changed = await db_client.post(
        "/api/v1/auth/change-password",
        headers=bearer(rotated.json()),
        json={"current_password": "admin", "new_password": NEW_PASSWORD},
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["must_change_password"] is False
    me = await db_client.get("/api/v1/users/me", headers=bearer(changed.json()))
    assert me.status_code == 200
    assert me.json()["username"] == "admin"
    assert me.json()["password_changed_at"] and me.json()["last_login_at"]
    assert "password_hash" not in me.json() and "password" not in me.json()
    for old_pair in (pair, rotated.json(), second_session):
        assert (
            await db_client.get("/api/v1/users/me", headers=bearer(old_pair))
        ).status_code == 401
        assert (await refresh(db_client, old_pair)).status_code == 401
    response = await db_client.post(
        "/api/v1/auth/login", json={"username": "admin", "password": "admin"}
    )
    assert response.status_code == 401
    assert (await login(db_client, password=NEW_PASSWORD))["must_change_password"] is False


@pytest.mark.parametrize("is_admin,is_teacher", [(False, False), (False, True), (True, False)])
@pytest.mark.anyio
async def test_access_matrix(db_client, db_session, is_admin, is_teacher):
    user = User(
        username=f"test-{uuid4()}",
        password_hash=hash_password(NEW_PASSWORD),
        is_admin=is_admin,
        is_teacher=is_teacher,
        must_change_password=False,
    )
    db_session.add(user)
    await db_session.commit()
    pair = await login(db_client, user.username, NEW_PASSWORD)
    headers = bearer(pair)
    assert (await db_client.get("/api/v1/users/me", headers=headers)).json()["id"] == str(user.id)
    expected = 200 if is_admin or is_teacher else 403
    response = await db_client.get("/api/v1/users?limit=1&offset=0", headers=headers)
    assert response.status_code == expected
    if expected == 200:
        assert len(response.json()) == 1
        assert "password_hash" not in response.json()[0]
        assert (await db_client.get("/api/v1/users?limit=101", headers=headers)).status_code == 422
    assert (
        await db_client.get(f"/api/v1/users/{user.id}", headers=headers)
    ).status_code == expected
    response = await db_client.get(f"/api/v1/users/{uuid4()}", headers=headers)
    assert response.status_code == (404 if expected == 200 else 403)
    # Existing tokens must not retain removed privileges.
    user.is_admin = False
    user.is_teacher = False
    await db_session.commit()
    assert (await db_client.get("/api/v1/users", headers=headers)).status_code == 403
    user.must_change_password = True
    await db_session.commit()
    assert (await db_client.get("/api/v1/users/me", headers=headers)).status_code == 403


@pytest.mark.anyio
async def test_refresh_rotation_and_logout(db_client, db_session):
    pair = await login(db_client)
    auth_session = await db_session.scalar(
        select(AuthSession).where(
            AuthSession.refresh_token_hash == refresh_token_hash(pair["refresh_token"])
        )
    )
    assert auth_session and auth_session.refresh_token_hash != pair["refresh_token"]
    expiry = auth_session.expires_at
    response = await refresh(db_client, pair)
    assert response.status_code == 200
    fresh = response.json()
    assert fresh["refresh_token"] != pair["refresh_token"]
    assert fresh["access_token"] != pair["access_token"]
    assert auth_session.expires_at == expiry
    assert (await refresh(db_client, pair)).status_code == 401
    assert (await refresh(db_client, {"refresh_token": fresh["access_token"]})).status_code == 422
    headers = {"Authorization": f"Bearer {fresh['refresh_token']}"}
    assert (await db_client.get("/api/v1/users/me", headers=headers)).status_code == 401
    response = await db_client.post("/api/v1/auth/logout", headers=bearer(fresh))
    assert response.status_code == 204 and not response.content
    assert (await db_client.get("/api/v1/users/me", headers=bearer(fresh))).status_code == 401
    assert (await refresh(db_client, fresh)).status_code == 401


@pytest.mark.parametrize("state", ["inactive", "expired", "deleted"])
@pytest.mark.anyio
async def test_session_rejected(db_client, db_session, state):
    pair = await login(db_client)
    admin = await db_session.scalar(select(User).where(User.username == "admin"))
    if state == "inactive":
        admin.is_active = False
    elif state == "expired":
        auth_session = await db_session.scalar(
            select(AuthSession).where(AuthSession.user_id == admin.id)
        )
        auth_session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    else:
        await db_session.delete(admin)
    await db_session.commit()
    assert (await db_client.get("/api/v1/users/me", headers=bearer(pair))).status_code == 401
    assert (await refresh(db_client, pair)).status_code == 401
    if state != "expired":
        response = await db_client.post(
            "/api/v1/auth/login", json={"username": "admin", "password": "admin"}
        )
        assert response.status_code == 401


@pytest.mark.parametrize("username,password", [("admin", "wrong"), ("missing", "admin")])
@pytest.mark.anyio
async def test_invalid_login(db_client, username, password):
    response = await db_client.post(
        "/api/v1/auth/login", json={"username": username, "password": password}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials or expired session"


@pytest.mark.parametrize(
    "payload,status",
    [
        ({"current_password": "wrong", "new_password": NEW_PASSWORD}, 400),
        ({"current_password": "admin", "new_password": "short"}, 422),
        ({"current_password": "admin", "new_password": " " * 12}, 400),
        ({"current_password": "admin", "new_password": NEW_PASSWORD, "is_admin": True}, 422),
    ],
)
@pytest.mark.anyio
async def test_password_validation(db_client, payload, status):
    pair = await login(db_client)
    response = await db_client.post(
        "/api/v1/auth/change-password", headers=bearer(pair), json=payload
    )
    assert response.status_code == status
    response = await db_client.get("/api/v1/users/me", headers=bearer(pair))
    assert response.json()["detail"] == "password_change_required"


@pytest.mark.anyio
async def test_cannot_reuse_current_password(db_client, db_session):
    user = User(
        username="test-same-password",
        password_hash=hash_password(NEW_PASSWORD),
        must_change_password=False,
    )
    db_session.add(user)
    await db_session.commit()
    pair = await login(db_client, user.username, NEW_PASSWORD)
    response = await db_client.post(
        "/api/v1/auth/change-password",
        headers=bearer(pair),
        json={"current_password": NEW_PASSWORD, "new_password": NEW_PASSWORD},
    )
    assert response.status_code == 400
