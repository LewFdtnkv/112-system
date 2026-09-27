"""DDS arrivals run under the lesson lock, independently of browser navigation or LLM work."""

from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select

from app.models import Assignment, Attempt, ScenarioVersion
from app.services.audit import append_event
from app.services.lesson_presence import begin, execution_for
from app.services.student.creation import create_attempt
from app.services.student.reads import attempt_read

DELIVERY = "dds-stream-v1"


async def release_due(session, lesson, now, *, executions=None):
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
    released = False
    known_executions = {e.student_id: e for e in executions} if executions is not None else {}
    scenarios = {}
    for assignment in rows:
        if assignment.student_id not in known_executions:
            known_executions[assignment.student_id] = await execution_for(
                session, lesson.id, assignment.student_id
            )
        execution = known_executions[assignment.student_id]
        if execution and (
            execution.ended_at or (execution.paused_at and not lesson.time_limit_seconds)
        ):
            continue
        if lesson.available_until and assignment.scheduled_at >= lesson.available_until:
            continue
        # Measure reaction from server delivery, not from a delayed scheduler's planned time.
        received_at = min(now, lesson.available_until) if lesson.available_until else now
        if assignment.scenario_version_id not in scenarios:
            scenarios[assignment.scenario_version_id] = await session.get(
                ScenarioVersion, assignment.scenario_version_id
            )
        scenario = scenarios[assignment.scenario_version_id]
        await create_attempt(session, assignment, scenario, assignment.student_id, received_at)
        assignment.released_at = received_at
        released = True
    await session.flush()
    return released


async def open_assignment(session, lesson, assignment, student_id):
    execution = await execution_for(session, lesson.id, student_id)
    created = execution is None or execution.started_at is None
    if created:
        if assignment.position != 1:
            raise HTTPException(409, "Сначала начните занятие")
        execution = await begin(session, lesson, student_id)
        await release_due(session, lesson, datetime.now(UTC))
    if execution.ended_at or execution.paused_at or lesson.status != "active":
        raise HTTPException(409, "Сначала возобновите доступное занятие")
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
