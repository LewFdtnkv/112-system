"""Teacher-approved examples scoped to the author's lessons; grades are separate."""

from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select

from app.models import AIJob, AssessmentExample
from app.models.enums import AIPurpose, JobStatus
from app.services.assessment_memory.retrieval import POLICY_VERSION, search_text


async def job_for(session, attempt_id):
    return await session.scalar(
        select(AIJob)
        .where(
            AIJob.attempt_id == attempt_id,
            AIJob.purpose == AIPurpose.EVALUATION,
        )
        .order_by(AIJob.created_at.desc())
        .limit(1)
    )


async def list_feedback(session, attempt_id, teacher_id):
    return list(
        await session.scalars(
            select(AssessmentExample)
            .join(
                AIJob,
                AIJob.id == AssessmentExample.source_job_id,
            )
            .where(AIJob.attempt_id == attempt_id, AssessmentExample.created_by_id == teacher_id)
            .order_by(AssessmentExample.created_at.desc())
        )
    )


async def save_feedback(session, attempt, teacher_id, payload):
    # Serialize idempotent retries and withdrawal/publication for this work.
    await session.refresh(attempt, with_for_update=True)
    key = f"teacher:{teacher_id}:{payload.request_id}"
    prior = await session.scalar(
        select(AssessmentExample).where(AssessmentExample.source_key == key)
    )
    if prior:
        job = await session.get(AIJob, prior.source_job_id)
        if job.attempt_id != attempt.id or (prior.criterion_code, prior.verdict, prior.reason) != (
            payload.criterion_code,
            payload.verdict,
            payload.reason,
        ):
            raise HTTPException(
                409, "Идентификатор запроса уже использован для другого исправления"
            )
        return prior
    job = await job_for(session, attempt.id)
    if not job or job.status != JobStatus.SUCCEEDED:
        raise HTTPException(409, "Сначала дождитесь смысловой проверки")
    criterion = next(
        (c for c in job.input["criteria"] if c["code"] == payload.criterion_code), None
    )
    if not criterion:
        raise HTTPException(422, "Критерий не найден в проверке этой работы")
    text = search_text(criterion, payload.reason)
    if len(text) > 6000:
        raise HTTPException(422, "Разбор слишком длинный для памяти небольшой модели")
    # New explicit publication supersedes the author's previous example for this criterion.
    for old in await list_feedback(session, attempt.id, teacher_id):
        if old.criterion_code == payload.criterion_code and old.active:
            old.active, old.withdrawn_at = False, datetime.now(UTC)
    row = AssessmentExample(
        source_key=key,
        created_by_id=teacher_id,
        source_job_id=job.id,
        kind=criterion["kind"],
        role="dds" if criterion["kind"] == "dds" else "operator_112",
        criterion_code=criterion["code"],
        policy_version=POLICY_VERSION,
        situation=criterion["situation"],
        reference=criterion["reference"],
        answer=criterion["answer"],
        verdict=payload.verdict,
        reason=payload.reason,
        search_text=text,
        active=True,
    )
    session.add(row)
    await session.commit()
    return row


async def withdraw(session, attempt, teacher_id, example_id):
    await session.refresh(attempt, with_for_update=True)
    row = await session.scalar(
        select(AssessmentExample)
        .join(
            AIJob,
            AIJob.id == AssessmentExample.source_job_id,
        )
        .where(
            AssessmentExample.id == example_id,
            AssessmentExample.created_by_id == teacher_id,
            AIJob.attempt_id == attempt.id,
        )
    )
    if not row:
        raise HTTPException(404, "Разбор не найден")
    if row.active:
        row.active, row.withdrawn_at = False, datetime.now(UTC)
        await session.commit()
    return row
