"""Bounded dashboard projection shared by student and authorized teacher views."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, literal, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GroupMembership, TrainingGroup, User
from app.schemas.student_overview import PerformanceSummary, PerformanceTrack, StudentOverview
from app.schemas.user import UserRead
from app.schemas.views import LessonRow, Page
from app.services.views import lesson_rows_query

TRACKS = {"training": ("practice", "skill_practice", "review"), "assessment": ("assessment",)}


async def student_overview(
    session: AsyncSession,
    user: User,
    *,
    teacher_id: UUID | None = None,
    active_offset: int = 0,
    available_offset: int = 0,
) -> StudentOverview:
    # PostgreSQL evaluates this CTE once for the bounded page/history branches.
    # No result cache: a changed grade, account, or lesson is visible on the next request.
    rows = lesson_rows_query(student_id=user.id, teacher_id=teacher_id).cte("overview_rows")
    now = datetime.now(UTC)
    available = (
        rows.c.status.in_(["active", "planned"])
        & (rows.c.work_status != "submitted")
        & or_(rows.c.available_from.is_(None), rows.c.available_from <= now)
        & or_(rows.c.available_until.is_(None), rows.c.available_until > now)
    )
    sections = {
        "active": available & (rows.c.work_status == "in_progress"),
        "available": available & (rows.c.work_status == "assigned"),
    }
    kind = func.coalesce(rows.c.learning["kind"].astext, "practice")
    graded = rows.c.score.is_not(None)
    percent = rows.c.score * 100 / func.nullif(rows.c.max_score, 0)
    aggregates = [
        func.count().label("total"),
        func.count().filter(rows.c.work_status == "submitted").label("completed"),
        func.count().filter(graded).label("graded"),
        func.avg(percent).label("average"),
    ]
    for track, kinds in TRACKS.items():
        aggregates.extend(
            [
                func.count().filter(graded & kind.in_(kinds)).label(f"{track}_count"),
                func.avg(percent).filter(kind.in_(kinds)).label(f"{track}_average"),
            ]
        )
    for name, condition in sections.items():
        aggregates.append(func.count().filter(condition).label(f"{name}_count"))
    stats = (await session.execute(select(*aggregates))).one()._mapping
    offsets = {
        name: min(offset, max(0, (stats[f"{name}_count"] - 1) // 6) * 6)
        for name, offset in (("active", active_offset), ("available", available_offset))
    }

    def recent_query(name, condition):
        return (
            select(literal(name).label("section"), rows)
            .where(condition)
            .order_by(rows.c.completed_at.desc().nulls_last(), rows.c.lesson_id)
            .limit(5)
        )

    queries = [recent_query("recent", graded)]
    queries.extend(recent_query(track, graded & kind.in_(kinds)) for track, kinds in TRACKS.items())
    for name, condition in sections.items():
        queries.append(
            select(literal(name).label("section"), rows)
            .where(condition)
            .order_by(
                rows.c.available_until.asc().nulls_last(),
                rows.c.started_at.desc().nulls_last(),
                rows.c.lesson_id,
            )
            .limit(6)
            .offset(offsets[name])
        )
    buckets = {name: [] for name in ("recent", *TRACKS, *sections)}
    for record in (await session.execute(union_all(*queries))).mappings():
        buckets[record.section].append(LessonRow.model_validate(record))
    # Sort the small bounded result explicitly: UNION ALL has no global ordering guarantee.
    for name, items in buckets.items():
        if name in sections:
            items.sort(
                key=lambda r: (
                    r.available_until.timestamp() if r.available_until else float("inf"),
                    -r.started_at.timestamp() if r.started_at else float("inf"),
                    str(r.lesson_id),
                )
            )
        else:
            items.sort(
                key=lambda r: (
                    -r.completed_at.timestamp() if r.completed_at else float("inf"),
                    str(r.lesson_id),
                )
            )

    def rounded(value):
        return round(float(value), 2) if value is not None else None

    def recent_percent(items):
        return (
            round(sum(float(r.score * 100 / r.max_score) for r in items) / len(items), 2)
            if items
            else None
        )

    def page(name):
        return Page[LessonRow](
            items=buckets[name], total=stats[f"{name}_count"], limit=6, offset=offsets[name]
        )

    groups = (
        select(TrainingGroup.name).join(GroupMembership).where(GroupMembership.user_id == user.id)
    )
    if teacher_id is not None:
        groups = groups.where(TrainingGroup.teacher_id == teacher_id)
    return StudentOverview(
        user=UserRead.model_validate(user),
        groups=list(await session.scalars(groups.order_by(TrainingGroup.name, TrainingGroup.id))),
        active_lessons=page("active"),
        available_lessons=page("available"),
        performance=PerformanceSummary(
            tracks=[
                PerformanceTrack(
                    track=track,
                    graded_lessons=stats[f"{track}_count"],
                    overall_percent=rounded(stats[f"{track}_average"]),
                    recent_percent=recent_percent(buckets[track]),
                    recent_count=len(buckets[track]),
                    recent_lessons=buckets[track],
                )
                for track in TRACKS
            ],
            total_lessons=stats["total"],
            completed_lessons=stats["completed"],
            graded_lessons=stats["graded"],
            overall_percent=rounded(stats["average"]),
            recent_percent=recent_percent(buckets["recent"]),
            recent_count=len(buckets["recent"]),
            recent_lessons=buckets["recent"],
        ),
    )
