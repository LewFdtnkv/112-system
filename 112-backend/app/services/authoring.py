from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AnswerKey,
    CardTemplate,
    CardTemplateRecipient,
    ClassifierEntry,
    ClassifierRoute,
    ClassifierVersion,
    Scenario,
    ScenarioCard,
    ScenarioVersion,
    Service,
    ServiceProfile,
)
from app.models.enums import PublicationStatus, TrainingRole
from app.schemas.authoring import (
    CardCreate,
    CardRead,
    ScenarioCardRead,
    ScenarioCreate,
    ScenarioRead,
)
from app.services.assessment_policy import scenario_policy


async def published_classifier(session: AsyncSession, version_id: UUID) -> ClassifierVersion:
    version = await session.get(ClassifierVersion, version_id)
    if version is None:
        raise HTTPException(status_code=404, detail="Classifier version not found")
    if version.status != PublicationStatus.PUBLISHED:
        raise HTTPException(status_code=409, detail="A published classifier version is required")
    return version


async def published_profile(session: AsyncSession, profile_id: UUID) -> ServiceProfile:
    profile = await session.get(ServiceProfile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Service profile not found")
    service = await session.get(Service, profile.service_id)
    if profile.status != PublicationStatus.PUBLISHED or not service.is_active:
        raise HTTPException(
            status_code=409, detail="An active service and published profile are required"
        )
    return profile


async def owned_card(session: AsyncSession, card_id: UUID, teacher_id: UUID) -> CardTemplate:
    card = await session.scalar(
        select(CardTemplate).where(
            CardTemplate.id == card_id,
            CardTemplate.created_by_id == teacher_id,
        )
    )
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return card


async def card_read(session: AsyncSession, card: CardTemplate) -> CardRead:
    recipients = list(
        await session.scalars(
            select(CardTemplateRecipient.service_id)
            .where(CardTemplateRecipient.card_template_id == card.id)
            .order_by(CardTemplateRecipient.service_id)
        )
    )
    return CardRead(
        id=card.id,
        created_at=card.created_at,
        created_by_id=card.created_by_id,
        title=card.title,
        classifier_version_id=card.classifier_version_id,
        classifier_entry_id=card.classifier_entry_id,
        caller_message=card.caller_message,
        instructions=card.instructions,
        data=card.data,
        recipient_service_ids=recipients,
    )


async def create_card(session: AsyncSession, teacher_id: UUID, payload: CardCreate) -> CardRead:
    await published_classifier(session, payload.classifier_version_id)
    entry = await session.get(ClassifierEntry, payload.classifier_entry_id)
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
        from app.services.catalog_rules import applicable_routes

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
    card = CardTemplate(
        created_by_id=teacher_id,
        **payload.model_dump(
            exclude={"recipient_service_ids", "data", "use_recommended_recipients"}
        ),
        data=payload.data.model_dump(mode="json"),
    )
    session.add(card)
    await session.flush()
    session.add_all(
        [CardTemplateRecipient(card_template_id=card.id, service_id=s.id) for s in recipients]
    )
    await session.commit()
    return await card_read(session, card)


async def owned_scenario(
    session: AsyncSession, version_id: UUID, teacher_id: UUID
) -> ScenarioVersion:
    version = await session.scalar(
        select(ScenarioVersion)
        .join(Scenario)
        .where(
            ScenarioVersion.id == version_id,
            Scenario.created_by_id == teacher_id,
        )
    )
    if version is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return version


async def scenario_read(session: AsyncSession, version: ScenarioVersion) -> ScenarioRead:
    cards = list(
        await session.scalars(
            select(ScenarioCard)
            .where(ScenarioCard.scenario_version_id == version.id)
            .order_by(ScenarioCard.position)
        )
    )
    return ScenarioRead(
        id=version.id,
        scenario_id=version.scenario_id,
        version=version.version,
        title=version.title,
        role=version.role,
        status=version.status,
        classifier_version_id=version.classifier_version_id,
        service_profile_id=version.service_profile_id,
        dds_policy=version.completion_rules.get("dds"),
        instructions=version.instructions,
        category=version.category,
        difficulty=version.difficulty or "basic",
        duration_minutes=version.duration_minutes,
        norm_seconds=version.norm_seconds,
        approved_by_id=version.approved_by_id,
        approved_at=version.approved_at,
        created_at=version.created_at,
        cards=[ScenarioCardRead.model_validate(card) for card in cards],
        assessment_policy=await scenario_policy(session, version.id),
    )


async def create_scenario(
    session: AsyncSession,
    teacher_id: UUID,
    payload: ScenarioCreate,
    previous_id: UUID | None = None,
) -> ScenarioRead:
    cards = list(
        await session.scalars(
            select(CardTemplate).where(
                CardTemplate.id.in_(payload.card_ids),
                CardTemplate.created_by_id == teacher_id,
            )
        )
    )
    by_id = {card.id: card for card in cards}
    if set(payload.card_ids) != set(by_id):
        raise HTTPException(status_code=404, detail="One or more cards were not found")
    classifier_ids = {card.classifier_version_id for card in cards}
    if len(classifier_ids) != 1:
        raise HTTPException(
            status_code=422, detail="All cards must use the same classifier version"
        )
    classifier_id = next(iter(classifier_ids))
    await published_classifier(session, classifier_id)
    profile = None
    if payload.service_profile_id is not None:
        profile = await published_profile(session, payload.service_profile_id)
    recipients = (
        await session.execute(
            select(CardTemplateRecipient.card_template_id, Service)
            .join(Service, Service.id == CardTemplateRecipient.service_id)
            .where(CardTemplateRecipient.card_template_id.in_(by_id))
            .order_by(CardTemplateRecipient.card_template_id, Service.id)
        )
    ).all()
    by_card = {card.id: [] for card in cards}
    for card_id, service in recipients:
        if not service.is_active:
            raise HTTPException(status_code=409, detail="A card recipient is inactive")
        by_card[card_id].append(
            {"service_id": str(service.id), "name": service.name, "short_name": service.short_name}
        )
    for card in cards:
        if payload.role == TrainingRole.OPERATOR_112 and not card.caller_message:
            raise HTTPException(
                status_code=422, detail="Operator 112 cards require a caller message"
            )
        if payload.role == TrainingRole.DDS and str(profile.service_id) not in {
            service["service_id"] for service in by_card[card.id]
        }:
            raise HTTPException(
                status_code=422, detail="Each DDS card must be addressed to the profile service"
            )
    if previous_id is None:
        scenario = Scenario(title=payload.title, created_by_id=teacher_id)
        session.add(scenario)
        await session.flush()
        number = 1
    else:
        previous = await owned_scenario(session, previous_id, teacher_id)
        scenario = await session.scalar(
            select(Scenario).where(Scenario.id == previous.scenario_id).with_for_update()
        )
        if scenario.is_archived:
            raise HTTPException(409, "Archived scenarios cannot be edited")
        number = 1 + await session.scalar(
            select(func.max(ScenarioVersion.version)).where(
                ScenarioVersion.scenario_id == scenario.id
            )
        )
    version = ScenarioVersion(
        scenario_id=scenario.id,
        version=number,
        title=payload.title,
        role=payload.role,
        classifier_version_id=classifier_id,
        service_profile_id=payload.service_profile_id,
        completion_rules={"dds": payload.dds_policy.model_dump(mode="json")}
        if payload.role == TrainingRole.DDS and payload.dds_policy
        else {},
        instructions=payload.instructions,
        category=payload.category,
        difficulty=payload.difficulty,
        duration_minutes=payload.duration_minutes,
        norm_seconds=payload.norm_seconds,
        status=PublicationStatus(payload.status),
        approved_by_id=teacher_id if payload.status == "published" else None,
        approved_at=datetime.now(UTC) if payload.status == "published" else None,
    )
    session.add(version)
    await session.flush()
    session.add(
        AnswerKey(
            scenario_version_id=version.id,
            rubric=[
                {
                    "kind": "assessment_policy",
                    "policy": payload.assessment_policy.model_dump(mode="json"),
                }
            ],
        )
    )
    entry_settings = {
        str(e.id): e
        for e in await session.scalars(
            select(ClassifierEntry).where(
                ClassifierEntry.id.in_({c.classifier_entry_id for c in cards})
            )
        )
    }
    for position, card_id in enumerate(payload.card_ids, start=1):
        card = by_id[card_id]
        session.add(
            ScenarioCard(
                scenario_version_id=version.id,
                card_template_id=card.id,
                position=position,
                snapshot={
                    "title": card.title,
                    "instructions": card.instructions,
                    "caller_message": card.caller_message,
                    "data": card.data,
                    "classifier_version_id": str(card.classifier_version_id),
                    "classifier_entry_id": str(card.classifier_entry_id),
                    "recipients": by_card[card.id],
                    "feature_definitions": entry_settings[
                        str(card.classifier_entry_id)
                    ].conditions.get("features", []),
                    "notification_required": bool(by_card[card.id]),
                },
            )
        )
    await session.commit()
    return await scenario_read(session, version)
