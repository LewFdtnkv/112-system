from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import Text, cast, func, select

from app.api.dependencies import AdminDep, SessionDep
from app.api.pagination import Limit, Offset
from app.models import (
    Attempt,
    AttemptEvent,
    User,
    UserActivity,
)
from app.services.exports import export_rows

router = APIRouter(tags=["activity"])


def user_activity_query(user_id):
    # Teaching actions are exported separately from proctoring; no camera/focus data here.
    account = select(
        UserActivity.id,
        UserActivity.created_at.label("occurred_at"),
        UserActivity.kind,
        UserActivity.actor_id,
        UserActivity.reason,
    ).where(UserActivity.user_id == user_id)
    teaching = (
        select(
            AttemptEvent.id,
            AttemptEvent.occurred_at,
            AttemptEvent.kind,
            AttemptEvent.actor_id,
            cast(AttemptEvent.payload, Text).label("reason"),
        )
        .join(Attempt)
        .where(Attempt.student_id == user_id)
    )
    return account.union_all(teaching).subquery()


@router.get("/admin/users/{user_id}/activity")
async def user_activity(
    user_id: UUID, session: SessionDep, admin: AdminDep, limit: Limit = 20, offset: Offset = 0
):
    if await session.get(User, user_id) is None:
        raise HTTPException(404, "User not found")
    rows = user_activity_query(user_id)
    total = await session.scalar(select(func.count()).select_from(rows))
    items = (
        (
            await session.execute(
                select(rows)
                .order_by(rows.c.occurred_at.desc(), rows.c.id)
                .limit(limit)
                .offset(offset)
            )
        )
        .mappings()
        .all()
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/admin/users/{user_id}/activity/export")
async def export_activity(
    user_id: UUID, session: SessionDep, admin: AdminDep, format: Literal["txt", "xlsx"] = "txt"
):
    if await session.get(User, user_id) is None:
        raise HTTPException(404, "User not found")
    rows = user_activity_query(user_id)
    data = (
        (await session.execute(select(rows).order_by(rows.c.occurred_at, rows.c.id).limit(10001)))
        .mappings()
        .all()
    )
    if len(data) > 10000:
        raise HTTPException(422, "Export exceeds 10000 events")
    return export_rows(
        ["Время", "Событие", "Кто выполнил", "Причина / сведения"],
        [[r["occurred_at"], r["kind"], r["actor_id"], r["reason"]] for r in data],
        format,
        "user-activity",
    )
