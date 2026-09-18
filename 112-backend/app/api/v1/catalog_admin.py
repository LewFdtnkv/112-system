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
from app.schemas.catalog_admin import ClassifierAdminRead, ClassifierCreate, ServiceCreate

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


@router.post("/classifiers", response_model=ClassifierAdminRead, status_code=201)
async def create_classifier(payload: ClassifierCreate, session: SessionDep, admin: AdminDep):
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
        or {entry.id for entry in entries} != {route.entry_id for route, _ in routes}
        or any(not service.is_active for _, service in routes)
    ):
        raise HTTPException(status_code=409, detail="Every code requires active service routes")
    if any(entry.conditions for entry in entries) or any(route.conditions for route, _ in routes):
        raise HTTPException(
            status_code=409, detail="Conditional rules require a separate reviewed importer"
        )
    version.status = PublicationStatus.PUBLISHED
    version.approved_by_id = admin.id
    version.approved_at = datetime.now(UTC)
    await session.commit()
    return version
