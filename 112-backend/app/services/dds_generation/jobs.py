"""Fenced DDS publication. The existing card survives every inference failure."""

import hashlib
import random
from datetime import UTC, datetime
from uuid import NAMESPACE_URL, uuid5

from fastapi import HTTPException
from sqlalchemy import func, select

from app.core.config import settings
from app.models import AIJob, CardTemplateRecipient, ScenarioCard, User
from app.models.enums import AIPurpose, JobStatus
from app.services.ai_jobs.lease import valid_lease
from app.services.authoring.cards import owned_card
from app.services.dds.exercise import validate_profile
from app.services.dds_generation import PROMPT_VERSION
from app.services.dds_generation.planner import plan
from app.services.generation.examples import still_approved


async def editable(session, card):
    if await session.scalar(
        select(ScenarioCard.id).where(ScenarioCard.card_template_id == card.id).limit(1)
    ):
        raise HTTPException(
            409, "Карточка уже используется в сценарии. Создайте отдельную карточку."
        )


async def enqueue(session, teacher_id, card_id, request):
    await session.scalar(select(User).where(User.id == teacher_id).with_for_update())
    key = uuid5(NAMESPACE_URL, f"dds/{teacher_id}/{card_id}/{request.request_id}")
    fingerprint = hashlib.sha256(request.model_dump_json().encode()).hexdigest()
    existing = await session.scalar(select(AIJob).where(AIJob.idempotency_key == key))
    if existing:
        if existing.context["fingerprint"] != fingerprint:
            raise HTTPException(409, "Этот запрос уже зарегистрирован с другими параметрами.")
        return existing
    card = await owned_card(session, card_id, teacher_id, lock=True)
    await editable(session, card)
    if card.revision != request.revision:
        raise HTTPException(409, "Карточка изменилась. Откройте её заново.")
    if card.dds_exercise and not request.replace_existing:
        raise HTTPException(409, "Подтвердите замену существующего упражнения ДДС.")
    pending = await session.scalar(
        select(func.count())
        .select_from(AIJob)
        .where(
            AIJob.created_by_id == teacher_id,
            AIJob.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]),
        )
    )
    if pending >= 30:
        raise HTTPException(409, "Дождитесь завершения предыдущих ИИ-задач.")
    if await session.scalar(
        select(AIJob.id)
        .where(
            AIJob.target_card_id == card.id, AIJob.status.in_([JobStatus.QUEUED, JobStatus.RUNNING])
        )
        .limit(1)
    ):
        raise HTTPException(409, "У этой карточки уже есть незавершённая генерация ДДС.")
    recipients = list(
        await session.scalars(
            select(CardTemplateRecipient.service_id).where(
                CardTemplateRecipient.card_template_id == card.id
            )
        )
    )
    seed = random.SystemRandom().randrange(2**31)
    resolved = await plan(session, card, recipients, request, seed)
    parent = await session.scalar(select(AIJob.id).where(AIJob.card_template_id == card.id))
    job = AIJob(
        purpose=AIPurpose.DDS_GENERATION,
        created_by_id=teacher_id,
        target_card_id=card.id,
        parent_job_id=parent,
        idempotency_key=key,
        prompt_version=PROMPT_VERSION,
        model_version=settings.llm_model,
        input={
            "plan": resolved,
            "revision": card.revision,
            "seed": seed,
            "classifier_entry_id": str(card.classifier_entry_id)
            if card.classifier_entry_id
            else None,
            "card": {"title": card.title},
            "facts": {
                "Тип происшествия": "Упражнение ДДС",
                "Адрес": card.data.get("address_text", ""),
                "Службы": [resolved["profile"]["name"]],
            },
        },
        context={"fingerprint": fingerprint, "request": request.model_dump(mode="json")},
    )
    session.add(job)
    await session.commit()
    return job


async def finish(session, job_id, token, exercise, metadata):
    job = await session.scalar(select(AIJob).where(AIJob.id == job_id).with_for_update())
    if not valid_lease(job, token):
        await session.rollback()
        return False
    owner = await session.get(User, job.created_by_id)
    if not owner or not owner.is_active or not owner.is_teacher:
        raise ValueError("Owner unavailable")
    card = await owned_card(session, job.target_card_id, job.created_by_id, lock=True)
    await editable(session, card)
    if card.revision != job.input["revision"]:
        raise HTTPException(409, "Карточка была изменена во время генерации.")
    if not await still_approved(session, job.created_by_id, metadata.get("examples", [])):
        raise ValueError("Example revoked during generation")
    recipients = list(
        await session.scalars(
            select(CardTemplateRecipient.service_id).where(
                CardTemplateRecipient.card_template_id == card.id
            )
        )
    )
    await validate_profile(session, exercise, recipients)
    card.dds_exercise = exercise.model_dump(mode="json")
    card.revision += 1
    card.generation_example = False
    card.updated_at = datetime.now(UTC)
    job.status = JobStatus.SUCCEEDED
    job.output = {"exercise": card.dds_exercise, "inference": metadata}
    job.completed_at = datetime.now(UTC)
    job.worker_id = job.lease_expires_at = None
    job.error = None
    await session.commit()
    return True
