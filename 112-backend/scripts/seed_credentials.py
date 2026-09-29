"""Persist demo credentials before replacing the password, including interrupted retries."""

from datetime import UTC, datetime

from sqlalchemy import update
from starlette.concurrency import run_in_threadpool

from app.core.security import hash_password, verify_password
from app.models import AuthSession, UserActivity
from app.services.auth import lock_user


async def prepare_admin(session, admin, state):
    previous = state.data["ids"].get("admin")
    if previous is not None and previous != str(admin.id):
        raise RuntimeError("БД заменена: укажите новый файл состояния")
    password = state.data["admin_new_password"]
    # State.save is atomic and private (0600); the target survives a failed DB commit.
    state.remember("admin", str(admin.id))
    admin = await lock_user(session, admin.id)
    if (
        not await run_in_threadpool(verify_password, password, admin.password_hash)
        or admin.must_change_password
    ):
        now = datetime.now(UTC)
        admin.password_hash = await run_in_threadpool(hash_password, password)
        admin.must_change_password = False
        admin.password_changed_at = now
        await session.execute(
            update(AuthSession)
            .where(AuthSession.user_id == admin.id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        session.add(
            UserActivity(
                user_id=admin.id,
                actor_id=admin.id,
                kind="account.password_reset",
                details={"source": "demo_seed"},
            )
        )
    await session.commit()
    state.data.setdefault("accounts", {})["admin"] = {
        "username": admin.username,
        "password": password,
    }
    state.save()
