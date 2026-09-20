"""Bounded dashboard projection shared by student and authorized teacher views."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GroupMembership, TrainingGroup, User
from app.schemas.student_overview import PerformanceSummary, StudentOverview
from app.schemas.user import UserRead
from app.schemas.views import LessonRow, Page
from app.services.views import lesson_rows_query


async def student_overview(
    session: AsyncSession,
    user: User,
    *,
    teacher_id: UUID | None = None,
    active_offset: int = 0,
) -> StudentOverview:
    rows = lesson_rows_query(student_id=user.id, teacher_id=teacher_id).subquery()
    now = datetime.now(UTC)
    active = (
        select(rows)
        .where(
            rows.c.status.in_(["active", "planned"]),
            rows.c.work_status != "submitted",
            or_(rows.c.available_from.is_(None), rows.c.available_from <= now),
            or_(rows.c.available_until.is_(None), rows.c.available_until > now),
        )
        .subquery()
    )
    stats = (
        await session.execute(
            select(
                func.count().label("total"),
                func.count().filter(rows.c.work_status == "submitted").label("completed"),
                func.count().filter(rows.c.score.is_not(None)).label("graded"),
                func.avg(rows.c.score * 100 / func.nullif(rows.c.max_score, 0)).label("average"),
            )
        )
    ).one()
    recent = (
        (
            await session.execute(
                select(rows)
                .where(rows.c.score.is_not(None))
                .order_by(rows.c.completed_at.desc().nulls_last(), rows.c.lesson_id)
                .limit(5)
            )
        )
        .mappings()
        .all()
    )
    active_total = await session.scalar(select(func.count()).select_from(active))
    # A lesson can finish between polling requests; keep the current page valid.
    active_offset = min(active_offset, max(0, (active_total - 1) // 6) * 6)
    active_items = (
        (
            await session.execute(
                select(active)
                .order_by(
                    case((active.c.work_status == "in_progress", 0), else_=1),
                    active.c.available_until.asc().nulls_last(),
                    active.c.started_at.desc().nulls_last(),
                    active.c.lesson_id,
                )
                .limit(6)
                .offset(active_offset)
            )
        )
        .mappings()
        .all()
    )
    groups = (
        select(TrainingGroup.name).join(GroupMembership).where(GroupMembership.user_id == user.id)
    )
    if teacher_id is not None:
        groups = groups.where(TrainingGroup.teacher_id == teacher_id)
    return StudentOverview(
        user=UserRead.model_validate(user),
        groups=list(await session.scalars(groups.order_by(TrainingGroup.name, TrainingGroup.id))),
        active_lessons=Page[LessonRow](
            items=[LessonRow.model_validate(r) for r in active_items],
            total=active_total,
            limit=6,
            offset=active_offset,
        ),
        performance=PerformanceSummary(
            total_lessons=stats.total,
            completed_lessons=stats.completed,
            graded_lessons=stats.graded,
            overall_percent=round(float(stats.average), 2) if stats.average is not None else None,
            recent_percent=round(
                sum(float(r.score * 100 / r.max_score) for r in recent) / len(recent), 2
            )
            if recent
            else None,
            recent_count=len(recent),
            recent_lessons=[LessonRow.model_validate(r) for r in recent],
        ),
    )
