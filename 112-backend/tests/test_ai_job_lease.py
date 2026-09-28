from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.services.ai_jobs.lease import valid_lease


@pytest.mark.parametrize(
    "status,owner,seconds,token,expected",
    [
        ("running", "current", 1, "current", True),
        ("running", "current", 0, "current", False),
        ("running", "current", -1, "current", False),
        ("running", "new-worker", 60, "old-worker", False),
        ("queued", "current", 60, "current", False),
        ("succeeded", "current", 60, "current", False),
        ("failed", "current", 60, "current", False),
        ("running", "current", None, "current", False),
        ("running", None, 60, None, False),
    ],
)
def test_only_current_unexpired_worker_can_publish(status, owner, seconds, token, expected):
    now = datetime(2026, 9, 28, tzinfo=UTC)
    job = SimpleNamespace(
        status=status,
        worker_id=owner,
        lease_expires_at=now + timedelta(seconds=seconds) if seconds is not None else None,
    )
    assert valid_lease(job, token, now=now) is expected
    assert not valid_lease(None, token, now=now)
