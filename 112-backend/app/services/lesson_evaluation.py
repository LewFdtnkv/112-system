from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Assignment, Attempt, ClassifierEntry, Lesson, LessonEvaluation, ScenarioCard
from app.models.enums import AttemptStatus, EventActor, LessonStatus
from app.schemas.catalog import ClassifierEntryRead
from app.schemas.lesson_evaluation import AssignmentReview, LessonGradeCreate, LessonWorkReview
from app.services.audit import append_event
from app.services.automatic_assessment import publish_lesson_result
from app.services.dds_assessment import check_dds
from app.services.field_evaluation import check_fields, summarize
from app.services.student import review_attempts


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
    lesson, rows = await review_rows(session, lesson_id, student_id, teacher_id)
    assignments = []
    sources = {
        source.id: source
        for source in await session.scalars(
            select(ScenarioCard).where(
                ScenarioCard.id.in_([a.scenario_card_id for a, _ in rows if a.scenario_card_id])
            )
        )
    }
    entries = {
        str(entry.id): entry
        for entry in await session.scalars(
            select(ClassifierEntry).where(
                ClassifierEntry.id.in_(
                    [
                        UUID(source.snapshot["classifier_entry_id"])
                        for source in sources.values()
                        if source.snapshot.get("classifier_entry_id")
                    ]
                )
            )
        )
    }
    attempts = await review_attempts(session, [attempt for _, attempt in rows if attempt])
    for assignment, attempt in rows:
        source = sources.get(assignment.scenario_card_id) if assignment.scenario_card_id else None
        attempt_read = attempts.get(attempt.id) if attempt else None
        entry = entries.get(source.snapshot.get("classifier_entry_id")) if source else None
        assignments.append(
            AssignmentReview(
                assignment_id=assignment.id,
                position=assignment.position,
                source_snapshot=source.snapshot if source else None,
                source_classifier_entry=ClassifierEntryRead.model_validate(
                    entries[source.snapshot["classifier_entry_id"]]
                )
                if source and source.snapshot.get("classifier_entry_id") in entries
                else None,
                attempt=attempts.get(attempt.id) if attempt else None,
                automatic_check=(
                    check_dds(attempt.settings_snapshot["dds_policy"], attempt_read)
                    if attempt_read and attempt_read.role == "dds"
                    else check_fields(
                        source.snapshot,
                        attempt_read,
                        f"{entry.code} — {entry.name}" if entry else "",
                    )
                    if source and attempt_read
                    else None
                ),
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
        submitted=lesson.status == LessonStatus.FINISHED
        or all(
            attempt and attempt.status in (AttemptStatus.COMPLETED, AttemptStatus.INTERRUPTED)
            for _, attempt in rows
        ),
        assignments=assignments,
        evaluations=evaluations,
        automatic_check=summarize(
            [
                field
                for assignment in assignments
                if assignment.automatic_check
                for field in assignment.automatic_check.fields
            ]
        ),
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
    if lesson.status == LessonStatus.CANCELLED or (
        lesson.status != LessonStatus.FINISHED
        and any(
            attempt is None
            or attempt.status not in (AttemptStatus.COMPLETED, AttemptStatus.INTERRUPTED)
            for _, attempt in rows
        )
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
    await session.flush()
    for _, attempt in rows:
        if attempt is None:
            continue
        await append_event(
            session,
            attempt.id,
            "assessment.teacher_reviewed",
            {
                "lesson_evaluation_id": str(evaluation.id),
                "revision": evaluation.revision,
                "score": str(evaluation.score),
                "max_score": str(evaluation.max_score),
                "comment": evaluation.comment,
            },
            actor=EventActor.TEACHER,
            actor_id=teacher_id,
        )
    await session.commit()
    return evaluation, True


async def ensure_automatic_grade(session, lesson_id, student_id, teacher_id):
    lesson, rows = await review_rows(session, lesson_id, student_id, teacher_id, lock=True)
    if lesson.status == LessonStatus.CANCELLED or (
        lesson.status != LessonStatus.FINISHED
        and any(
            a is None or a.status not in (AttemptStatus.COMPLETED, AttemptStatus.INTERRUPTED)
            for _, a in rows
        )
    ):
        raise HTTPException(
            status_code=409, detail="The student must submit every card before grading"
        )
    await publish_lesson_result(session, lesson, student_id)
    await session.commit()
    return await session.scalar(
        select(LessonEvaluation)
        .where(LessonEvaluation.lesson_id == lesson_id, LessonEvaluation.student_id == student_id)
        .order_by(LessonEvaluation.revision.desc())
        .limit(1)
    )
