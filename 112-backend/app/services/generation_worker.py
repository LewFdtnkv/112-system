"""PostgreSQL queue with expiring leases and fenced, atomic result publication."""

import asyncio
import json
import logging
import urllib.error
import urllib.request
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
from app.services.authoring import validate_card_definition
from app.services.card_generation import PROMPT_VERSION, prompt

LEASE_SECONDS = 90
MAX_ATTEMPTS = 3
logger = logging.getLogger(__name__)


async def claim(session):
    now = datetime.now(UTC)
    job = await session.scalar(
        select(AIJob)
        .where(
            AIJob.purpose == AIPurpose.GENERATION,
            AIJob.prompt_version == PROMPT_VERSION,
            AIJob.created_by_id.is_not(None),
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
    if job.retry_count >= MAX_ATTEMPTS:
        job.status, job.completed_at = JobStatus.FAILED, now
        job.error = "Воркер не завершил генерацию после трёх попыток. Можно повторить вручную."
        job.worker_id = job.lease_expires_at = None
        await session.commit()
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
    seed = (job.input["seed"] + max(0, job.retry_count - 1)) % (2**31)
    request = urllib.request.Request(
        settings.llm_base_url.rstrip("/") + "/api/chat",
        data=json.dumps(
            {
                "model": job.model_version,
                "stream": False,
                "think": False,
                "keep_alive": "60s",
                "format": GeneratedText.model_json_schema(),
                "messages": [{"role": "user", "content": prompt(job.input["facts"])}],
                "options": {
                    "num_ctx": 4096,
                    "num_predict": 1000,
                    "temperature": 0.4,
                    "seed": seed,
                },
            }
        ).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    # Internal service calls never inherit an HTTP proxy from a user's shell.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=settings.llm_timeout_seconds) as response:
        raw = response.read(128 * 1024 + 1)
    if len(raw) > 128 * 1024:
        raise ValueError("Model response exceeds limit")
    result = json.loads(raw)
    if not result.get("done") or result.get("done_reason") == "length":
        raise ValueError("Model response is incomplete")
    text = GeneratedText.model_validate_json(result["message"]["content"])
    return text, {
        "seed": seed,
        **{
            key: result.get(key)
            for key in (
                "model",
                "total_duration",
                "load_duration",
                "prompt_eval_count",
                "eval_count",
            )
        },
    }


async def finish(session, job_id, token, text: GeneratedText, metadata):
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
    payload.title = text.title.strip()
    payload.data.description = text.description.strip()
    # All assessed facts remain visible to the learner even if the small model omits one.
    facts = {
        k: v
        for k, v in job.input["facts"].items()
        if k
        not in ("Службы", "Полные названия служб", "Подробность сообщения", "Состояние заявителя")
    }

    def readable(value):
        if isinstance(value, bool):
            return "Да" if value else "Нет"
        if isinstance(value, dict):
            return (
                "; ".join(f"{k}: {readable(v)}" for k, v in value.items())
                or "нет дополнительных признаков"
            )
        if isinstance(value, list):
            return ", ".join(value) or "нет"
        return str(value)

    payload.caller_message = (
        text.caller_message.strip()
        + "\n\nСведения со слов заявителя:\n"
        + "\n".join(f"{key}: {readable(value)}" for key, value in facts.items())
    )
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
    job.error = public_error(error)
    job.status = JobStatus.FAILED if job.retry_count >= MAX_ATTEMPTS else JobStatus.QUEUED
    job.completed_at = datetime.now(UTC) if job.status == JobStatus.FAILED else None
    job.available_at = datetime.now(UTC) + timedelta(seconds=10 * job.retry_count)
    job.worker_id = job.lease_expires_at = None
    await session.commit()


async def heartbeat(job_id, token):
    while True:
        await asyncio.sleep(20)
        async with session_factory() as session:
            if not await renew(session, job_id, token):
                return


async def process(job):
    beat = asyncio.create_task(heartbeat(job.id, job.worker_id))
    try:
        text, metadata = await asyncio.to_thread(call_model, job)
        async with session_factory() as session:
            await finish(session, job.id, job.worker_id, text, metadata)
    except Exception as error:
        logger.warning("Generation %s failed (%s)", job.id, type(error).__name__)
        async with session_factory() as session:
            await fail(session, job.id, job.worker_id, error)
    finally:
        beat.cancel()
        await asyncio.gather(beat, return_exceptions=True)


async def run():
    logging.basicConfig(level=logging.INFO)
    logger.info("Generation worker started; model=%s, concurrency=1", settings.llm_model)
    while True:
        try:
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
