from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Assignment,
    Attempt,
    ScenarioVersion,
)
from app.models.enums import (
    AttemptStatus,
    LessonStatus,
)
from app.services.dds_delivery import open_assignment
from app.services.lesson_presence import begin, execution_for
from app.services.student.access import student_lesson
from app.services.student.creation import create_attempt
from app.services.student.reads import attempt_read


async def start_attempt(session: AsyncSession, assignment_id: UUID, student_id: UUID):
    assignment = await session.scalar(
        select(Assignment).where(
            Assignment.id == assignment_id,
            Assignment.student_id == student_id,
        )
    )
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    lesson = await student_lesson(session, assignment.lesson_id, student_id)
    if assignment.settings.get("delivery") == "dds-stream-v1":
        return await open_assignment(session, lesson, assignment, student_id)
    existing = await session.scalar(select(Attempt).where(Attempt.assignment_id == assignment.id))
    if existing is not None:
        return await attempt_read(session, existing), False
    if lesson.status != LessonStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="Lesson is not active")
    execution = await execution_for(session, lesson.id, student_id)
    if execution and (execution.ended_at or execution.paused_at):
        raise HTTPException(409, "Сначала возобновите доступное занятие")
    scenario = await session.get(ScenarioVersion, assignment.scenario_version_id)
    if assignment.scenario_card_id is None:
        raise HTTPException(status_code=409, detail="Only composed scenarios can be started")
    previous = await session.scalar(
        select(func.count())
        .select_from(Assignment)
        .where(
            Assignment.lesson_id == lesson.id,
            Assignment.student_id == student_id,
            Assignment.position < assignment.position,
            ~select(Attempt.id)
            .where(
                Attempt.assignment_id == Assignment.id,
                Attempt.status.in_([AttemptStatus.COMPLETED, AttemptStatus.INTERRUPTED]),
            )
            .exists(),
        )
    )
    if previous:
        raise HTTPException(status_code=409, detail="Complete the previous card first")
    if not execution or not execution.started_at:
        await begin(session, lesson, student_id)
    attempt = await create_attempt(session, assignment, scenario, student_id, datetime.now(UTC))
    await session.commit()
    return await attempt_read(session, attempt), True
