"""Server-owned deadlines; browser clocks are display-only."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models import Assignment, Attempt, Lesson
from app.models.enums import AttemptStatus, LessonStatus
from app.services.audit import append_event

TERMINAL = (AttemptStatus.COMPLETED, AttemptStatus.INTERRUPTED)


def attempt_deadline(attempt, lesson):
    limits = [lesson.available_until] if lesson.available_until else []
    seconds = attempt.settings_snapshot.get("time_limit_seconds")
    if seconds and attempt.settings_snapshot.get("deadline_policy") == "bpmn-v1":
        limits.append(attempt.started_at + timedelta(seconds=seconds))
    return min(limits) if limits else None


async def enforce_deadlines(session, lesson, now=None):
    """Caller locks the lesson. Persists expiry before a rejected mutation can roll back."""
    from app.services.automatic_assessment import assess_submission, publish_lesson_result
    from app.services.student import attempt_read

    now = now or datetime.now(UTC)
    if lesson.status not in (LessonStatus.ACTIVE, LessonStatus.PLANNED):
        return False
    changed = False
    if (
        lesson.status == LessonStatus.PLANNED
        and lesson.available_from is not None
        and lesson.available_from <= now
    ):
        lesson.status = LessonStatus.ACTIVE
        lesson.started_at = lesson.available_from
        changed = True
    expired = lesson.available_until is not None and now >= lesson.available_until
    attempts = list(
        await session.scalars(
            select(Attempt)
            .join(Assignment, Assignment.id == Attempt.assignment_id)
            .where(Assignment.lesson_id == lesson.id)
            .order_by(Attempt.id)
        )
    )
    for attempt in attempts:
        deadline = attempt_deadline(attempt, lesson)
        if attempt.status == AttemptStatus.IN_PROGRESS and deadline and now >= deadline:
            attempt.status = AttemptStatus.INTERRUPTED
            attempt.ended_at = deadline
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
    assignments = list(
        await session.scalars(select(Assignment).where(Assignment.lesson_id == lesson.id))
    )
    if expired or (
        assignments
        and len(attempts) == len(assignments)
        and all(a.status in TERMINAL for a in attempts)
    ):
        lesson.status = LessonStatus.FINISHED
        lesson.started_at = lesson.started_at or lesson.available_from or now
        lesson.ended_at = lesson.available_until if expired else now
        changed = True
    if changed:
        await session.flush()
        for student_id in {a.student_id for a in assignments}:
            await publish_lesson_result(session, lesson, student_id)
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
