from typing import Literal
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.dependencies import SessionDep, StudentDep, TeacherDep
from app.api.pagination import Limit, Offset, Search
from app.db.pagination import page_rows
from app.schemas.learning import LessonKind
from app.schemas.views import (
    AnalyticsRead,
    AnalyticsRow,
    LessonPage,
    Page,
)
from app.services.activity import owned_student
from app.services.views import lesson_page, lesson_rows_query

router = APIRouter(prefix="/views", tags=["frontend pages"])


@router.get("/lessons", response_model=LessonPage)
async def teacher_lessons(
    session: SessionDep,
    teacher: TeacherDep,
    q: Search = "",
    status: Literal["all", "assigned", "in_progress", "submitted"] = "all",
    role: Literal["all", "operator_112", "dds"] = "all",
    kind: LessonKind | Literal["all"] = "all",
    lesson_id: UUID | None = None,
    student_id: UUID | None = None,
    limit: Limit = 20,
    offset: Offset = 0,
):
    if student_id is not None:
        await owned_student(session, student_id, teacher.id)
    return await lesson_page(
        session,
        teacher_id=teacher.id,
        student_id=student_id,
        lesson_id=lesson_id,
        q=q,
        status=status,
        role=role,
        kind=kind,
        limit=limit,
        offset=offset,
    )


@router.get("/student/lessons", response_model=LessonPage)
async def student_lessons(
    session: SessionDep,
    student: StudentDep,
    q: Search = "",
    status: Literal["all", "assigned", "in_progress", "submitted"] = "all",
    role: Literal["all", "operator_112", "dds"] = "all",
    kind: LessonKind | Literal["all"] = "all",
    limit: Limit = 20,
    offset: Offset = 0,
):
    return await lesson_page(
        session,
        student_id=student.id,
        q=q,
        status=status,
        role=role,
        kind=kind,
        limit=limit,
        offset=offset,
    )


@router.get("/analytics", response_model=AnalyticsRead)
async def analytics(
    session: SessionDep,
    teacher: TeacherDep,
    scenario_version_id: UUID | None = None,
    track: Literal["training", "assessment"] = "training",
    limit: Limit = 20,
    offset: Offset = 0,
):
    base = lesson_rows_query(teacher_id=teacher.id).subquery()
    kinds = ["assessment"] if track == "assessment" else ["practice", "skill_practice", "review"]
    query = select(base).where(func.coalesce(base.c.learning["kind"].astext, "practice").in_(kinds))
    if scenario_version_id:
        query = query.where(base.c.scenario_version_id == scenario_version_id)
    rows = query.subquery()
    measures = [
        func.count().label("total"),
        func.count().filter(rows.c.work_status == "submitted").label("submitted"),
        func.count(rows.c.score).label("graded"),
        func.avg(rows.c.score * 100 / rows.c.max_score).label("average_score_percent"),
    ]
    summary = (await session.execute(select(*measures))).mappings().one()
    by_scenario = (
        select(rows.c.scenario_version_id, rows.c.scenario_title.label("title"), *measures)
        .group_by(rows.c.scenario_version_id, rows.c.scenario_title)
        .order_by(rows.c.scenario_title, rows.c.scenario_version_id)
    )
    total, records = await page_rows(session, by_scenario, limit, offset)
    return AnalyticsRead(
        **summary,
        scenarios=Page(
            items=[AnalyticsRow.model_validate(row._mapping) for row in records],
            total=total,
            limit=limit,
            offset=offset,
        ),
    )
