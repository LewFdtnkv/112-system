from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.security import hash_password
from app.models import User
from app.schemas.user import UserCreate


async def create_user(session: AsyncSession, payload: UserCreate) -> User:
    password_hash = await run_in_threadpool(
        hash_password, payload.initial_password.get_secret_value()
    )
    user = User(
        **payload.model_dump(exclude={"initial_password"}),
        password_hash=password_hash,
        must_change_password=True,
        is_active=True,
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        if getattr(exc.orig, "sqlstate", None) == "23505":
            raise HTTPException(status_code=409, detail="Username already exists") from exc
        raise
    return user
