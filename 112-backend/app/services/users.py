from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.security import hash_password
from app.models import AuthSession, User, UserActivity
from app.schemas.user import UserCreate, UserUpdate


async def create_user(
    session: AsyncSession, payload: UserCreate, actor_id: UUID | None = None
) -> User:
    password_hash = await run_in_threadpool(
        hash_password, payload.initial_password.get_secret_value()
    )
    user = User(
        **payload.model_dump(exclude={"initial_password", "role"}),
        password_hash=password_hash,
        must_change_password=True,
        is_active=True,
    )
    session.add(user)
    try:
        await session.flush()
        session.add(
            UserActivity(
                user_id=user.id,
                actor_id=actor_id,
                kind="account.created",
                details={"role": user.role},
            )
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        if getattr(exc.orig, "sqlstate", None) == "23505":
            raise HTTPException(status_code=409, detail="Username already exists") from exc
        raise
    return user


async def update_user(
    session: AsyncSession, user_id: UUID, admin_id: UUID, payload: UserUpdate
) -> User:
    # Serialize account administration across workers, including the last-admin check.
    # Auth operations lock the target user too, so login/refresh cannot survive a disable.
    await session.execute(text("SELECT pg_advisory_xact_lock(112, 7)"))
    admin = await session.get(User, admin_id, populate_existing=True)
    if admin is None or not admin.is_active or not admin.is_admin:
        raise HTTPException(status_code=403, detail="Administrator access required")
    user = await session.scalar(
        select(User)
        .where(User.id == user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    changes = payload.model_dump(exclude_unset=True)
    reason = (changes.pop("reason", None) or "").strip()
    active = changes.get("is_active", user.is_active)
    if user.id == admin_id and not active:
        raise HTTPException(status_code=409, detail="You cannot disable your own account")
    if user.is_admin and user.is_active and not active:
        count = await session.scalar(
            select(func.count())
            .select_from(User)
            .where(User.is_admin.is_(True), User.is_active.is_(True))
        )
        if count <= 1:
            raise HTTPException(
                status_code=409, detail="The last active administrator must be retained"
            )
    revoke = active != user.is_active
    if revoke and not reason:
        raise HTTPException(status_code=422, detail="A reason is required to change access")
    before = {key: getattr(user, key) for key in changes} | {"role": user.role}
    session.add(
        UserActivity(
            user_id=user.id,
            actor_id=admin_id,
            kind="account.access_changed" if revoke else "account.updated",
            reason=reason,
            details={"before": before, "after": changes | {"role": user.role}},
        )
    )
    for key, value in changes.items():
        setattr(user, key, value)
    if revoke:
        await session.execute(
            update(AuthSession)
            .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
    await session.commit()
    return user
