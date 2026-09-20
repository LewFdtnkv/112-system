from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import delete, func, select

from app.models import Service, ServiceObject, ServiceProfile, ServiceTerritory, TrainingContact
from app.models.enums import PublicationStatus
from app.schemas.service_profile import ProfileRead


async def profile_row(session, profile_id, *, draft=False):
    row = await session.scalar(
        select(ServiceProfile).where(ServiceProfile.id == profile_id).with_for_update()
    )
    if row is None:
        raise HTTPException(404, "Service profile not found")
    if draft and row.status != PublicationStatus.DRAFT:
        raise HTTPException(409, "Published profiles are immutable; create a new version")
    return row


async def profile_read(session, row):
    territories = list(
        await session.scalars(
            select(ServiceTerritory)
            .where(ServiceTerritory.profile_id == row.id)
            .order_by(ServiceTerritory.code)
        )
    )
    by_id = {t.id: t.code for t in territories}
    objects = list(
        await session.scalars(
            select(ServiceObject)
            .where(ServiceObject.profile_id == row.id)
            .order_by(ServiceObject.code)
        )
    )
    contacts = list(
        await session.scalars(
            select(TrainingContact)
            .where(TrainingContact.profile_id == row.id)
            .order_by(TrainingContact.code)
        )
    )
    return ProfileRead(
        id=row.id,
        service_id=row.service_id,
        name=row.name,
        version=row.version,
        revision=row.revision,
        status=row.status,
        responsibility=row.responsibility,
        procedure=row.rules.get("procedure", ""),
        territories=[
            {"code": t.code, "name": t.name, "description": t.description} for t in territories
        ],
        objects=[
            {
                "code": o.code,
                "name": o.name,
                "territory_code": by_id.get(o.territory_id),
                "address": o.address,
                "responsibility": o.responsibility,
            }
            for o in objects
        ],
        contacts=[
            {
                "code": c.code,
                "name": c.name,
                "description": c.description,
                "target_service_id": c.target_service_id,
                "position": c.position,
                "endpoint_key": c.endpoint_key,
            }
            for c in contacts
        ],
    )


async def validate_services(session, data):
    ids = {data.service_id} | {c.target_service_id for c in data.contacts}
    found = set(
        await session.scalars(
            select(Service.id).where(Service.id.in_(ids), Service.is_active.is_(True))
        )
    )
    if ids != found:
        raise HTTPException(422, "Profile requires existing active services")


async def write_children(session, row, data):
    for model in (TrainingContact, ServiceObject, ServiceTerritory):
        await session.execute(delete(model).where(model.profile_id == row.id))
    territories = {t.code: uuid4() for t in data.territories}
    session.add_all(
        [
            ServiceTerritory(id=territories[t.code], profile_id=row.id, **t.model_dump())
            for t in data.territories
        ]
    )
    await session.flush()
    session.add_all(
        [
            ServiceObject(
                profile_id=row.id,
                territory_id=territories.get(o.territory_code),
                **o.model_dump(exclude={"territory_code"}),
            )
            for o in data.objects
        ]
    )
    session.add_all([TrainingContact(profile_id=row.id, **c.model_dump()) for c in data.contacts])


async def create_profile(session, data):
    await validate_services(session, data)
    await session.execute(select(Service.id).where(Service.id == data.service_id).with_for_update())
    number = 1 + (
        await session.scalar(
            select(func.max(ServiceProfile.version)).where(
                ServiceProfile.service_id == data.service_id
            )
        )
        or 0
    )
    row = ServiceProfile(
        service_id=data.service_id,
        version=number,
        name=data.name,
        responsibility=data.responsibility,
        rules={"procedure": data.procedure},
    )
    session.add(row)
    await session.flush()
    await write_children(session, row, data)
    await session.commit()
    return await profile_read(session, row)


async def update_profile(session, profile_id, data):
    row = await profile_row(session, profile_id, draft=True)
    if row.revision != data.expected_revision:
        raise HTTPException(409, "Profile revision is stale; reload the profile")
    if row.service_id != data.service_id:
        raise HTTPException(422, "A profile cannot change its service")
    await validate_services(session, data)
    row.name, row.responsibility, row.rules = (
        data.name,
        data.responsibility,
        {"procedure": data.procedure},
    )
    row.revision += 1
    await write_children(session, row, data)
    await session.commit()
    return await profile_read(session, row)


async def publish_profile(session, profile_id, admin_id):
    row = await profile_row(session, profile_id)
    if row.status == PublicationStatus.PUBLISHED:
        return await profile_read(session, row)
    if row.status != PublicationStatus.DRAFT:
        raise HTTPException(409, "Only draft profiles can be published")
    data = await profile_read(session, row)
    await validate_services(session, data)
    row.status, row.approved_by_id, row.approved_at = (
        PublicationStatus.PUBLISHED,
        admin_id,
        datetime.now(UTC),
    )
    row.revision += 1
    await session.commit()
    return await profile_read(session, row)
