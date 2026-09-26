"""Explicit entry/exit and bounded disconnect detection, under the lesson lock."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select

from app.models import Assignment, Attempt, LessonExecution
from app.services.audit import append_event

PRESENCE_TIMEOUT = timedelta(seconds=45)


async def execution_for(session, lesson_id, student_id):
    return await session.get(LessonExecution, (lesson_id, student_id))


async def attempts_for(session, lesson_id, student_id):
    return list(
        await session.scalars(
            select(Attempt)
            .join(Assignment)
            .where(
                Assignment.lesson_id == lesson_id,
                Assignment.student_id == student_id,
                Attempt.status == "in_progress",
            )
        )
    )


async def begin(session, lesson, student_id):
    execution = await execution_for(session, lesson.id, student_id)
    if execution is None:
        execution = LessonExecution(lesson_id=lesson.id, student_id=student_id)
        session.add(execution)
    if lesson.status != "active" or execution.ended_at:
        raise HTTPException(409, "Занятие недоступно или уже завершено")
    now = datetime.now(UTC)
    fresh = execution.started_at is None
    execution.started_at = execution.started_at or now
    if execution.paused_at and not lesson.time_limit_seconds:
        pause = now - execution.paused_at
        for attempt in await attempts_for(session, lesson.id, student_id):
            if attempt.pauses and attempt.pauses[-1]["end"] is None:
                attempt.pauses = attempt.pauses[:-1] + [
                    attempt.pauses[-1] | {"end": now.isoformat()}
                ]
                await append_event(session, attempt.id, "lesson.resumed", {})
        pending = await session.scalars(
            select(Assignment).where(
                Assignment.lesson_id == lesson.id,
                Assignment.student_id == student_id,
                Assignment.released_at.is_(None),
                Assignment.scheduled_at.is_not(None),
            )
        )
        for assignment in pending:
            assignment.scheduled_at += pause
    if fresh:
        rows = await session.scalars(
            select(Assignment).where(
                Assignment.lesson_id == lesson.id,
                Assignment.student_id == student_id,
            )
        )
        for assignment in rows:
            if assignment.settings.get("delivery") == "dds-stream-v1":
                assignment.scheduled_at = now + timedelta(
                    seconds=assignment.settings["arrival_offset_seconds"]
                )
    # Stable while present; a delayed exit from an earlier visit cannot pause a new visit.
    if not execution.session_id or execution.paused_at:
        execution.session_id = uuid4()
    execution.paused_at = None
    execution.last_seen_at = now
    await session.flush()
    return execution


async def leave(session, lesson, execution, now, *, reason="student_exit"):
    if not execution.started_at or execution.ended_at or execution.paused_at:
        return False
    execution.paused_at = now
    if not lesson.time_limit_seconds:
        for attempt in await attempts_for(session, lesson.id, execution.student_id):
            attempt.pauses = (attempt.pauses or []) + [{"start": now.isoformat(), "end": None}]
            await append_event(
                session, attempt.id, "lesson.paused", {"at": now.isoformat(), "reason": reason}
            )
    return True


async def presence(session, lesson, student_id, session_id, *, leaving=False):
    execution = await execution_for(session, lesson.id, student_id)
    if execution is None or not execution.session_id or execution.session_id != session_id:
        raise HTTPException(409, "Сеанс занятия изменился. Откройте занятие заново.")
    now = datetime.now(UTC)
    if leaving:
        await leave(session, lesson, execution, now)
    elif not execution.paused_at and not execution.ended_at:
        execution.last_seen_at = now
    await session.commit()


async def expire_presence(session, lesson, executions, now):
    changed = False
    for execution in executions:
        if execution.last_seen_at and now >= execution.last_seen_at + PRESENCE_TIMEOUT:
            changed = (
                await leave(
                    session,
                    lesson,
                    execution,
                    execution.last_seen_at + PRESENCE_TIMEOUT,
                    reason="connection_lost",
                )
                or changed
            )
    return changed
