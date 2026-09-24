"""Jobs are persisted with submission, published only with a valid worker lease."""

from datetime import UTC, datetime
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import HTTPException
from sqlalchemy import select

from app.core.config import settings
from app.core.fingerprints import context_hash
from app.models import AIJob, Assignment, Attempt, Evaluation, Lesson
from app.models.enums import AIPurpose, EvaluationMethod, EvaluationStatus, JobStatus
from app.services.audit import append_event
from app.services.semantic_assessment.context import PROMPT_VERSION, build_context
from app.services.semantic_assessment.results import publish_result, review


async def retry(session, attempt):
    job = await session.scalar(
        select(AIJob)
        .where(
            AIJob.attempt_id == attempt.id,
            AIJob.purpose == AIPurpose.EVALUATION,
        )
        .with_for_update()
    )
    if not job:
        raise HTTPException(409, "Для этой попытки смысловая проверка не назначена.")
    if job.status == JobStatus.FAILED:
        job.status = JobStatus.QUEUED
        job.retry_count = 0
        job.available_at = datetime.now(UTC)
        job.completed_at = job.error = job.output = None
        await session.commit()
    return review(job)


async def enqueue(session, evaluation, check):
    attempt = await session.get(Attempt, evaluation.attempt_id)
    if not attempt.settings_snapshot.get("semantic_assessment"):
        return
    context = await build_context(session, evaluation, check)
    assignment = await session.get(Assignment, attempt.assignment_id)
    lesson = await session.get(Lesson, assignment.lesson_id)
    context.update(rag_enabled=settings.assessment_rag_enabled, teacher_id=str(lesson.teacher_id))
    if not context["criteria"]:
        return
    key = uuid5(NAMESPACE_URL, f"system112:semantic:{evaluation.id}:{PROMPT_VERSION}")
    if await session.scalar(select(AIJob.id).where(AIJob.idempotency_key == key)):
        return
    session.add(
        AIJob(
            purpose=AIPurpose.EVALUATION,
            attempt_id=attempt.id,
            idempotency_key=key,
            prompt_version=PROMPT_VERSION,
            model_version=settings.assessment_model or settings.llm_model,
            input=context,
            context={"evaluation_id": str(evaluation.id), "input_hash": context_hash(context)},
        )
    )
    await session.flush()


async def finish(session, job_id, token, output):

    # Serialize grading by lesson before locking the job and appending attempt events.
    target = (
        await session.execute(
            select(Assignment.lesson_id, Attempt.student_id)
            .join(Attempt, Attempt.assignment_id == Assignment.id)
            .join(AIJob, AIJob.attempt_id == Attempt.id)
            .where(AIJob.id == job_id)
        )
    ).one()
    lesson = await session.scalar(
        select(Lesson).where(Lesson.id == target.lesson_id).with_for_update()
    )
    job = await session.scalar(select(AIJob).where(AIJob.id == job_id).with_for_update())
    if (
        job.status != JobStatus.RUNNING
        or job.worker_id != token
        or job.lease_expires_at <= datetime.now(UTC)
    ):
        await session.rollback()
        return False
    original = await session.get(Evaluation, UUID(job.input["evaluation_id"]))
    if (
        original.attempt_id != job.attempt_id
        or original.context_snapshot["context_hash"] != job.input["context_hash"]
        or job.context["input_hash"] != context_hash(job.input)
    ):
        raise ValueError("Assessment context changed")
    if "retrieval" in job.context:
        import json
        from hashlib import sha256

        digest = sha256(
            json.dumps(job.context["retrieval"], sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest()
        if output.get("retrieval", {}).get("snapshot_hash") != digest:
            raise ValueError("Assessment retrieval snapshot changed")
    # Revalidate the worker output; identity and criteria cannot come from a model.
    from app.schemas.semantic_assessment import SemanticFinding

    findings = [SemanticFinding.model_validate(f) for f in output["findings"]]
    if [f.code for f in findings] != [c["code"] for c in job.input["criteria"]]:
        raise ValueError("Unexpected semantic criteria")
    latest = await session.scalar(
        select(Evaluation)
        .where(Evaluation.attempt_id == job.attempt_id)
        .order_by(Evaluation.revision.desc())
        .limit(1)
    )
    evaluation = Evaluation(
        attempt_id=job.attempt_id,
        revision=latest.revision + 1,
        supersedes_id=latest.id,
        method=EvaluationMethod.AI,
        ai_job_id=job.id,
        status=EvaluationStatus.NEEDS_REVIEW
        if any(not f.applied for f in findings)
        else EvaluationStatus.COMPLETED,
        summary="Смысловая проверка по отдельным критериям; итог рассчитывает сервер.",
        context_snapshot={
            "source_evaluation_id": str(original.id),
            "context_hash": job.input["context_hash"],
            "findings": [f.model_dump() for f in findings],
        },
        completed_at=datetime.now(UTC),
    )
    session.add(evaluation)
    job.status, job.output, job.completed_at = JobStatus.SUCCEEDED, output, datetime.now(UTC)
    job.worker_id = job.lease_expires_at = None
    await append_event(
        session,
        job.attempt_id,
        "assessment.ai_completed",
        {
            "job_id": str(job.id),
            "context_hash": job.input["context_hash"],
            "applied_criteria": sum(f.applied for f in findings),
            "needs_review": sum(not f.applied for f in findings),
        },
    )
    await session.flush()
    await publish_result(session, lesson, target.student_id)
    await session.commit()
    return True


async def publish_failed(session, job_id):
    target = (
        await session.execute(
            select(Assignment.lesson_id, Attempt.student_id)
            .join(Attempt, Attempt.assignment_id == Assignment.id)
            .join(AIJob, AIJob.attempt_id == Attempt.id)
            .where(AIJob.id == job_id)
        )
    ).one()
    lesson = await session.scalar(
        select(Lesson).where(Lesson.id == target.lesson_id).with_for_update()
    )
    await publish_result(session, lesson, target.student_id)
    await session.commit()
