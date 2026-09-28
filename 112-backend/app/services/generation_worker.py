"""PostgreSQL queue with expiring leases and fenced, atomic result publication."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from time import monotonic
from uuid import uuid4

from sqlalchemy import and_, or_, select, update

from app.core.config import settings
from app.db.session import session_factory
from app.models import AIJob
from app.models.enums import JobStatus
from app.services.ai_jobs.handlers import HANDLERS, handler_for
from app.services.ai_jobs.lease import valid_lease
from app.services.learning_recommendations import jobs as recommendation_jobs
from app.services.semantic_assessment.results import reconcile

LEASE_SECONDS = 90
MAX_ATTEMPTS = 3
logger = logging.getLogger(__name__)


async def claim(session):
    now = datetime.now(UTC)
    job = await session.scalar(
        select(AIJob)
        .where(
            or_(
                and_(
                    AIJob.purpose.in_([p for p, h in HANDLERS.items() if h.requires_owner]),
                    AIJob.created_by_id.is_not(None),
                ),
                AIJob.purpose.in_([p for p, h in HANDLERS.items() if not h.requires_owner]),
            ),
            or_(
                and_(AIJob.status == JobStatus.QUEUED, AIJob.available_at <= now),
                and_(AIJob.status == JobStatus.RUNNING, AIJob.lease_expires_at <= now),
            ),
        )
        .order_by(AIJob.available_at, AIJob.created_at, AIJob.id)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    if job is None:
        await session.rollback()
        return None

    handler = handler_for(job.purpose)
    if job.prompt_version != handler.prompt_version:
        job.status, job.completed_at = JobStatus.FAILED, now
        job.error = handler.version_error
        job.worker_id = job.lease_expires_at = None
        await session.commit()
        if handler.on_failed:
            await handler.on_failed(session, job.id)
        return None
    if job.retry_count >= MAX_ATTEMPTS:
        job.status, job.completed_at = JobStatus.FAILED, now
        job.error = "Воркер не завершил задачу после трёх попыток. Можно повторить вручную."
        job.worker_id = job.lease_expires_at = None
        await session.commit()
        if handler.on_failed:
            await handler.on_failed(session, job.id)
        return None
    job.status = JobStatus.RUNNING
    job.retry_count += 1
    job.worker_id = str(uuid4())
    job.lease_expires_at = now + timedelta(seconds=LEASE_SECONDS)
    job.error = None
    await session.commit()
    return job


async def renew(session, job_id, token):
    now = datetime.now(UTC)
    result = await session.execute(
        update(AIJob)
        .where(
            AIJob.id == job_id,
            AIJob.worker_id == token,
            AIJob.status == JobStatus.RUNNING,
            AIJob.lease_expires_at > now,
        )
        .values(lease_expires_at=now + timedelta(seconds=LEASE_SECONDS))
    )
    await session.commit()
    return result.rowcount == 1


def call_model(job):
    return handler_for(job.purpose).infer(job)


async def finish(session, job_id, token, value, metadata):
    job = await session.get(AIJob, job_id)
    if job is None:
        await session.rollback()
        return False
    return await handler_for(job.purpose).publish(session, job_id, token, value, metadata)


async def fail(session, job_id, token, error):
    job = await session.scalar(select(AIJob).where(AIJob.id == job_id).with_for_update())
    if not valid_lease(job, token):
        await session.rollback()
        return
    handler = handler_for(job.purpose)
    diagnostic = {
        "attempt": job.retry_count,
        "at": datetime.now(UTC).isoformat(),
        "error_type": type(error).__name__,
        **getattr(error, "diagnostic", {}),
    }
    # Do not persist arbitrary exception strings: they can contain URLs, credentials
    # or raw validation input. Model traces already belong to protected job details.
    job.context = {
        **job.context,
        "inference_failures": [*job.context.get("inference_failures", []), diagnostic][
            -MAX_ATTEMPTS:
        ],
        **handler.failure_context(error),
    }
    job.error = handler.failure_message(error)
    terminal = handler.terminal_error(error)
    job.status = (
        JobStatus.FAILED if terminal or job.retry_count >= MAX_ATTEMPTS else JobStatus.QUEUED
    )
    job.completed_at = datetime.now(UTC) if job.status == JobStatus.FAILED else None
    job.available_at = datetime.now(UTC) + timedelta(seconds=10 * job.retry_count)
    job.worker_id = job.lease_expires_at = None
    await session.commit()
    if job.status == JobStatus.FAILED and handler.on_failed:
        await handler.on_failed(session, job.id)


async def heartbeat(job_id, token):
    while True:
        await asyncio.sleep(20)
        async with session_factory() as session:
            if not await renew(session, job_id, token):
                return


async def process(job):
    beat = asyncio.create_task(heartbeat(job.id, job.worker_id))
    try:
        await handler_for(job.purpose).prepare(job)
        text, metadata = await asyncio.to_thread(call_model, job)
        async with session_factory() as session:
            await finish(session, job.id, job.worker_id, text, metadata)
    except Exception as error:
        logger.warning("AI job %s failed (%s)", job.id, type(error).__name__)
        async with session_factory() as session:
            await fail(session, job.id, job.worker_id, error)
    finally:
        beat.cancel()
        await asyncio.gather(beat, return_exceptions=True)


async def run():
    logging.basicConfig(level=logging.INFO)
    logger.info(
        "Generation, assessment and study recommendation worker started; model=%s, concurrency=1",
        settings.llm_model,
    )
    last_recommendations = 0.0
    while True:
        try:
            if monotonic() - last_recommendations >= 60:
                async with session_factory() as session:
                    await recommendation_jobs.schedule(session)
                last_recommendations = monotonic()

            async with session_factory() as session:
                await reconcile(session)
            async with session_factory() as session:
                job = await claim(session)
            if job:
                await process(job)
                continue
        except Exception as error:
            logger.warning("Queue temporarily unavailable (%s)", type(error).__name__)
        await asyncio.sleep(settings.generation_poll_seconds)


if __name__ == "__main__":
    asyncio.run(run())
