from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException
from jwt import InvalidTokenError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    dummy_password_hash,
    hash_password,
    new_refresh_token,
    refresh_token_hash,
    verify_password,
)
from app.models import AuthSession, User
from app.schemas.auth import TokenPair


def unauthorized() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Invalid credentials or expired session",
        headers={"WWW-Authenticate": "Bearer"},
    )


@dataclass
class Identity:
    user: User
    session: AuthSession


def validate_identity(user: User | None, auth_session: AuthSession | None) -> Identity:
    if (
        user is None
        or not user.is_active
        or auth_session is None
        or auth_session.user_id != user.id
        or auth_session.revoked_at is not None
        or auth_session.expires_at <= datetime.now(UTC)
    ):
        raise unauthorized()
    return Identity(user, auth_session)


async def authenticate(session: AsyncSession, token: str) -> Identity:
    try:
        user_id, session_id = decode_access_token(token)
    except InvalidTokenError as exc:
        raise unauthorized() from exc
    return validate_identity(
        await session.get(User, user_id), await session.get(AuthSession, session_id)
    )


async def lock_user(session: AsyncSession, user_id: UUID) -> User | None:
    # Every auth mutation locks the user before reading or changing their session. This serializes
    # concurrent refreshes with password changes and logouts across API workers.
    return await session.scalar(
        select(User)
        .where(User.id == user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


async def lock_identity(session: AsyncSession, identity: Identity) -> Identity:
    user = await lock_user(session, identity.user.id)
    auth_session = await session.get(AuthSession, identity.session.id, populate_existing=True)
    return validate_identity(user, auth_session)


def token_pair(user: User, auth_session: AuthSession, refresh: str) -> TokenPair:
    return TokenPair(
        access_token=create_access_token(user.id, auth_session.id),
        refresh_token=refresh,
        expires_in=settings.access_token_minutes * 60,
        must_change_password=user.must_change_password,
    )


async def start_session(session: AsyncSession, user: User) -> TokenPair:
    refresh = new_refresh_token()
    auth_session = AuthSession(
        user_id=user.id,
        refresh_token_hash=refresh_token_hash(refresh),
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_days),
    )
    session.add(auth_session)
    await session.flush()
    return token_pair(user, auth_session, refresh)


async def login(session: AsyncSession, username: str, password: str) -> TokenPair:
    user = await session.scalar(select(User).where(User.username == username).with_for_update())
    valid = await run_in_threadpool(
        verify_password, password, user.password_hash if user else dummy_password_hash
    )
    if not valid or user is None or not user.is_active:
        raise unauthorized()
    user.last_login_at = datetime.now(UTC)
    pair = await start_session(session, user)
    await session.commit()
    return pair


async def refresh(session: AsyncSession, refresh_token: str) -> TokenPair:
    token_hash = refresh_token_hash(refresh_token)
    user_id = await session.scalar(
        select(AuthSession.user_id).where(AuthSession.refresh_token_hash == token_hash)
    )
    if user_id is None:
        raise unauthorized()
    user = await lock_user(session, user_id)
    # Recheck the hash after obtaining the lock: a competing request may have rotated it.
    auth_session = await session.scalar(
        select(AuthSession)
        .where(AuthSession.refresh_token_hash == token_hash)
        .execution_options(populate_existing=True)
    )
    identity = validate_identity(user, auth_session)
    refresh = new_refresh_token()
    identity.session.refresh_token_hash = refresh_token_hash(refresh)
    pair = token_pair(identity.user, identity.session, refresh)
    await session.commit()
    return pair


async def change_password(
    session: AsyncSession, identity: Identity, current_password: str, new_password: str
) -> TokenPair:
    identity = await lock_identity(session, identity)
    if not await run_in_threadpool(verify_password, current_password, identity.user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if new_password == current_password or not new_password.strip():
        raise HTTPException(status_code=400, detail="Choose a different, non-blank password")
    identity.user.password_hash = await run_in_threadpool(hash_password, new_password)
    identity.user.must_change_password = False
    identity.user.password_changed_at = datetime.now(UTC)
    await session.execute(
        update(AuthSession)
        .where(AuthSession.user_id == identity.user.id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    pair = await start_session(session, identity.user)
    await session.commit()
    return pair


async def logout(session: AsyncSession, identity: Identity) -> None:
    identity = await lock_identity(session, identity)
    identity.session.revoked_at = datetime.now(UTC)
    await session.commit()
