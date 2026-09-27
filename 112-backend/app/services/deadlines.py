"""Server-owned deadlines; browser clocks are display-only."""

import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import func, select

from app.models import Assignment, Attempt, Lesson, LessonExecution
from app.models.enums import AttemptStatus, LessonStatus
from app.services.audit import append_event
from app.services.automatic_assessment.results import publish_lesson_result
from app.services.automatic_assessment.submission import assess_submission
from app.services.dds_delivery import release_due
from app.services.student.reads import attempt_read

TERMINAL = (AttemptStatus.COMPLETED, AttemptStatus.INTERRUPTED)


async def enforce_deadlines(session, lesson, now=None):
    """Caller locks the lesson. Each student's deadline closes only their work."""
    from app.services.lesson_clock import execution_deadline
    from app.services.lesson_presence import expire_presence

    now = now or datetime.now(UTC)
    if lesson.status not in (LessonStatus.ACTIVE, LessonStatus.PLANNED):
        return False
    changed = False
    if (
        lesson.status == LessonStatus.PLANNED
        and lesson.available_from
        and lesson.available_from <= now
    ):
        lesson.status = LessonStatus.ACTIVE
        lesson.started_at = lesson.available_from
        changed = True
    executions = list(
        await session.scalars(
            select(LessonExecution).where(
                LessonExecution.lesson_id == lesson.id,
            )
        )
    )
    changed = await expire_presence(session, lesson, executions, now) or changed
    # Expire before delivery: no new cards may arrive after a personal deadline.
    for execution in executions:
        deadline = execution_deadline(lesson, execution)
        if not execution.ended_at and deadline and now >= deadline:
            execution.ended_at = deadline
            changed = True
    if lesson.status == LessonStatus.ACTIVE:
        changed = await release_due(session, lesson, now, executions=executions) or changed
    by_student = {e.student_id: e for e in executions}
    expired = lesson.available_until is not None and now >= lesson.available_until
    due_students = [
        e.student_id
        for e in executions
        if (deadline := execution_deadline(lesson, e)) is not None and now >= deadline
    ]
    # Hydrate full attempts (including large snapshots) only when they need closing.
    attempts = (
        list(
            await session.scalars(
                select(Attempt)
                .join(Assignment)
                .where(
                    Assignment.lesson_id == lesson.id,
                    Attempt.status == AttemptStatus.IN_PROGRESS,
                    True if expired else Attempt.student_id.in_(due_students),
                )
                .order_by(Attempt.id)
            )
        )
        if expired or due_students
        else []
    )
    for attempt in attempts:
        execution = by_student.get(attempt.student_id)
        deadline = execution_deadline(lesson, execution)
        if attempt.status == AttemptStatus.IN_PROGRESS and deadline and now >= deadline:
            attempt.status = AttemptStatus.INTERRUPTED
            attempt.ended_at = max(attempt.started_at, deadline)
            attempt.end_reason = "deadline_expired"
            await append_event(
                session, attempt.id, "attempt.deadline_expired", {"deadline": deadline.isoformat()}
            )
            await session.flush()
            await assess_submission(
                session,
                attempt,
                lesson,
                await attempt_read(session, attempt, preview=False),
                publish=False,
            )
            changed = True
    # One bounded row per student instead of ORM instances for every card, followed by
    # repeated Python scans of the whole lesson for every execution.
    await session.flush()
    progress = (
        await session.execute(
            select(
                Assignment.student_id,
                func.count(func.distinct(Assignment.id)).label("cards"),
                func.count(Attempt.id).label("attempts"),
                func.count(Attempt.id).filter(Attempt.status.in_(TERMINAL)).label("terminal"),
                func.max(Attempt.ended_at).label("ended_at"),
            )
            .outerjoin(Attempt, Attempt.assignment_id == Assignment.id)
            .where(Assignment.lesson_id == lesson.id)
            .group_by(Assignment.student_id)
        )
    ).all()
    progress_by_student = {p.student_id: p for p in progress}
    for execution in executions:
        student = progress_by_student.get(execution.student_id)
        if (
            not execution.ended_at
            and student
            and student.cards == student.attempts == student.terminal
        ):
            execution.ended_at = student.ended_at
            changed = True
    if (
        expired
        or (executions and all(e.ended_at for e in executions))
        or (progress and all(p.cards == p.attempts == p.terminal for p in progress))
    ):
        lesson.status = LessonStatus.FINISHED
        lesson.started_at = lesson.started_at or lesson.available_from or now
        lesson.ended_at = lesson.available_until if expired else now
        changed = True
    if changed:
        await session.flush()
        for student in progress:
            execution = by_student.get(student.student_id)
            if (
                lesson.status == LessonStatus.FINISHED
                or (execution and execution.ended_at)
                or student.cards == student.attempts == student.terminal
            ):
                await publish_lesson_result(session, lesson, student.student_id)
        await session.commit()
    return changed


async def sweep_deadlines(session):
    # SKIP LOCKED allows multiple API workers without duplicate completion or grading.
    ids = list(
        await session.scalars(
            select(Lesson.id)
            .where(Lesson.status.in_([LessonStatus.ACTIVE, LessonStatus.PLANNED]))
            .order_by(Lesson.id)
        )
    )
    for lesson_id in ids:
        lesson = await session.scalar(
            select(Lesson).where(Lesson.id == lesson_id).with_for_update(skip_locked=True)
        )
        if lesson:
            await enforce_deadlines(session, lesson)
        await session.commit()


async def deadline_worker(session_factory):
    while True:
        try:
            async with session_factory() as session:
                await sweep_deadlines(session)
        except Exception:
            logging.getLogger(__name__).exception("Deadline sweep failed")
        await asyncio.sleep(5)
