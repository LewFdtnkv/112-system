from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Assignment, Attempt, Lesson, LessonEvaluation, ScenarioCard
from app.models.enums import AttemptStatus, LessonStatus
from app.schemas.lesson_evaluation import AssignmentReview, LessonGradeCreate, LessonWorkReview
from app.services.student import attempt_read


async def review_rows(
    session: AsyncSession,
    lesson_id: UUID,
    student_id: UUID,
    teacher_id: UUID,
    *,
    lock: bool = False,
):
    query = select(Lesson).where(Lesson.id == lesson_id, Lesson.teacher_id == teacher_id)
    if lock:
        query = query.with_for_update()
    lesson = await session.scalar(query)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    rows = (
        await session.execute(
            select(Assignment, Attempt)
            .outerjoin(
                Attempt,
                (Attempt.assignment_id == Assignment.id) & (Attempt.number == 1),
            )
            .where(Assignment.lesson_id == lesson_id, Assignment.student_id == student_id)
            .order_by(Assignment.position)
        )
    ).all()
    if not rows:
        raise HTTPException(status_code=404, detail="Student has no assignments in this lesson")
    return lesson, rows


async def review_work(session: AsyncSession, lesson_id: UUID, student_id: UUID, teacher_id: UUID):
    _, rows = await review_rows(session, lesson_id, student_id, teacher_id)
    assignments = []
    for assignment, attempt in rows:
        source = (
            await session.get(ScenarioCard, assignment.scenario_card_id)
            if assignment.scenario_card_id
            else None
        )
        assignments.append(
            AssignmentReview(
                assignment_id=assignment.id,
                position=assignment.position,
                source_snapshot=source.snapshot if source else None,
                attempt=await attempt_read(session, attempt) if attempt else None,
            )
        )
    evaluations = list(
        await session.scalars(
            select(LessonEvaluation)
            .where(
                LessonEvaluation.lesson_id == lesson_id,
                LessonEvaluation.student_id == student_id,
            )
            .order_by(LessonEvaluation.revision)
        )
    )
    return LessonWorkReview(
        lesson_id=lesson_id,
        student_id=student_id,
        submitted=all(attempt and attempt.status == AttemptStatus.COMPLETED for _, attempt in rows),
        assignments=assignments,
        evaluations=evaluations,
    )


async def grade_lesson(
    session: AsyncSession,
    lesson_id: UUID,
    student_id: UUID,
    teacher_id: UUID,
    payload: LessonGradeCreate,
):
    lesson, rows = await review_rows(session, lesson_id, student_id, teacher_id, lock=True)
    query = select(LessonEvaluation).where(
        LessonEvaluation.lesson_id == lesson_id, LessonEvaluation.student_id == student_id
    )
    existing = await session.scalar(query.where(LessonEvaluation.request_id == payload.request_id))
    if existing is not None:
        if (
            existing.score != payload.score
            or existing.max_score != payload.max_score
            or existing.comment != payload.comment
            or existing.revision != payload.expected_revision + 1
        ):
            raise HTTPException(
                status_code=409, detail="Request ID was already used with different parameters"
            )
        return existing, False
    if lesson.status == LessonStatus.CANCELLED or any(
        attempt is None or attempt.status != AttemptStatus.COMPLETED for _, attempt in rows
    ):
        raise HTTPException(
            status_code=409, detail="The student must submit every card before grading"
        )
    latest = await session.scalar(query.order_by(LessonEvaluation.revision.desc()).limit(1))
    if payload.expected_revision != (latest.revision if latest else 0):
        raise HTTPException(
            status_code=409, detail="Evaluation revision is stale; reload the result"
        )
    evaluation = LessonEvaluation(
        lesson_id=lesson_id,
        student_id=student_id,
        reviewer_id=teacher_id,
        request_id=payload.request_id,
        revision=payload.expected_revision + 1,
        supersedes_id=latest.id if latest else None,
        score=payload.score,
        max_score=payload.max_score,
        comment=payload.comment,
    )
    session.add(evaluation)
    await session.commit()
    return evaluation, True
