from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Assignment,
    Attempt,
    Lesson,
)
from app.services.deadlines import enforce_deadlines


async def student_lesson(
    session: AsyncSession,
    lesson_id: UUID,
    student_id: UUID,
) -> Lesson:
    """Check enrollment and enforce delivery/deadlines under the lesson lock."""
    query = select(Lesson).where(
        Lesson.id == lesson_id,
        Lesson.id.in_(
            select(Assignment.lesson_id).where(Assignment.student_id == student_id),
        ),
    )
    query = query.with_for_update()
    lesson = await session.scalar(query.execution_options(populate_existing=True))
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")

    if await enforce_deadlines(session, lesson):
        await session.refresh(lesson, with_for_update=True)
    return lesson


async def owned_attempt(
    session: AsyncSession,
    attempt_id: UUID,
    student_id: UUID,
    *,
    lock: bool = False,
) -> tuple[Attempt, Lesson]:
    attempt = await session.scalar(
        select(Attempt).where(
            Attempt.id == attempt_id,
            Attempt.student_id == student_id,
        )
    )
    if attempt is None:
        raise HTTPException(status_code=404, detail="Attempt not found")
    assignment = await session.get(Assignment, attempt.assignment_id)
    lesson = await student_lesson(session, assignment.lesson_id, student_id)
    if lock:
        # The row may have changed while waiting for another command on this lesson.
        await session.refresh(attempt)
        from app.services.lesson_presence import execution_for

        execution = await execution_for(session, lesson.id, student_id)
        if (
            attempt.status == "in_progress"
            and execution
            and (execution.paused_at or execution.ended_at)
        ):
            raise HTTPException(
                409, "Занятие приостановлено или завершено. Вернитесь к списку занятий."
            )
    return attempt, lesson
