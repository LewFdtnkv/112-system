import hashlib
import json
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from app.models import ClassifierEntry, ClassifierRoute, ClassifierVersion, Service
from app.models.enums import PublicationStatus
from app.schemas.catalog_document import CatalogDocument, EntryDefinition
from app.services.catalog_rules import feature_definitions


async def version_row(session, version_id, *, draft=False, expected=None):
    row = await session.scalar(
        select(ClassifierVersion).where(ClassifierVersion.id == version_id).with_for_update()
    )
    if row is None:
        raise HTTPException(404, "Classifier version not found")
    if draft and row.status != PublicationStatus.DRAFT:
        raise HTTPException(409, "Published catalogs are immutable; create a new draft version")
    if expected is not None and row.revision != expected:
        raise HTTPException(409, "Catalog revision is stale; reload the catalog")
    return row


async def commit(session):
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        if getattr(exc.orig, "sqlstate", None) == "23505":
            raise HTTPException(
                409, "Catalog label, service or incident code already exists"
            ) from exc
        raise


async def export_document(session, version):
    entries = list(
        await session.scalars(
            select(ClassifierEntry)
            .where(ClassifierEntry.classifier_version_id == version.id)
            .order_by(ClassifierEntry.code)
        )
    )
    pairs = (
        await session.execute(
            select(ClassifierRoute, Service)
            .join(Service)
            .where(ClassifierRoute.entry_id.in_([e.id for e in entries]))
            .order_by(Service.code)
        )
    ).all()
    services = {
        s.code: {"code": s.code, "name": s.name, "short_name": s.short_name} for _, s in pairs
    }
    grouped = {}
    for route, service in pairs:
        if route.conditions and set(route.conditions) != {"when"}:
            raise HTTPException(409, "Unsupported classifier condition format")
        grouped.setdefault(route.entry_id, []).append(
            {
                "service_code": service.code,
                "is_main": route.is_main,
                "when": route.conditions.get("when", {}),
            }
        )
    return CatalogDocument(
        label=version.label,
        services=list(services.values()),
        entries=[
            EntryDefinition(
                code=e.code,
                section=e.section,
                name=e.name,
                display_name=e.display_name,
                is_popular=e.is_popular,
                popular_order=e.popular_order,
                notification_required=e.notification_required,
                response_scenario=e.response_scenario,
                features=feature_definitions(e),
                routes=grouped.get(e.id, []),
            )
            for e in entries
        ],
    )


async def write_entry(session, version_id, item, services, *, entry=None, row=1):
    if entry is None:
        entry = ClassifierEntry(
            id=uuid4(), classifier_version_id=version_id, source_sheet="entries", source_row=row
        )
        session.add(entry)
    else:
        await session.execute(delete(ClassifierRoute).where(ClassifierRoute.entry_id == entry.id))
    entry.code, entry.section, entry.name = item.code, item.section, item.name
    for key in ("display_name", "is_popular", "popular_order", "notification_required"):
        setattr(entry, key, getattr(item, key))
    entry.response_scenario = item.response_scenario
    entry.conditions = (
        {"format": "typed-features-v1", "features": [f.model_dump() for f in item.features]}
        if item.features
        else {}
    )
    entry.source_data = item.model_dump(mode="json")
    await session.flush()
    session.add_all(
        [
            ClassifierRoute(
                entry_id=entry.id,
                service_id=services[r.service_code].id,
                service_name=services[r.service_code].name,
                is_main=r.is_main,
                conditions={"when": r.when} if r.when else {},
            )
            for r in item.routes
        ]
    )
    return entry


async def import_document(session, document, admin_id, filename="classifier.json"):
    services = {
        s.code: s
        for s in await session.scalars(
            select(Service)
            .where(Service.code.in_([s.code for s in document.services]))
            .with_for_update()
        )
    }
    for item in document.services:
        found = services.get(item.code)
        if found and (
            not found.is_active
            or found.name != item.name
            or (item.short_name is not None and found.short_name not in (None, item.short_name))
        ):
            raise HTTPException(409, f"Service code conflicts with existing service: {item.code}")
    for item in document.services:
        if item.code not in services:
            row = Service(id=uuid4(), **item.model_dump())
            session.add(row)
            services[item.code] = row
        elif item.short_name is not None and services[item.code].short_name is None:
            services[item.code].short_name = item.short_name
    canonical = json.dumps(document.model_dump(mode="json"), ensure_ascii=False, sort_keys=True)
    vid = uuid4()
    version = ClassifierVersion(
        id=vid,
        label=document.label,
        source_filename=filename,
        source_storage_key=f"db:classifier_versions/{vid}/import_report/source",
        source_sha256=hashlib.sha256(canonical.encode()).hexdigest(),
        import_report={
            "format": document.format,
            "source": document.model_dump(mode="json"),
            "created_by": str(admin_id),
        },
    )
    session.add(version)
    try:
        await session.flush()
        for number, entry in enumerate(document.entries, 1):
            await write_entry(session, vid, entry, services, row=number)
        await commit(session)
    except IntegrityError as exc:
        await session.rollback()
        if getattr(exc.orig, "sqlstate", None) == "23505":
            raise HTTPException(
                409, "Catalog label, service or incident code already exists"
            ) from exc
        raise
    return version


async def update_entry(session, version_id, entry_id, payload, admin_id):
    version = await version_row(session, version_id, draft=True, expected=payload.expected_revision)
    entry = await session.scalar(
        select(ClassifierEntry).where(
            ClassifierEntry.id == entry_id, ClassifierEntry.classifier_version_id == version_id
        )
    )
    if entry is None:
        raise HTTPException(404, "Classifier entry not found")
    codes = {r.service_code for r in payload.entry.routes}
    services = {
        s.code: s
        for s in await session.scalars(
            select(Service).where(Service.code.in_(codes), Service.is_active.is_(True))
        )
    }
    if set(services) != codes:
        raise HTTPException(422, "Routes require existing active services")
    conflict = await session.scalar(
        select(ClassifierEntry.id).where(
            ClassifierEntry.classifier_version_id == version_id,
            ClassifierEntry.code == payload.entry.code,
            ClassifierEntry.id != entry_id,
        )
    )
    if conflict:
        raise HTTPException(409, "Incident code already exists")
    await write_entry(session, version_id, payload.entry, services, entry=entry)
    version.revision += 1
    version.import_report = version.import_report | {
        "last_edited_by": str(admin_id),
        "last_edited_at": datetime.now(UTC).isoformat(),
    }
    await commit(session)
    return version
