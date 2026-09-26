from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select

from app.models import (
    Assignment,
    Attempt,
    Lesson,
    ProctoringEvent,
    User,
)
from app.services.student.access import owned_attempt


async def observe(session, attempt_id, student_id, payload):
    attempt, _ = await owned_attempt(session, attempt_id, student_id)
    await session.refresh(attempt, with_for_update=True)
    if attempt.ended_at and datetime.now(UTC) - attempt.ended_at > timedelta(minutes=5):
        raise HTTPException(409, "Proctoring observation window has closed")
    existing = {
        r.command_id: r
        for r in await session.scalars(
            select(ProctoringEvent).where(
                ProctoringEvent.attempt_id == attempt.id,
                ProctoringEvent.command_id.in_([e.command_id for e in payload.events]),
            )
        )
    }
    count = await session.scalar(
        select(func.count())
        .select_from(ProctoringEvent)
        .where(ProctoringEvent.attempt_id == attempt.id)
    )
    if count + len({e.command_id for e in payload.events} - existing.keys()) > 2000:
        raise HTTPException(429, "Proctoring event limit reached")
    for event in payload.events:
        previous = existing.get(event.command_id)
        if previous:
            if (
                previous.kind != event.kind
                or previous.client_occurred_at != event.client_occurred_at
            ):
                raise HTTPException(409, "Observation ID was reused with different data")
        else:
            row = ProctoringEvent(
                attempt_id=attempt.id, created_at=datetime.now(UTC), **event.model_dump()
            )
            session.add(row)
            existing[event.command_id] = row
    await session.commit()
    return {"accepted": len(payload.events)}


async def history(session, attempt_id, teacher_id, limit=20, offset=0):
    permitted = await session.scalar(
        select(Attempt.id)
        .join(Assignment, Assignment.id == Attempt.assignment_id)
        .join(Lesson)
        .where(Attempt.id == attempt_id, Lesson.teacher_id == teacher_id)
    )
    if permitted is None:
        raise HTTPException(404, "Attempt not found")
    query = select(ProctoringEvent).where(ProctoringEvent.attempt_id == attempt_id)
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    return {
        "items": list(
            await session.scalars(
                query.order_by(ProctoringEvent.created_at.desc(), ProctoringEvent.id)
                .limit(limit)
                .offset(offset)
            )
        ),
        "total": total,
        "limit": limit,
        "offset": offset,
        "trusted": False,
    }


async def monitoring(session, teacher_id, limit=20, offset=0):
    def latest(prefix):
        return (
            select(ProctoringEvent.kind)
            .where(ProctoringEvent.attempt_id == Attempt.id, ProctoringEvent.kind.like(prefix))
            .order_by(ProctoringEvent.created_at.desc(), ProctoringEvent.id.desc())
            .limit(1)
            .correlate(Attempt)
            .scalar_subquery()
        )

    query = (
        select(
            Attempt.id.label("attempt_id"),
            Attempt.student_id,
            Lesson.title,
            func.coalesce(
                func.nullif(func.trim(func.concat_ws(" ", User.last_name, User.first_name)), ""),
                User.username,
            ).label("student_name"),
            latest("tab.%").label("visibility"),
            latest("window.%").label("focus"),
            select(func.max(ProctoringEvent.created_at))
            .where(ProctoringEvent.attempt_id == Attempt.id)
            .correlate(Attempt)
            .scalar_subquery()
            .label("last_seen"),
            select(func.count())
            .select_from(ProctoringEvent)
            .where(ProctoringEvent.attempt_id == Attempt.id, ProctoringEvent.kind == "tab.hidden")
            .correlate(Attempt)
            .scalar_subquery()
            .label("hidden_count"),
        )
        .select_from(Attempt)
        .join(Assignment, Assignment.id == Attempt.assignment_id)
        .join(Lesson, Lesson.id == Assignment.lesson_id)
        .join(User, User.id == Attempt.student_id)
        .where(Lesson.teacher_id == teacher_id, Attempt.status == "in_progress")
    )
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    items = (
        (
            await session.execute(
                query.order_by(Attempt.started_at.desc(), Attempt.id).limit(limit).offset(offset)
            )
        )
        .mappings()
        .all()
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}
