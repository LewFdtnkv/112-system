import asyncio
import os
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.security import hash_password
from app.db.session import get_session
from app.main import app
from app.models import User


@pytest.mark.parametrize("operation", ["refresh", "change-password"])
@pytest.mark.anyio
async def test_concurrent_token_mutations(auth_settings, operation):
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL must point to a migrated test PostgreSQL database")
    engine = create_async_engine(url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    user_id = uuid4()
    username = f"race-{user_id}"
    password = "initial-race-password"

    async def isolated_session():
        async with factory() as session:
            yield session

    try:
        async with factory() as session:
            session.add(User(id=user_id, username=username, password_hash=hash_password(password)))
            await session.commit()
        app.dependency_overrides[get_session] = isolated_session
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            login = await client.post(
                "/api/v1/auth/login", json={"username": username, "password": password}
            )
            assert login.status_code == 200
            pair = login.json()
            headers = {"Authorization": f"Bearer {pair['access_token']}"}
            payload = (
                {"refresh_token": pair["refresh_token"]}
                if operation == "refresh"
                else {"current_password": password, "new_password": "replacement-race-password"}
            )
            responses = await asyncio.gather(
                *[
                    client.post(f"/api/v1/auth/{operation}", headers=headers, json=payload)
                    for _ in range(2)
                ]
            )
            assert sorted(response.status_code for response in responses) == [200, 401]
            winner = next(response.json() for response in responses if response.status_code == 200)
            refreshed = await client.post(
                "/api/v1/auth/refresh", json={"refresh_token": winner["refresh_token"]}
            )
            assert refreshed.status_code == 200
            if operation == "change-password":
                assert (await client.get("/api/v1/users/me", headers=headers)).status_code == 401
                new_headers = {"Authorization": f"Bearer {refreshed.json()['access_token']}"}
                assert (
                    await client.get("/api/v1/users/me", headers=new_headers)
                ).status_code == 200
    finally:
        app.dependency_overrides.pop(get_session, None)
        async with factory() as session:
            await session.execute(delete(User).where(User.id == user_id))
            await session.commit()
        await engine.dispose()
