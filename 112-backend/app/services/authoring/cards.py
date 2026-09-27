from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AIJob,
    CardTemplate,
    CardTemplateRecipient,
    ClassifierEntry,
    ClassifierRoute,
    ClassifierVersion,
    ScenarioCard,
    ScenarioVersion,
    Service,
)
from app.schemas.authoring import (
    CardCreate,
    CardRead,
    CardUpdate,
    GenerationExampleUpdate,
)
from app.schemas.catalog import ClassifierEntryRead
from app.schemas.student import RecipientRead
from app.services.authoring.catalog_access import published_classifier
from app.services.catalog_rules import applicable_routes


async def owned_card(
    session: AsyncSession, card_id: UUID, teacher_id: UUID, *, lock: bool = False
) -> CardTemplate:
    query = select(CardTemplate).where(
        CardTemplate.id == card_id, CardTemplate.created_by_id == teacher_id
    )
    if lock:
        query = query.with_for_update()
    card = await session.scalar(query)
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return card


async def card_read(session: AsyncSession, card: CardTemplate) -> CardRead:
    recipients = list(
        await session.scalars(
            select(Service)
            .join(CardTemplateRecipient, CardTemplateRecipient.service_id == Service.id)
            .where(CardTemplateRecipient.card_template_id == card.id)
            .order_by(CardTemplateRecipient.service_id)
        )
    )
    scenario_count = await session.scalar(
        select(func.count(func.distinct(ScenarioVersion.scenario_id)))
        .select_from(ScenarioCard)
        .join(ScenarioVersion, ScenarioVersion.id == ScenarioCard.scenario_version_id)
        .where(ScenarioCard.card_template_id == card.id)
    )
    job = await session.scalar(select(AIJob).where(AIJob.card_template_id == card.id))
    inference = (job.output or {}).get("inference", {}) if job else {}
    return CardRead(
        audio=card.audio,
        dds_exercise=card.dds_exercise,
        generation_example=card.generation_example,
        generated_by_ai=job is not None,
        generation_method=inference.get("source"),
        generation_note=inference.get("quality_note"),
        generation_template=job.input.get("narrative", {}).get("title") if job else None,
        can_edit=scenario_count == 0,
        scenario_count=scenario_count,
        id=card.id,
        revision=card.revision,
        updated_at=card.updated_at,
        classifier_label=(await session.get(ClassifierVersion, card.classifier_version_id)).label,
        created_at=card.created_at,
        created_by_id=card.created_by_id,
        title=card.title,
        classifier_version_id=card.classifier_version_id,
        classifier_entry_id=card.classifier_entry_id,
        caller_message=card.caller_message,
        instructions=card.instructions,
        data=card.data,
        recipient_service_ids=[service.id for service in recipients],
        recipients=[
            RecipientRead(service_id=service.id, name=service.name, short_name=service.short_name)
            for service in recipients
        ],
        classifier_entry=ClassifierEntryRead.model_validate(
            await session.get(ClassifierEntry, card.classifier_entry_id)
        )
        if card.classifier_entry_id
        else None,
    )


async def validate_card_definition(session: AsyncSession, payload: CardCreate) -> list[Service]:
    from app.services.authoring.card_validation import field_error

    try:
        return await _validate_card_definition(session, payload)
    except HTTPException as exc:
        if exc.status_code in (404, 409, 422):
            entry = (
                await session.get(ClassifierEntry, payload.classifier_entry_id)
                if payload.classifier_entry_id
                else None
            )
            detail = field_error(exc.detail, entry)
            if detail:
                raise HTTPException(exc.status_code, detail) from exc
        raise


async def _validate_card_definition(session: AsyncSession, payload: CardCreate) -> list[Service]:
    await published_classifier(session, payload.classifier_version_id)
    from app.schemas.card_flags import check_consistency, check_silent, flags

    check_consistency(payload.data)
    check_silent(payload.data, payload.classifier_entry_id, payload.recipient_service_ids)
    if flags(payload.data).get("noContact"):
        if payload.dds_exercise:
            raise HTTPException(422, "Для карточки ДДС нужна служба-получатель.")
        return []
    entry = (
        await session.get(ClassifierEntry, payload.classifier_entry_id)
        if payload.classifier_entry_id
        else None
    )
    if entry is None or entry.classifier_version_id != payload.classifier_version_id:
        raise HTTPException(
            status_code=422, detail="The incident code must belong to the selected classifier"
        )
    if entry.notification_required and not payload.data.address_text.strip():
        raise HTTPException(422, "Address is required for an incident requiring notification")
    routes = list(
        await session.scalars(
            select(ClassifierRoute).where(
                ClassifierRoute.entry_id == entry.id,
            )
        )
    )
    if (entry.notification_required and not routes) or (not entry.notification_required and routes):
        raise HTTPException(
            status_code=409, detail="The incident code has no prepared service routes"
        )
    selected = set(payload.recipient_service_ids)
    allowed = {route.service_id for route in routes}
    required = {route.service_id for route in routes if not route.conditions}
    if entry.conditions.get("format") in ("boolean-features-v1", "typed-features-v1"):
        required = {r.service_id for r in applicable_routes(entry, routes, payload.data.features)}
        allowed = required
    if payload.use_recommended_recipients and (not required <= selected or not selected <= allowed):
        raise HTTPException(422, "Recipients must follow the selected classifier routes")
    recipients = list(
        await session.scalars(
            select(Service).where(
                Service.id.in_(payload.recipient_service_ids), Service.is_active.is_(True)
            )
        )
    )
    if len(recipients) != len(payload.recipient_service_ids):
        raise HTTPException(
            status_code=422, detail="Every recipient must be an existing active service"
        )
    if payload.dds_exercise:
        from app.services.dds.exercise import validate_profile

        await validate_profile(session, payload.dds_exercise, payload.recipient_service_ids)
    return recipients


async def create_card(session: AsyncSession, teacher_id: UUID, payload: CardCreate) -> CardRead:
    from app.services.telephony.recordings import validate_selection

    await validate_selection(session, teacher_id, payload.audio)
    recipients = await validate_card_definition(session, payload)
    card = CardTemplate(
        created_by_id=teacher_id,
        **payload.model_dump(
            exclude={
                "recipient_service_ids",
                "data",
                "use_recommended_recipients",
                "dds_exercise",
                "audio",
            }
        ),
        audio=payload.audio.model_dump(mode="json"),
        dds_exercise=payload.dds_exercise.model_dump(mode="json") if payload.dds_exercise else None,
        data=payload.data.model_dump(mode="json"),
    )
    session.add(card)
    await session.flush()
    session.add_all(
        [CardTemplateRecipient(card_template_id=card.id, service_id=s.id) for s in recipients]
    )
    await session.commit()
    return await card_read(session, card)


async def update_card(
    session: AsyncSession, teacher_id: UUID, card_id: UUID, payload: CardUpdate
) -> CardRead:
    card = await owned_card(session, card_id, teacher_id, lock=True)
    if card.revision != payload.revision:
        raise HTTPException(409, "Card has a newer revision. Reload it before saving.")
    used = await session.scalar(
        select(ScenarioCard.id).where(ScenarioCard.card_template_id == card.id).limit(1)
    )
    if used is not None:
        raise HTTPException(409, "Used cards cannot be edited")
    from app.services.telephony.recordings import validate_selection

    await validate_selection(session, teacher_id, payload.audio)
    recipients = await validate_card_definition(session, payload)
    for key, value in payload.model_dump(
        exclude={
            "revision",
            "recipient_service_ids",
            "use_recommended_recipients",
            "data",
            "dds_exercise",
            "audio",
        }
    ).items():
        setattr(card, key, value)
    card.audio = payload.audio.model_dump(mode="json")
    card.dds_exercise = (
        payload.dds_exercise.model_dump(mode="json") if payload.dds_exercise else None
    )
    card.data = payload.data.model_dump(mode="json")
    card.generation_example = False
    card.revision += 1
    card.updated_at = datetime.now(UTC)
    await session.execute(
        delete(CardTemplateRecipient).where(CardTemplateRecipient.card_template_id == card.id)
    )
    session.add_all(
        [CardTemplateRecipient(card_template_id=card.id, service_id=s.id) for s in recipients]
    )
    await session.commit()
    return await card_read(session, card)


async def set_generation_example(
    session: AsyncSession, teacher_id: UUID, card_id: UUID, payload: GenerationExampleUpdate
) -> CardRead:
    card = await owned_card(session, card_id, teacher_id, lock=True)
    if card.revision != payload.revision:
        raise HTTPException(409, "Карточка изменилась. Обновите её перед подтверждением.")
    if payload.enabled and (
        (not (card.caller_message or "").strip() and not card.dds_exercise)
        or len(card.caller_message or "") > 2500
    ):
        raise HTTPException(
            422, "Для образца нужно условие 112 до 2500 символов или упражнение ДДС."
        )
    if payload.enabled and any(
        card.data.get("additional_fields", {}).get("details", {}).get(key)
        for key in ("noContact", "callDropped")
    ):
        raise HTTPException(422, "Молчаливые вызовы и обрывы пока не используются в генерации.")
    card.generation_example = payload.enabled
    await session.commit()
    return await card_read(session, card)
