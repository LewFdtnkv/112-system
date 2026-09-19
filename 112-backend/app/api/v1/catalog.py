from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.api.dependencies import SessionDep, TeacherDep
from app.api.v1.authoring import Limit, Offset
from app.models import ClassifierEntry, ClassifierRoute, ClassifierVersion, Service, ServiceProfile
from app.models.enums import PublicationStatus
from app.schemas.catalog import (
    ClassifierEntryRead,
    ClassifierRead,
    ClassifierRouteRead,
    ServiceProfileRead,
    ServiceRead,
)
from app.services.authoring import published_classifier

router = APIRouter(tags=["teaching catalogs"])


@router.get("/classifiers", response_model=list[ClassifierRead])
async def list_classifiers(
    session: SessionDep,
    teacher: TeacherDep,
    limit: Limit = 20,
    offset: Offset = 0,
    q: str = Query(default="", max_length=200),
):
    return list(
        await session.scalars(
            select(ClassifierVersion)
            .where(
                ClassifierVersion.status == PublicationStatus.PUBLISHED,
                ClassifierVersion.label.ilike(f"%{q}%"),
            )
            .order_by(ClassifierVersion.label, ClassifierVersion.id)
            .limit(limit)
            .offset(offset)
        )
    )


@router.get("/classifiers/{version_id}/entries", response_model=list[ClassifierEntryRead])
async def list_entries(
    version_id: UUID,
    session: SessionDep,
    teacher: TeacherDep,
    limit: Limit = 20,
    offset: Offset = 0,
    q: str = Query(default="", max_length=200),
):
    await published_classifier(session, version_id)
    return list(
        await session.scalars(
            select(ClassifierEntry)
            .where(
                ClassifierEntry.classifier_version_id == version_id,
                (ClassifierEntry.name.ilike(f"%{q}%") | ClassifierEntry.code.ilike(f"%{q}%")),
            )
            .order_by(ClassifierEntry.code, ClassifierEntry.id)
            .limit(limit)
            .offset(offset)
        )
    )


@router.get(
    "/classifiers/{version_id}/entries/{entry_id}/routes", response_model=list[ClassifierRouteRead]
)
async def list_routes(version_id: UUID, entry_id: UUID, session: SessionDep, teacher: TeacherDep):
    await published_classifier(session, version_id)
    entry = await session.get(ClassifierEntry, entry_id)
    if entry is None or entry.classifier_version_id != version_id:
        raise HTTPException(status_code=404, detail="Classifier entry not found")
    return list(
        await session.scalars(
            select(ClassifierRoute)
            .where(
                ClassifierRoute.entry_id == entry_id,
            )
            .order_by(ClassifierRoute.service_id)
        )
    )


@router.get("/services", response_model=list[ServiceRead])
async def list_services(
    session: SessionDep,
    teacher: TeacherDep,
    limit: Limit = 20,
    offset: Offset = 0,
    q: str = Query(default="", max_length=200),
):
    return list(
        await session.scalars(
            select(Service)
            .where(Service.is_active.is_(True))
            .order_by(
                Service.code,
                Service.id,
            )
            .limit(limit)
            .offset(offset)
        )
    )


@router.get("/service-profiles", response_model=list[ServiceProfileRead])
async def list_profiles(
    session: SessionDep,
    teacher: TeacherDep,
    service_id: UUID | None = None,
    limit: Limit = 20,
    offset: Offset = 0,
    q: str = Query(default="", max_length=200),
):
    query = (
        select(ServiceProfile)
        .join(Service)
        .where(
            ServiceProfile.status == PublicationStatus.PUBLISHED,
            ServiceProfile.name.ilike(f"%{q}%"),
            Service.is_active.is_(True),
        )
    )
    if service_id is not None:
        query = query.where(ServiceProfile.service_id == service_id)
    return list(
        await session.scalars(
            query.order_by(
                ServiceProfile.service_id,
                ServiceProfile.version,
            )
            .limit(limit)
            .offset(offset)
        )
    )
