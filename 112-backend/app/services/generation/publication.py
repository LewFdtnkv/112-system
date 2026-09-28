"""Publish a generated library card atomically while holding its AI job lease."""

from datetime import UTC, datetime

from sqlalchemy import select

from app.models import AIJob, CardTemplate, CardTemplateRecipient, User
from app.models.enums import JobStatus
from app.schemas.authoring import CardCreate
from app.services.ai_jobs.lease import valid_lease
from app.services.authoring.cards import validate_card_definition
from app.services.generation import examples
from app.services.generation.narration import fallback
from app.services.generation.protection import protect


async def finish(session, job_id, token, text, metadata):
    job = await session.scalar(select(AIJob).where(AIJob.id == job_id).with_for_update())
    if not valid_lease(job, token):
        await session.rollback()
        return False
    owner = await session.get(User, job.created_by_id)
    if not owner or not owner.is_active or not owner.is_teacher:
        raise ValueError("Generation owner is no longer an active teacher")
    payload = CardCreate.model_validate(job.input["card"])
    if not await examples.still_approved(session, job.created_by_id, metadata.get("examples", [])):
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
