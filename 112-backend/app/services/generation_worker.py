"""PostgreSQL queue with expiring leases and fenced, atomic result publication."""

import asyncio
import logging
import urllib.error
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from pydantic import ValidationError
from sqlalchemy import and_, or_, select, update

from app.core.config import settings
from app.db.session import session_factory
from app.models import AIJob, CardTemplate, CardTemplateRecipient, User
from app.models.enums import AIPurpose, JobStatus
from app.schemas.authoring import CardCreate
from app.schemas.generation import GeneratedText
from app.services import group_reports
from app.services.assessment_memory import worker as memory_worker
from app.services.authoring.cards import validate_card_definition
from app.services.card_generation import PROMPT_VERSION
from app.services.dds_generation import PROMPT_VERSION as DDS_PROMPT
from app.services.dds_generation import examples as dds_examples
from app.services.dds_generation import inference as dds_inference
from app.services.dds_generation import jobs as dds_jobs
from app.services.generation import examples as generation_examples
from app.services.generation.llm import compose
from app.services.generation.narration import fallback
from app.services.generation.protection import protect
from app.services.learning_recommendations import inference as recommendation_inference
from app.services.learning_recommendations import jobs as recommendation_jobs
from app.services.learning_recommendations.inference import PROMPT_VERSION as STUDY_PROMPT
from app.services.learning_recommendations.jobs import finish as finish_advice
from app.services.semantic_assessment import inference as assessment_inference
from app.services.semantic_assessment.context import PROMPT_VERSION as ASSESSMENT_PROMPT
from app.services.semantic_assessment.jobs import finish as finish_assessment
from app.services.semantic_assessment.jobs import publish_failed
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
                    AIJob.purpose.in_([AIPurpose.GENERATION, AIPurpose.DDS_GENERATION]),
                    AIJob.created_by_id.is_not(None),
                ),
                AIJob.purpose.in_(
                    [AIPurpose.EVALUATION, AIPurpose.RECOMMENDATION, AIPurpose.GROUP_RECOMMENDATION]
                ),
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

    expected_prompt = {
        AIPurpose.DDS_GENERATION: DDS_PROMPT,
        AIPurpose.EVALUATION: ASSESSMENT_PROMPT,
        AIPurpose.RECOMMENDATION: STUDY_PROMPT,
        AIPurpose.GROUP_RECOMMENDATION: group_reports.PROMPT_VERSION,
    }.get(job.purpose, PROMPT_VERSION)
    if job.prompt_version != expected_prompt:
        job.status, job.completed_at = JobStatus.FAILED, now
        job.error = (
            "Версия смысловой проверки не поддерживается этим воркером. "
            "Сохранена оценка по правилам."
            if job.purpose == AIPurpose.EVALUATION
            else "Версия рекомендаций обновлена; задача больше не поддерживается."
            if job.purpose in {AIPurpose.RECOMMENDATION, AIPurpose.GROUP_RECOMMENDATION}
            else "Формат генерации обновлён. Создайте новый пакет карточек."
        )
        job.worker_id = job.lease_expires_at = None
        await session.commit()
        if job.purpose == AIPurpose.EVALUATION:
            await publish_failed(session, job.id)
        return None
    if job.retry_count >= MAX_ATTEMPTS:
        job.status, job.completed_at = JobStatus.FAILED, now
        job.error = "Воркер не завершил задачу после трёх попыток. Можно повторить вручную."
        job.worker_id = job.lease_expires_at = None
        await session.commit()
        if job.purpose == AIPurpose.EVALUATION:
            await publish_failed(session, job.id)
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
    if job.purpose == AIPurpose.DDS_GENERATION:
        return dds_inference.compose(job)
    if job.purpose in {AIPurpose.RECOMMENDATION, AIPurpose.GROUP_RECOMMENDATION}:
        return recommendation_inference.evaluate(job), {}
    if job.purpose == AIPurpose.EVALUATION:
        return assessment_inference.evaluate(job), {}

    return compose(job)


async def finish(session, job_id, token, text: GeneratedText, metadata):
    target = await session.get(AIJob, job_id)
    if target and target.purpose == AIPurpose.DDS_GENERATION:
        return await dds_jobs.finish(session, job_id, token, text, metadata)
    if target and target.purpose == AIPurpose.GROUP_RECOMMENDATION:
        return await group_reports.finish(session, job_id, token, text)
    if target and target.purpose == AIPurpose.RECOMMENDATION:
        return await finish_advice(session, job_id, token, text)
    if target and target.purpose == AIPurpose.EVALUATION:
        return await finish_assessment(session, job_id, token, text)
    job = await session.scalar(select(AIJob).where(AIJob.id == job_id).with_for_update())
    if (
        job is None
        or job.status != JobStatus.RUNNING
        or job.worker_id != token
        or job.lease_expires_at <= datetime.now(UTC)
    ):
        await session.rollback()
        return False
    owner = await session.get(User, job.created_by_id)
    if not owner or not owner.is_active or not owner.is_teacher:
        raise ValueError("Generation owner is no longer an active teacher")
    payload = CardCreate.model_validate(job.input["card"])
    if not await generation_examples.still_approved(
        session, job.created_by_id, metadata.get("examples", [])
    ):
        text = fallback(job.input)
        metadata = {
            **metadata,
            "source": "template-fallback",
            "selection": job.input["narrative"]["default_wording"],
            "quality_note": "Образец преподавателя отозван или изменён. Использована заготовка.",
        }
    text, metadata = protect(job.input, text, metadata)
    payload.title = text.title
    payload.data.description = text.description
    payload.caller_message = text.caller_message
    payload = CardCreate.model_validate(payload.model_dump())
    recipients = await validate_card_definition(session, payload)
    card = CardTemplate(
        created_by_id=job.created_by_id,
        **payload.model_dump(
            exclude={"recipient_service_ids", "use_recommended_recipients", "data"}
        ),
        data=payload.data.model_dump(mode="json"),
    )
    session.add(card)
    await session.flush()
    session.add_all(
        [CardTemplateRecipient(card_template_id=card.id, service_id=s.id) for s in recipients]
    )
    job.card_template_id, job.status = card.id, JobStatus.SUCCEEDED
    job.output = {"text": text.model_dump(), "inference": metadata}
    job.completed_at = datetime.now(UTC)
    job.worker_id = job.lease_expires_at = None
    job.error = None
    await session.commit()
    return True


def public_error(error):
    if isinstance(error, urllib.error.HTTPError) and error.code == 404:
        return "Модель не загружена. Администратору нужно выполнить команду загрузки из инструкции."
    if isinstance(error, (urllib.error.URLError, TimeoutError, OSError)):
        return "ЛЛМ недоступна или превысила время ожидания. Проверьте сервис llm."
    if isinstance(error, (ValidationError, ValueError, KeyError)):
        return "Не удалось получить корректную карточку от модели. Повторите генерацию."
    return "Не удалось сохранить карточку. Проверьте доступность ЕКП, служб и учётной записи."


async def fail(session, job_id, token, error):
    job = await session.scalar(select(AIJob).where(AIJob.id == job_id).with_for_update())
    if (
        not job
        or job.status != JobStatus.RUNNING
        or job.worker_id != token
        or job.lease_expires_at <= datetime.now(UTC)
    ):
        await session.rollback()
        return
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
        **(
            {"assessment_checkpoint": error.checkpoint}
            if isinstance(error, assessment_inference.AssessmentFailure)
            else {}
        ),
    }
    job.error = (
        "Смысловая проверка недоступна или ответ модели не прошёл проверку. "
        "Сохранена оценка по правилам."
        if job.purpose == AIPurpose.EVALUATION
        else "Не удалось подготовить рекомендацию по дальнейшему обучению."
        if job.purpose in {AIPurpose.RECOMMENDATION, AIPurpose.GROUP_RECOMMENDATION}
        else (
            "Упражнение ДДС не прошло проверку или не может быть сохранено. "
            "Карточка сохранена без изменений. Запустите новую генерацию в карточке."
        )
        if job.purpose == AIPurpose.DDS_GENERATION
        else public_error(error)
    )
    terminal = job.purpose == AIPurpose.DDS_GENERATION and (
        isinstance(error, dds_inference.DDSGenerationFailure)
        or getattr(error, "status_code", None) in (404, 409, 422)
    )
    job.status = (
        JobStatus.FAILED if terminal or job.retry_count >= MAX_ATTEMPTS else JobStatus.QUEUED
    )
    job.completed_at = datetime.now(UTC) if job.status == JobStatus.FAILED else None
    job.available_at = datetime.now(UTC) + timedelta(seconds=10 * job.retry_count)
    job.worker_id = job.lease_expires_at = None
    await session.commit()
    if job.purpose == AIPurpose.EVALUATION and job.status == JobStatus.FAILED:
        await publish_failed(session, job.id)


async def heartbeat(job_id, token):
    while True:
        await asyncio.sleep(20)
        async with session_factory() as session:
            if not await renew(session, job_id, token):
                return


async def process(job):
    beat = asyncio.create_task(heartbeat(job.id, job.worker_id))
    try:
        if job.purpose in {AIPurpose.RECOMMENDATION, AIPurpose.GROUP_RECOMMENDATION}:
            await recommendation_jobs.prepare(job)
        if job.purpose == AIPurpose.EVALUATION:
            await memory_worker.prepare(job)
        if job.purpose == AIPurpose.DDS_GENERATION:
            await dds_examples.prepare(job)
        if job.purpose == AIPurpose.GENERATION:
            await generation_examples.prepare(job)
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
            from time import monotonic

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
