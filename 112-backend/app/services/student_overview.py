"""Bounded dashboard projection shared by student and authorized teacher views."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GroupMembership, TrainingGroup, User
from app.schemas.student_overview import PerformanceSummary, PerformanceTrack, StudentOverview
from app.schemas.user import UserRead
from app.schemas.views import LessonRow, Page
from app.services.views import lesson_rows_query


async def student_overview(
    session: AsyncSession,
    user: User,
    *,
    teacher_id: UUID | None = None,
    active_offset: int = 0,
    available_offset: int = 0,
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
    tracks = []
    kind = func.coalesce(rows.c.learning["kind"].astext, "practice")
    # Two bounded projections, never an unbounded download of a student's history.
    for track, kinds in (
        ("training", ["practice", "skill_practice", "review"]),
        ("assessment", ["assessment"]),
    ):
        filtered = select(rows).where(kind.in_(kinds), rows.c.score.is_not(None)).subquery()
        count, average = (
            await session.execute(
                select(
                    func.count(),
                    func.avg(filtered.c.score * 100 / func.nullif(filtered.c.max_score, 0)),
                )
            )
        ).one()
        latest = (
            (
                await session.execute(
                    select(filtered)
                    .order_by(filtered.c.completed_at.desc().nulls_last(), filtered.c.lesson_id)
                    .limit(5)
                )
            )
            .mappings()
            .all()
        )
        tracks.append(
            PerformanceTrack(
                track=track,
                graded_lessons=count,
                overall_percent=round(float(average), 2) if average is not None else None,
                recent_percent=round(
                    sum(float(r.score * 100 / r.max_score) for r in latest) / len(latest), 2
                )
                if latest
                else None,
                recent_count=len(latest),
                recent_lessons=[LessonRow.model_validate(r) for r in latest],
            )
        )

    async def lesson_section(condition, offset):
        filtered = select(active).where(condition).subquery()
        total = await session.scalar(select(func.count()).select_from(filtered))
        offset = min(offset, max(0, (total - 1) // 6) * 6)
        records = (
            (
                await session.execute(
                    select(filtered)
                    .order_by(
                        filtered.c.available_until.asc().nulls_last(),
                        filtered.c.started_at.desc().nulls_last(),
                        filtered.c.lesson_id,
                    )
                    .limit(6)
                    .offset(offset)
                )
            )
            .mappings()
            .all()
        )
        return Page[LessonRow](
            items=[LessonRow.model_validate(r) for r in records],
            total=total,
            limit=6,
            offset=offset,
        )

    active_page = await lesson_section(active.c.work_status == "in_progress", active_offset)
    available_page = await lesson_section(active.c.work_status == "assigned", available_offset)
    groups = (
        select(TrainingGroup.name).join(GroupMembership).where(GroupMembership.user_id == user.id)
    )
    if teacher_id is not None:
        groups = groups.where(TrainingGroup.teacher_id == teacher_id)
    return StudentOverview(
        user=UserRead.model_validate(user),
        groups=list(await session.scalars(groups.order_by(TrainingGroup.name, TrainingGroup.id))),
        active_lessons=active_page,
        available_lessons=available_page,
        performance=PerformanceSummary(
            tracks=tracks,
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
