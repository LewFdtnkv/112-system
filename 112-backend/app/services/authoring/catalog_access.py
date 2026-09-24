from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ClassifierVersion,
    Service,
    ServiceProfile,
)
from app.models.enums import PublicationStatus


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
