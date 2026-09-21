from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError
from test_teacher_api import PASSWORD
from test_teacher_api import teaching as teaching

from app.models import User, UserActivity

pytestmark = pytest.mark.anyio


@pytest.mark.parametrize("role", ["student", "teacher", "admin"])
async def test_exclusive_role_creation(teaching, role):
    user = await teaching.post(
        "users",
        {"username": f"role-{uuid4()}", "initial_password": PASSWORD, "role": role},
        actor="admin",
    )
    assert user["role"] == role
    assert user["is_admin"] == (role == "admin")
    assert user["is_teacher"] == (role == "teacher")


@pytest.mark.parametrize(
    "patch",
    [
        {"is_admin": True, "is_teacher": True},
        {"role": "admin", "is_teacher": True},
        {"role": "student", "is_admin": True},
        {"role": "other"},
    ],
)
async def test_reject_ambiguous_roles(teaching, patch):
    await teaching.post(
        "users",
        {"username": "bad-roles", "initial_password": PASSWORD} | patch,
        actor="admin",
        expected=422,
    )


async def test_database_rejects_combined_roles(db_session):
    async with db_session.begin_nested():
        db_session.add(
            User(username=f"both-{uuid4()}", password_hash="unused", is_admin=True, is_teacher=True)
        )
        with pytest.raises(IntegrityError):
            await db_session.flush()


async def test_disable_reenable_revokes_old_tokens(teaching, db_client):
    t = teaching
    path = f"/api/v1/users/{t.accounts['student'].id}"
    credentials = {"username": t.accounts["student"].username, "password": PASSWORD}
    old = (await db_client.post("/api/v1/auth/login", json=credentials)).json()
    for actor in ("teacher", "student"):
        assert (
            await db_client.patch(path, headers=t.headers[actor], json={"is_active": False})
        ).status_code == 403
    disabled = await db_client.patch(
        path,
        headers=t.headers["admin"],
        json={
            "reason": "Проверка блокировки",
            "is_active": False,
            "first_name": "Иван",
            "email": "student@example.test",
        },
    )
    assert disabled.status_code == 200
    assert not disabled.json()["is_active"] and disabled.json()["last_login_at"]
    assert disabled.json()["role"] == "student"
    assert (await db_client.post("/api/v1/auth/login", json=credentials)).status_code == 401
    assert (
        await db_client.get("/api/v1/users/me", headers=t.headers["student"])
    ).status_code == 401
    enabled = await db_client.patch(
        path, headers=t.headers["admin"], json={"is_active": True, "reason": "Доступ восстановлен"}
    )
    assert enabled.status_code == 200 and enabled.json()["first_name"] == "Иван"
    assert (
        await db_client.post("/api/v1/auth/refresh", json={"refresh_token": old["refresh_token"]})
    ).status_code == 401
    assert (
        await db_client.get("/api/v1/users/me", headers=t.headers["student"])
    ).status_code == 401
    assert (await db_client.post("/api/v1/auth/login", json=credentials)).status_code == 200


@pytest.mark.parametrize("original", ["student", "teacher", "admin"])
@pytest.mark.parametrize("target", ["student", "teacher", "admin"])
async def test_existing_role_cannot_be_submitted_or_changed(teaching, db_client, original, target):
    t = teaching
    path = f"/api/v1/users/{t.accounts[original].id}"
    before = (await db_client.get(path, headers=t.headers["admin"])).json()
    response = await db_client.patch(
        path,
        headers=t.headers["admin"],
        json={"role": target, "first_name": "Must not be saved", "reason": "Change role"},
    )
    assert response.status_code == 422
    after = (await db_client.get(path, headers=t.headers["admin"])).json()
    assert after == before
    # Rejected changes do not revoke the existing account's session.
    me = await db_client.get("/api/v1/users/me", headers=t.headers[original])
    assert me.status_code == 200 and me.json()["role"] == original


@pytest.mark.parametrize("original", ["student", "teacher", "admin"])
async def test_profile_edit_preserves_role(teaching, db_client, original):
    t = teaching
    path = f"/api/v1/users/{t.accounts[original].id}"
    changed = await db_client.patch(
        path, headers=t.headers["admin"], json={"first_name": "Новое имя"}
    )
    assert changed.status_code == 200
    assert changed.json()["role"] == original
    assert changed.json()["first_name"] == "Новое имя"
    assert changed.json()["is_admin"] == (original == "admin")
    assert changed.json()["is_teacher"] == (original == "teacher")


async def test_self_lockout_and_invalid_updates_are_rejected(teaching, db_client):
    t = teaching
    own = f"/api/v1/users/{t.accounts['admin'].id}"
    assert (
        await db_client.patch(own, headers=t.headers["admin"], json={"is_active": False})
    ).status_code == 409
    path = f"/api/v1/users/{t.accounts['teacher'].id}"
    for payload in (
        {"role": None},
        {"is_active": None},
        {"is_teacher": False},
        {"is_admin": True},
        {"email": "invalid"},
        {"first_name": None},
    ):
        assert (
            await db_client.patch(path, headers=t.headers["admin"], json=payload)
        ).status_code == 422


async def test_concurrent_admin_disabling_keeps_one_authorized_admin(auth_settings):
    import asyncio
    import os

    from httpx import ASGITransport, AsyncClient
    from sqlalchemy import delete, select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.security import hash_password
    from app.db.session import get_session
    from app.main import app

    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Requires a migrated test PostgreSQL database")
    engine = create_async_engine(url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    ids = [uuid4(), uuid4()]

    async def isolated_session():
        async with factory() as session:
            yield session

    try:
        async with factory() as session:
            for user_id in ids:
                session.add(
                    User(
                        id=user_id,
                        username=f"admin-{user_id}",
                        password_hash=hash_password(PASSWORD),
                        is_admin=True,
                        must_change_password=False,
                    )
                )
            await session.commit()
        app.dependency_overrides[get_session] = isolated_session
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            pairs = [
                (
                    await client.post(
                        "/api/v1/auth/login",
                        json={"username": f"admin-{user_id}", "password": PASSWORD},
                    )
                ).json()
                for user_id in ids
            ]
            responses = await asyncio.wait_for(
                asyncio.gather(
                    *[
                        client.patch(
                            f"/api/v1/users/{ids[1 - index]}",
                            headers={"Authorization": f"Bearer {pair['access_token']}"},
                            json={"is_active": False, "reason": "Отключение доступа"},
                        )
                        for index, pair in enumerate(pairs)
                    ]
                ),
                timeout=10,
            )
            assert sorted(r.status_code for r in responses) in ([200, 401], [200, 403])
        async with factory() as session:
            accounts = list(await session.scalars(select(User).where(User.id.in_(ids))))
            assert all(user.is_admin and not user.is_teacher for user in accounts)
            assert sum(user.is_active for user in accounts) == 1
    finally:
        app.dependency_overrides.pop(get_session, None)
        async with factory() as session:
            await session.execute(
                delete(UserActivity).where(
                    UserActivity.user_id.in_(ids) | UserActivity.actor_id.in_(ids)
                )
            )
            await session.execute(delete(User).where(User.id.in_(ids)))
            await session.commit()
        await engine.dispose()
