import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import jwt
from pwdlib import PasswordHash

from app.core.config import settings

password_hasher = PasswordHash.recommended()
# Unknown usernames still perform a password verification.
dummy_password_hash = password_hasher.hash(secrets.token_urlsafe(32))


def signing_key() -> str:
    if settings.jwt_secret_key is None:
        raise RuntimeError("Set JWT_SECRET_KEY to a random secret of at least 32 characters")
    return settings.jwt_secret_key.get_secret_value()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


def refresh_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def create_access_token(user_id: UUID, session_id: UUID) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": str(user_id),
            "sid": str(session_id),
            "jti": str(uuid4()),
            "type": "access",
            "iat": now,
            "exp": now + timedelta(minutes=settings.access_token_minutes),
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
        },
        signing_key(),
        algorithm="HS256",
    )


def decode_access_token(token: str) -> tuple[UUID, UUID]:
    payload = jwt.decode(
        token,
        signing_key(),
        algorithms=["HS256"],
        issuer=settings.jwt_issuer,
        audience=settings.jwt_audience,
        options={"require": ["sub", "sid", "jti", "type", "iat", "exp", "iss", "aud"]},
    )
    if payload["type"] != "access":
        raise jwt.InvalidTokenError("Expected an access token")
    try:
        return UUID(payload["sub"]), UUID(payload["sid"])
    except (ValueError, TypeError, AttributeError) as exc:
        raise jwt.InvalidTokenError("Invalid token subject or session") from exc
