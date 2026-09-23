"""DDS arrivals run under the lesson lock, independently of browser navigation or LLM work."""

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select

from app.models import Assignment, Attempt, LessonExecution, ScenarioVersion
from app.services.audit import append_event

DELIVERY = "dds-stream-v1"


async def execution_for(session, lesson_id, student_id):
    return await session.get(LessonExecution, (lesson_id, student_id))


async def begin(session, lesson, student_id):
    execution = await execution_for(session, lesson.id, student_id)
    if execution is None:
        raise HTTPException(409, "This lesson does not use scheduled DDS arrivals")
    if execution.started_at is not None:
        return execution
    if lesson.status != "active":
        raise HTTPException(409, "Lesson is not active")
    rows = list(
        await session.scalars(
            select(Assignment).where(
                Assignment.lesson_id == lesson.id, Assignment.student_id == student_id
            )
        )
    )
    now = datetime.now(UTC)
    last = max(a.settings["arrival_offset_seconds"] for a in rows)
    if lesson.available_until and now + timedelta(seconds=last) >= lesson.available_until:
        raise HTTPException(
            409,
            "До окончания занятия недостаточно времени для поступления всех карточек. "
            "Обратитесь к преподавателю.",
        )
    execution.started_at = now
    for assignment in rows:
        assignment.scheduled_at = now + timedelta(
            seconds=assignment.settings["arrival_offset_seconds"]
        )
    await session.flush()
    await release_due(session, lesson, now)
    return execution


async def release_due(session, lesson, now):
    from app.services.student import create_attempt

    rows = list(
        await session.scalars(
            select(Assignment)
            .where(
                Assignment.lesson_id == lesson.id,
                Assignment.scheduled_at <= now,
                Assignment.released_at.is_(None),
            )
            .order_by(Assignment.student_id, Assignment.position)
        )
    )
    for assignment in rows:
        if lesson.available_until and assignment.scheduled_at >= lesson.available_until:
            continue
        # Measure reaction from server delivery, not from a delayed scheduler's planned time.
        received_at = min(now, lesson.available_until) if lesson.available_until else now
        scenario = await session.get(ScenarioVersion, assignment.scenario_version_id)
        await create_attempt(session, assignment, scenario, assignment.student_id, received_at)
        assignment.released_at = received_at
    await session.flush()
    return bool(rows)


async def open_assignment(session, lesson, assignment, student_id):
    from app.services.student import attempt_read

    execution = await execution_for(session, lesson.id, student_id)
    created = execution.started_at is None
    if created:
        if assignment.position != 1:
            raise HTTPException(409, "Сначала начните занятие")
        await begin(session, lesson, student_id)
    attempt = await session.scalar(select(Attempt).where(Attempt.assignment_id == assignment.id))
    if attempt is None:
        raise HTTPException(409, "Карточка ещё не поступила")
    if execution.active_attempt_id != attempt.id:
        previous = execution.active_attempt_id
        execution.active_attempt_id = attempt.id
        attempt.first_opened_at = attempt.first_opened_at or datetime.now(UTC)
        await append_event(
            session,
            attempt.id,
            "dds.card_opened",
            {
                "previous_attempt_id": str(previous) if previous else None,
            },
            actor_id=student_id,
            actor="student",
        )
    await session.commit()
    return await attempt_read(session, attempt), created
