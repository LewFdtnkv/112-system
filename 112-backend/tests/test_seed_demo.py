import json
import stat

import anyio
import pytest
from sqlalchemy import func, select

from app.models import ClassifierEntry, ClassifierVersion, Lesson, Service, TrainingGroup, User
from scripts import seed_demo


@pytest.mark.anyio
@pytest.mark.parametrize("with_training", [False, True])
async def test_seed_from_admin_only_database_and_repeat(
    db_client, db_session, monkeypatch, tmp_path, with_training
):
    class InProcessAPI(seed_demo.API):
        def request(self, method, path, payload=None, expected=(200,)):
            async def send():
                headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
                return await db_client.request(
                    method, f"/api/v1/{path}", json=payload, headers=headers
                )

            response = anyio.from_thread.run(send)
            if response.status_code not in expected:
                raise seed_demo.APIError(method, path, response.status_code)
            return response.json() if response.content else None

    monkeypatch.setattr(seed_demo, "API", InProcessAPI)
    state_path = tmp_path / "state.json"
    first = await anyio.to_thread.run_sync(
        seed_demo.run, "http://test", state_path, "test", "admin", with_training
    )
    second = await anyio.to_thread.run_sync(
        seed_demo.run, "http://test", state_path, "test", "admin", with_training
    )
    assert first == second
    for model, expected in [
        (User, 3 if with_training else 1),
        (TrainingGroup, 1 if with_training else 0),
        (Lesson, 1 if with_training else 0),
        (Service, 211),
        (ClassifierEntry, 51),
        (ClassifierVersion, 1),
    ]:
        assert await db_session.scalar(select(func.count()).select_from(model)) == expected
    assert first["feature_count"] == 177
    if with_training:
        assert first["training"]["card_count"] == 6
    assert stat.S_IMODE(state_path.stat().st_mode) == 0o600
    state = json.loads(state_path.read_text())
    if with_training:
        for role in ("teacher", "student"):
            account = state["accounts"][role]
            assert account["password"] == f"test-{role}-123"
            assert first["training"]["accounts"][role]["password"] == account["password"]
            response = await db_client.post(
                "/api/v1/auth/login",
                json={"username": account["username"], "password": account["password"]},
            )
            assert response.status_code == 200
            assert response.json()["must_change_password"] is False
            rejected = await db_client.post(
                "/api/v1/auth/login",
                json={"username": account["username"], "password": account["initial_password"]},
            )
            assert rejected.status_code == 401
    assert state["admin_new_password"] not in json.dumps(first)
    with pytest.raises(RuntimeError, match="другому API"):
        seed_demo.State(state_path, "http://another", "test")
    assert json.loads(state_path.read_text()) == state


@pytest.mark.anyio
@pytest.mark.parametrize("database", [False, True])
@pytest.mark.parametrize("phase", ["initial", "changed", "interrupted"])
async def test_upgrade_old_seed_credentials(db_client, db_session, tmp_path, database, phase):
    from app.schemas.user import UserCreate
    from app.services import auth
    from app.services.users import create_user
    from scripts.seed_training import DatabaseGateway, HTTPGateway

    account = {
        "username": "legacy-student",
        "initial_password": "old-initial-password",
        "password": "old-final-password",
        "pending_password": "legacy-student-123",
    }
    user = await create_user(
        db_session,
        UserCreate(
            username=account["username"],
            initial_password=account["initial_password"],
            role="student",
        ),
    )
    if phase != "initial":
        pair = await auth.login(db_session, account["username"], account["initial_password"])
        identity = await auth.authenticate(db_session, pair.access_token)
        await auth.change_password(
            db_session,
            identity,
            account["initial_password"],
            account["password"] if phase == "changed" else account["pending_password"],
        )

    if database:
        gateway = DatabaseGateway(db_session, None)
        await gateway.prepare_account(str(user.id), account)
    else:

        class InProcessAPI(seed_demo.API):
            def request(self, method, path, payload=None, expected=(200,)):
                async def send():
                    headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
                    return await db_client.request(
                        method, f"/api/v1/{path}", json=payload, headers=headers
                    )

                response = anyio.from_thread.run(send)
                if response.status_code not in expected:
                    raise seed_demo.APIError(method, path, response.status_code)
                return response.json() if response.content else None

        def prepare():
            import asyncio

            admin = InProcessAPI("http://test")
            admin.authenticate("admin", "admin", "admin-test-password")
            asyncio.run(HTTPGateway(admin, InProcessAPI).prepare_account(str(user.id), account))

        await anyio.to_thread.run_sync(prepare)
    response = await db_client.post(
        "/api/v1/auth/login",
        json={
            "username": account["username"],
            "password": account["pending_password"],
        },
    )
    assert response.status_code == 200
    assert response.json()["must_change_password"] is False
