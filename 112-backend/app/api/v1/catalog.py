from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.api.dependencies import SessionDep, TeacherDep
from app.api.pagination import Limit, Offset
from app.models import ClassifierEntry, ClassifierRoute, ClassifierVersion, Service, ServiceProfile
from app.models.enums import PublicationStatus
from app.schemas.catalog import (
    ClassifierEntryRead,
    ClassifierRead,
    ClassifierRouteRead,
    ServiceProfileRead,
    ServiceRead,
)
from app.schemas.service_profile import ProfileRead
from app.services.authoring.catalog_access import published_classifier, published_profile
from app.services.service_profiles import profile_read

router = APIRouter(tags=["teaching catalogs"])


@router.get("/service-profiles/{profile_id}", response_model=ProfileRead)
async def read_profile(profile_id: UUID, session: SessionDep, teacher: TeacherDep):
    return await profile_read(session, await published_profile(session, profile_id))


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
                (
                    ClassifierEntry.name.ilike(f"%{q}%")
                    | ClassifierEntry.code.ilike(f"%{q}%")
                    | ClassifierEntry.display_name.ilike(f"%{q}%")
                ),
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
            .where(
                Service.is_active.is_(True),
                (
                    (Service.name.ilike(f"%{q}%") | Service.short_name.ilike(f"%{q}%"))
                    | Service.code.ilike(f"%{q}%")
                ),
            )
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
