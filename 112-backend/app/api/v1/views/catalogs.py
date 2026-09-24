from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.dependencies import AdminDep, SessionDep
from app.api.pagination import Limit, Offset, Search
from app.db.pagination import page_rows
from app.models import (
    ClassifierVersion,
    Service,
)
from app.schemas.catalog import ServiceRead
from app.schemas.catalog_admin import ClassifierAdminRead
from app.schemas.views import (
    Page,
)

router = APIRouter(prefix="/views", tags=["frontend pages"])


@router.get("/admin/services", response_model=Page[ServiceRead])
async def admin_services(
    session: SessionDep, admin: AdminDep, q: Search = "", limit: Limit = 20, offset: Offset = 0
):
    query = select(Service).where(Service.is_active.is_(True))
    if q:
        query = query.where(
            func.concat_ws(" ", Service.code, Service.name, Service.short_name).ilike(f"%{q}%")
        )
    total, rows = await page_rows(session, query.order_by(Service.code, Service.id), limit, offset)
    return Page(
        items=[ServiceRead.model_validate(row[0]) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/admin/classifiers", response_model=Page[ClassifierAdminRead])
async def admin_classifiers(
    session: SessionDep, admin: AdminDep, limit: Limit = 20, offset: Offset = 0
):
    total, rows = await page_rows(
        session,
        select(ClassifierVersion).order_by(
            ClassifierVersion.created_at.desc(), ClassifierVersion.id
        ),
        limit,
        offset,
    )
    return Page(
        items=[ClassifierAdminRead.model_validate(row[0]) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )
