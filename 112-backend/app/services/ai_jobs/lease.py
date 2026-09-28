"""Worker ownership predicate, evaluated while the caller holds the job row lock."""

from datetime import UTC, datetime

from app.models import AIJob
from app.models.enums import JobStatus


def valid_lease(job: AIJob | None, token: str, *, now: datetime | None = None) -> bool:
    return bool(
        job
        and job.status == JobStatus.RUNNING
        and token
        and job.worker_id == token
        and job.lease_expires_at is not None
        and job.lease_expires_at > (now or datetime.now(UTC))
    )
