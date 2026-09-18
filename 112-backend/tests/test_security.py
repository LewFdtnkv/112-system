from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest
from pydantic import ValidationError

from app.core.config import Settings, settings
from app.core.security import create_access_token, decode_access_token, signing_key


def test_access_token_roundtrip(auth_settings):
    user_id, session_id = uuid4(), uuid4()
    assert decode_access_token(create_access_token(user_id, session_id)) == (user_id, session_id)


@pytest.mark.parametrize(
    "invalid",
    [
        "expired",
        "issuer",
        "audience",
        "type",
        "subject",
        "session",
        "missing_exp",
        "signature",
        "algorithm",
        "malformed",
    ],
)
def test_invalid_access_token(auth_settings, invalid):
    token = create_access_token(uuid4(), uuid4())
    payload = jwt.decode(token, signing_key(), algorithms=["HS256"], audience=settings.jwt_audience)
    if invalid == "expired":
        payload["exp"] = datetime.now(UTC) - timedelta(seconds=1)
    elif invalid in ("issuer", "audience", "type", "subject", "session"):
        field = {
            "issuer": "iss",
            "audience": "aud",
            "type": "type",
            "subject": "sub",
            "session": "sid",
        }[invalid]
        payload[field] = "invalid"
    elif invalid == "missing_exp":
        del payload["exp"]
    key = (
        "another-test-key-with-at-least-32-characters" if invalid == "signature" else signing_key()
    )
    token = jwt.encode(payload, key, algorithm="HS384" if invalid == "algorithm" else "HS256")
    if invalid == "malformed":
        token = "malformed"
    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(token)


def test_missing_secret_fails_closed(monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret_key", None)
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        signing_key()


def test_short_secret_rejected():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, jwt_secret_key="short")
