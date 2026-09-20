import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import AdminDep, SessionDep
from app.models import ClassifierEntry, ClassifierRoute, ClassifierVersion, Service
from app.models.enums import PublicationStatus
from app.schemas.catalog import ServiceRead
from app.schemas.catalog_admin import (
    ClassifierAdminRead,
    ClassifierCreate,
    ServiceCreate,
    ServiceNames,
)

router = APIRouter(prefix="/admin", tags=["catalog administration"])


@router.post("/services", response_model=ServiceRead, status_code=201)
async def create_service(payload: ServiceCreate, session: SessionDep, admin: AdminDep):
    service = Service(**payload.model_dump())
    session.add(service)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        if getattr(exc.orig, "sqlstate", None) == "23505":
            raise HTTPException(status_code=409, detail="Service code already exists") from exc
        raise
    return service


@router.patch("/services/{service_id}", response_model=ServiceRead)
async def rename_service(
    service_id: UUID, payload: ServiceNames, session: SessionDep, admin: AdminDep
):
    service = await session.scalar(
        select(Service).where(Service.id == service_id).with_for_update()
    )
    if service is None:
        raise HTTPException(404, "Service not found")
    service.name, service.short_name = payload.name, payload.short_name
    await session.commit()
    return service


@router.post("/classifiers", response_model=ClassifierAdminRead, status_code=201)
async def create_classifier(payload: ClassifierCreate, session: SessionDep, admin: AdminDep):
    for entry in payload.entries:
        if bool(entry.service_ids) != entry.notification_required:
            raise HTTPException(422, "Service routes must match notification_required")
    service_ids = {service_id for entry in payload.entries for service_id in entry.service_ids}
    services = list(
        await session.scalars(
            select(Service).where(
                Service.id.in_(service_ids),
                Service.is_active.is_(True),
            )
        )
    )
    if len(services) != len(service_ids):
        raise HTTPException(status_code=422, detail="Routes require existing active services")
    by_id = {service.id: service for service in services}
    document = payload.model_dump(mode="json")
    canonical = json.dumps(document, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    version_id = uuid4()
    version = ClassifierVersion(
        id=version_id,
        label=payload.label,
        source_filename=payload.source_filename,
        source_storage_key=f"db:classifier_versions/{version_id}/import_report/source",
        source_sha256=hashlib.sha256(canonical.encode()).hexdigest(),
        import_report={"format": "inline-unconditional-v1", "source": document},
    )
    try:
        session.add(version)
        await session.flush()
        for row, item in enumerate(payload.entries, start=1):
            entry = ClassifierEntry(
                classifier_version_id=version.id,
                code=item.code,
                section=item.section,
                name=item.name,
                display_name=item.display_name,
                is_popular=item.is_popular,
                popular_order=item.popular_order,
                notification_required=item.notification_required,
                source_sheet="entries",
                source_row=row,
                source_data=item.model_dump(mode="json"),
            )
            session.add(entry)
            await session.flush()
            session.add_all(
                [
                    ClassifierRoute(
                        entry_id=entry.id,
                        service_id=service_id,
                        service_name=by_id[service_id].name,
                    )
                    for service_id in item.service_ids
                ]
            )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        if getattr(exc.orig, "sqlstate", None) == "23505":
            raise HTTPException(status_code=409, detail="Classifier label already exists") from exc
        raise
    return version


@router.post("/classifiers/{version_id}/publish", response_model=ClassifierAdminRead)
async def publish_classifier(version_id: UUID, session: SessionDep, admin: AdminDep):
    version = await session.scalar(
        select(ClassifierVersion)
        .where(
            ClassifierVersion.id == version_id,
        )
        .with_for_update()
    )
    if version is None:
        raise HTTPException(status_code=404, detail="Classifier version not found")
    if version.status == PublicationStatus.PUBLISHED:
        return version
    if version.status != PublicationStatus.DRAFT:
        raise HTTPException(status_code=409, detail="Only draft classifiers can be published")
    entries = list(
        await session.scalars(
            select(ClassifierEntry).where(
                ClassifierEntry.classifier_version_id == version.id,
            )
        )
    )
    routes = (
        await session.execute(
            select(ClassifierRoute, Service)
            .join(Service)
            .where(
                ClassifierRoute.entry_id.in_([entry.id for entry in entries]),
            )
        )
    ).all()
    if (
        not entries
        or {entry.id for entry in entries if entry.notification_required}
        != {route.entry_id for route, _ in routes}
        or any(not service.is_active for _, service in routes)
    ):
        raise HTTPException(status_code=409, detail="Every code requires active service routes")
    from app.services.catalog_rules import feature_definitions

    routes_by_entry = {}
    for route, _ in routes:
        routes_by_entry.setdefault(route.entry_id, []).append(route)
    for entry in entries:
        definitions = {f.key: f for f in feature_definitions(entry)}
        for route in routes_by_entry.get(entry.id, []):
            if not route.conditions:
                continue
            if (
                set(route.conditions) != {"when"}
                or not isinstance(route.conditions["when"], dict)
                or not set(route.conditions["when"]) <= set(definitions)
                or any(
                    not definitions[k].accepts(v) or v == []
                    for k, v in route.conditions["when"].items()
                )
            ):
                raise HTTPException(409, "Invalid classifier route conditions")
    version.revision += 1
    version.status = PublicationStatus.PUBLISHED
    version.approved_by_id = admin.id
    version.approved_at = datetime.now(UTC)
    await session.commit()
    return version
