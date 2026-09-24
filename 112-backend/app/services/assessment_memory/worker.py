"""Freeze retrieved evidence once, fenced by the assessment worker lease."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select

from app.db.session import session_factory
from app.models import AIJob
from app.models.enums import JobStatus
from app.services.assessment_memory.retrieval import index_pending, retrieve_batch


async def prepare(job):
    if "retrieval" in job.context:
        return
    if not job.input.get("rag_enabled"):
        bundle = {"status": "disabled", "examples": {}}
    else:
        try:
            async with session_factory() as session:
                await index_pending(session)
                bundle = await retrieve_batch(
                    session,
                    job.input["criteria"],
                    teacher_id=UUID(job.input["teacher_id"])
                    if job.input.get("teacher_id")
                    else None,
                    source_job_id=job.id,
                )
        except Exception as error:
            # Preserve existing formal/static assessment if retrieval is unavailable.
            bundle = {"status": "unavailable", "examples": {}, "error": type(error).__name__}
    async with session_factory() as session:
        row = await session.scalar(select(AIJob).where(AIJob.id == job.id).with_for_update())
        if (
            not row
            or row.status != JobStatus.RUNNING
            or row.worker_id != job.worker_id
            or row.lease_expires_at <= datetime.now(UTC)
        ):
            raise ValueError("Assessment lease expired before retrieval publication")
        if "retrieval" not in row.context:
            row.context = row.context | {"retrieval": bundle}
            await session.commit()
        job.context = row.context
