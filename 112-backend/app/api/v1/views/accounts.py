from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.api.dependencies import AdminDep, SessionDep, StaffDep, TeacherDep
from app.api.pagination import Limit, Offset, Search
from app.db.pagination import page_rows
from app.models import (
    ClassifierVersion,
    GroupMembership,
    Service,
    TrainingGroup,
    User,
)
from app.schemas.views import (
    GroupItem,
    Page,
    UserItem,
)
from app.services.activity import student_scope
from app.services.groups import owned_group

router = APIRouter(prefix="/views", tags=["frontend pages"])


@router.get("/users", response_model=Page[UserItem])
async def users(
    session: SessionDep,
    staff: StaffDep,
    q: Search = "",
    role: Literal["all", "student", "teacher", "admin"] = "all",
    group_id: UUID | None = None,
    owned_only: bool = False,
    limit: Limit = 20,
    offset: Offset = 0,
):
    query = select(User)
    if owned_only:
        if not staff.is_teacher:
            raise HTTPException(status_code=403, detail="Teacher access required")
        query = query.where(student_scope(staff.id))
    if group_id:
        if not staff.is_teacher:
            # Admin is allowed the account directory, not another teacher's group management.
            raise HTTPException(status_code=403, detail="Teacher access required")
        await owned_group(session, group_id, staff.id)
        query = query.join(GroupMembership, GroupMembership.user_id == User.id).where(
            GroupMembership.group_id == group_id
        )
    if role == "student":
        query = query.where(User.is_admin.is_(False), User.is_teacher.is_(False))
    elif role == "teacher":
        query = query.where(User.is_teacher.is_(True))
    elif role == "admin":
        query = query.where(User.is_admin.is_(True))
    if q:
        query = query.where(
            func.concat_ws(
                " ", User.username, User.first_name, User.last_name, User.middle_name, User.email
            ).ilike(f"%{q}%")
        )
    total, rows = await page_rows(
        session, query.order_by(User.last_name, User.first_name, User.id), limit, offset
    )
    items = [UserItem.model_validate(row[0]) for row in rows]
    group_query = (
        select(GroupMembership.user_id, TrainingGroup.name)
        .join(TrainingGroup)
        .where(GroupMembership.user_id.in_([item.id for item in items]))
    )
    if not staff.is_admin:
        group_query = group_query.where(TrainingGroup.teacher_id == staff.id)
    names = {}
    if items:
        for user_id, name in (
            await session.execute(group_query.order_by(TrainingGroup.name))
        ).all():
            names.setdefault(user_id, []).append(name)
    for item in items:
        item.groups = names.get(item.id, [])
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/groups", response_model=Page[GroupItem])
async def groups(
    session: SessionDep, teacher: TeacherDep, q: Search = "", limit: Limit = 20, offset: Offset = 0
):
    query = (
        select(
            TrainingGroup.id,
            TrainingGroup.name,
            func.count(GroupMembership.user_id).label("student_count"),
        )
        .outerjoin(GroupMembership)
        .where(TrainingGroup.teacher_id == teacher.id, TrainingGroup.disbanded_at.is_(None))
    )
    if q:
        query = query.where(TrainingGroup.name.ilike(f"%{q}%"))
    query = query.group_by(TrainingGroup.id).order_by(TrainingGroup.name, TrainingGroup.id)
    total, rows = await page_rows(session, query, limit, offset)
    return Page(
        items=[GroupItem.model_validate(row._mapping) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/admin/dashboard")
async def admin_dashboard(session: SessionDep, admin: AdminDep):
    # Aggregate counts only, not lists of accounts or hidden teaching material.
    return {
        "users": await session.scalar(select(func.count()).select_from(User)),
        "services": await session.scalar(select(func.count()).select_from(Service)),
        "classifiers": await session.scalar(select(func.count()).select_from(ClassifierVersion)),
    }
