from typing import Literal
from uuid import UUID

from fastapi import APIRouter

from app.api.dependencies import SessionDep, TeacherDep
from app.api.pagination import Limit, Offset
from app.schemas.error_analytics import ErrorAnalyticsRead
from app.services.error_analytics.report import report

router = APIRouter(prefix="/views", tags=["frontend pages"])


@router.get("/analytics/errors", response_model=ErrorAnalyticsRead)
async def error_analytics(
    session: SessionDep,
    teacher: TeacherDep,
    group_id: UUID | None = None,
    role: Literal["all", "operator_112", "dds"] = "all",
    track: Literal["training", "assessment"] = "training",
    days: Literal["30", "90", "365"] = "90",
    limit: Limit = 20,
    offset: Offset = 0,
):
    return await report(
        session,
        teacher.id,
        group_id=group_id,
        role=role,
        track=track,
        days=int(days),
        limit=limit,
        offset=offset,
    )
