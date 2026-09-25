from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.dependencies import AdminDep, SessionDep
from app.api.pagination import Limit, Offset
from app.models import ServiceProfile
from app.schemas.service_profile import ProfileInput, ProfileRead, ProfileUpdate
from app.services import service_profiles as service

router = APIRouter(prefix="/admin/service-profiles", tags=["service profiles"])


@router.get("")
async def listing(
    session: SessionDep,
    admin: AdminDep,
    q: str = Query(default="", max_length=200),
    offset: Offset = 0,
    limit: Limit = 20,
):
    query = select(ServiceProfile).where(ServiceProfile.name.ilike(f"%{q}%"))
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = list(
        await session.scalars(
            query.order_by(ServiceProfile.created_at.desc(), ServiceProfile.id)
            .offset(offset)
            .limit(limit)
        )
    )
    return {
        "items": [
            {
                "id": r.id,
                "service_id": r.service_id,
                "name": r.name,
                "version": r.version,
                "revision": r.revision,
                "status": r.status,
            }
            for r in rows
        ],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.post("", response_model=ProfileRead, status_code=201)
async def create(data: ProfileInput, session: SessionDep, admin: AdminDep):
    return await service.create_profile(session, data)


@router.get("/{profile_id}", response_model=ProfileRead)
async def detail(profile_id: UUID, session: SessionDep, admin: AdminDep):
    return await service.profile_read(session, await service.profile_row(session, profile_id))


@router.put("/{profile_id}", response_model=ProfileRead)
async def update(profile_id: UUID, data: ProfileUpdate, session: SessionDep, admin: AdminDep):
    return await service.update_profile(session, profile_id, data)


@router.post("/{profile_id}/publish", response_model=ProfileRead)
async def publish(profile_id: UUID, session: SessionDep, admin: AdminDep):
    return await service.publish_profile(session, profile_id, admin.id)
