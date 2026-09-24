from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ClassifierEntry,
    ClassifierRoute,
    IncidentCard,
    Service,
)
from app.services.catalog_rules import applicable_routes


async def selected_entry(session: AsyncSession, card: IncidentCard) -> ClassifierEntry:
    entry = (
        await session.get(ClassifierEntry, card.classifier_entry_id)
        if card.classifier_entry_id
        else None
    )
    if entry is None or entry.classifier_version_id != card.classifier_version_id:
        raise HTTPException(
            status_code=422, detail="Choose an incident code from the assigned classifier"
        )
    return entry


async def recipients(
    session: AsyncSession, card: IncidentCard, entry_id: UUID | None = None
) -> list[Service]:
    if entry_id is None:
        entry = await selected_entry(session, card)
    else:
        entry = await session.get(ClassifierEntry, entry_id)
        if entry is None or entry.classifier_version_id != card.classifier_version_id:
            raise HTTPException(
                status_code=422, detail="Choose a code from the assigned classifier"
            )
    routes = (
        await session.execute(
            select(ClassifierRoute, Service)
            .join(Service)
            .where(
                ClassifierRoute.entry_id == entry.id,
            )
            .order_by(Service.id)
        )
    ).all()
    if (
        (entry.notification_required and not routes)
        or (not entry.notification_required and routes)
        or any(not service.is_active for _, service in routes)
    ):
        raise HTTPException(status_code=409, detail="Active prepared service routes are required")

    selected = {
        r.service_id for r in applicable_routes(entry, [r for r, _ in routes], card.features)
    }
    return [service for route, service in routes if route.service_id in selected]


async def selected_services(session, ids):
    rows = list(
        await session.scalars(
            select(Service)
            .where(Service.id.in_(ids), Service.is_active.is_(True))
            .order_by(Service.name, Service.id)
        )
    )
    if len(rows) != len(ids):
        raise HTTPException(422, "Choose existing active training services")
    return rows


async def final_recipients(session, card):
    from app.schemas.card_flags import flags

    if flags(card).get("noContact"):
        return []
    if card.recipient_service_ids is None:
        return await recipients(session, card)
    # The operator decides who to notify independently of route recommendations.
    # Required feature validation happens on submission, not while reading a draft.
    return await selected_services(session, card.recipient_service_ids)
