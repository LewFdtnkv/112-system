import json
import stat

import pytest
from sqlalchemy import func, select

from app.core.security import verify_password
from app.models import User, UserActivity
from app.services import auth
from scripts.seed_credentials import prepare_admin
from scripts.seed_demo import State


@pytest.mark.anyio
async def test_database_seed_stores_final_admin_password_and_revokes_sessions(
    db_session, tmp_path, auth_settings, db_client
):
    state = State(tmp_path / "seed.json", "http://isolated", "demo")
    pair = await auth.login(db_session, "admin", "admin")
    identity = await auth.authenticate(db_session, pair.access_token)
    await prepare_admin(db_session, identity.user, state)
    saved = json.loads(state.path.read_text())
    password = saved["admin_new_password"]
    assert password != "admin"
    assert "admin" not in saved.get("accounts", {})
    response = await db_client.post(
        "/api/v1/auth/login", json={"username": "admin", "password": password}
    )
    assert response.status_code == 200
    assert response.json()["must_change_password"] is False
    assert (
        await db_client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin"})
    ).status_code == 401
    assert verify_password(password, identity.user.password_hash)
    assert not identity.user.must_change_password
    assert stat.S_IMODE(state.path.stat().st_mode) == 0o600
    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        await auth.authenticate(db_session, pair.access_token)
    current = await auth.login(db_session, "admin", password)
    assert not current.must_change_password
    activity_count = await db_session.scalar(select(func.count()).select_from(UserActivity))
    await prepare_admin(db_session, identity.user, state)
    assert activity_count == await db_session.scalar(select(func.count()).select_from(UserActivity))
    assert await auth.authenticate(db_session, current.access_token)


@pytest.mark.anyio
async def test_database_seed_rejects_foreign_state_before_password_change(db_session, tmp_path):
    state = State(tmp_path / "seed.json", "http://isolated", "demo")
    state.remember("admin", "another-admin")
    admin = await db_session.scalar(select(User).where(User.username == "admin"))
    previous = admin.password_hash
    with pytest.raises(RuntimeError, match="БД заменена"):
        await prepare_admin(db_session, admin, state)
    assert previous == admin.password_hash


@pytest.mark.anyio
async def test_database_seed_recovers_after_state_write_failure(db_session, tmp_path, monkeypatch):
    state = State(tmp_path / "seed.json", "http://isolated", "demo")
    admin = await db_session.scalar(select(User).where(User.username == "admin"))
    save = state.save
    writes = 0

    def fail_after_password_commit():
        nonlocal writes
        writes += 1
        if writes == 2:
            raise OSError("disk unavailable")
        save()

    monkeypatch.setattr(state, "save", fail_after_password_commit)
    with pytest.raises(OSError, match="disk unavailable"):
        await prepare_admin(db_session, admin, state)
    recovered = State(state.path, "http://isolated", "demo")
    assert verify_password(recovered.data["admin_new_password"], admin.password_hash)
    await prepare_admin(db_session, admin, recovered)
    assert verify_password(recovered.data["admin_new_password"], admin.password_hash)


@pytest.mark.parametrize(
    "flags",
    [
        [],
        ["--database", "--full-demo"],
        ["--database", "--profiles-only"],
        ["--database", "--with-training"],
        ["--database", "--with-crew-calls"],
    ],
)
def test_admin_only_requires_database_and_no_population_flags(monkeypatch, flags, capsys):
    from scripts import seed_demo

    monkeypatch.setattr("sys.argv", ["seed_demo.py", "--admin-only", *flags])
    with pytest.raises(SystemExit) as exc:
        seed_demo.main()
    assert exc.value.code == 2
    assert "--admin-only требует --database" in capsys.readouterr().err
