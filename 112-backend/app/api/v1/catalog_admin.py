from uuid import UUID

from fastapi import APIRouter

from app.api.dependencies import AdminDep, SessionDep
from app.schemas.catalog import ServiceRead
from app.schemas.catalog_admin import (
    ClassifierAdminRead,
    ClassifierCreate,
    ServiceCreate,
    ServiceNames,
)
from app.services import catalog_admin as service

router = APIRouter(prefix="/admin", tags=["catalog administration"])


@router.post("/services", response_model=ServiceRead, status_code=201)
async def create_service(payload: ServiceCreate, session: SessionDep, admin: AdminDep):
    return await service.create_service(session, payload)


@router.patch("/services/{service_id}", response_model=ServiceRead)
async def rename_service(
    service_id: UUID, payload: ServiceNames, session: SessionDep, admin: AdminDep
):
    return await service.rename_service(session, service_id, payload)


@router.post("/classifiers", response_model=ClassifierAdminRead, status_code=201)
async def create_classifier(payload: ClassifierCreate, session: SessionDep, admin: AdminDep):
    return await service.create_classifier(session, payload, admin.id)


@router.post("/classifiers/{version_id}/publish", response_model=ClassifierAdminRead)
async def publish_classifier(version_id: UUID, session: SessionDep, admin: AdminDep):
    return await service.publish_classifier(session, version_id, admin.id)
