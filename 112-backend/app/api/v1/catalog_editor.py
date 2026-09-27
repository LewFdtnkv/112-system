import json
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import ValidationError
from sqlalchemy import func, select

from app.api.dependencies import AdminDep, SessionDep
from app.api.pagination import Limit, Offset
from app.core.uploads import read_upload
from app.models import ClassifierEntry
from app.schemas.catalog_admin import ClassifierAdminRead
from app.schemas.catalog_document import CatalogClone, CatalogDocument, EntryUpdate
from app.services import catalog_editor as service

router = APIRouter(prefix="/admin/classifiers", tags=["catalog files and rules"])


@router.post("/import", response_model=ClassifierAdminRead, status_code=201)
async def upload(request: Request, session: SessionDep, admin: AdminDep):
    # Raw JSON upload avoids buffering an unbounded multipart attachment.
    raw = await read_upload(request.stream())
    try:
        document = CatalogDocument.model_validate_json(raw.decode("utf-8-sig"))
    except (ValidationError, UnicodeDecodeError) as exc:
        errors = (
            exc.errors(include_url=False, include_context=False, include_input=False)
            if isinstance(exc, ValidationError)
            else []
        )
        raise HTTPException(
            422, {"message": "Invalid classifier JSON", "errors": errors[:20]}
        ) from exc
    return await service.import_document(session, document, admin.id)


@router.get("/{version_id}/export")
async def download(version_id: UUID, session: SessionDep, admin: AdminDep):
    version = await service.version_row(session, version_id)
    doc = await service.export_document(session, version)
    return Response(
        json.dumps(doc.model_dump(mode="json"), ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="ekp-{version_id}.json"'},
    )


@router.post("/{version_id}/versions", response_model=ClassifierAdminRead, status_code=201)
async def clone(version_id: UUID, payload: CatalogClone, session: SessionDep, admin: AdminDep):
    version = await service.version_row(session, version_id)
    doc = await service.export_document(session, version)
    doc.label = payload.label
    return await service.import_document(session, doc, admin.id)


@router.get("/{version_id}/entries")
async def entries(
    version_id: UUID,
    session: SessionDep,
    admin: AdminDep,
    q: str = Query(default="", max_length=200),
    offset: Offset = 0,
    limit: Limit = 20,
):
    version = await service.version_row(session, version_id)
    query = select(ClassifierEntry).where(
        ClassifierEntry.classifier_version_id == version_id,
        (
            ClassifierEntry.name.ilike(f"%{q}%")
            | ClassifierEntry.code.ilike(f"%{q}%")
            | ClassifierEntry.display_name.ilike(f"%{q}%")
        ),
    )
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = list(
        await session.scalars(query.order_by(ClassifierEntry.code).offset(offset).limit(limit))
    )
    return {
        "version": ClassifierAdminRead.model_validate(version),
        "items": [{"id": e.id, "code": e.code, "name": e.name, "section": e.section} for e in rows],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.get("/{version_id}/entries/{entry_id}")
async def detail(version_id: UUID, entry_id: UUID, session: SessionDep, admin: AdminDep):
    # Only the chosen rule is read; list pages do not download the entire classifier.
    from app.models import ClassifierRoute, Service
    from app.services.catalog_rules import feature_definitions

    version = await service.version_row(session, version_id)
    entry = await session.scalar(
        select(ClassifierEntry).where(
            ClassifierEntry.id == entry_id, ClassifierEntry.classifier_version_id == version_id
        )
    )
    if entry is None:
        raise HTTPException(404, "Classifier entry not found")
    pairs = (
        await session.execute(
            select(ClassifierRoute, Service)
            .join(Service)
            .where(ClassifierRoute.entry_id == entry.id)
            .order_by(Service.code)
        )
    ).all()
    if any(r.conditions and set(r.conditions) != {"when"} for r, _ in pairs):
        raise HTTPException(409, "Unsupported classifier condition format")
    return {
        "revision": version.revision,
        "entry": {
            "code": entry.code,
            "section": entry.section,
            "name": entry.name,
            "display_name": entry.display_name,
            "is_popular": entry.is_popular,
            "popular_order": entry.popular_order,
            "notification_required": entry.notification_required,
            "response_scenario": entry.response_scenario,
            "features": feature_definitions(entry),
            "routes": [
                {"service_code": s.code, "is_main": r.is_main, "when": r.conditions.get("when", {})}
                for r, s in pairs
            ],
        },
    }


@router.put("/{version_id}/entries/{entry_id}", response_model=ClassifierAdminRead)
async def update(
    version_id: UUID, entry_id: UUID, payload: EntryUpdate, session: SessionDep, admin: AdminDep
):
    return await service.update_entry(session, version_id, entry_id, payload, admin.id)
