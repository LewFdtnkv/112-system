from uuid import UUID

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.api.dependencies import SessionDep, StudentDep, TeacherDep
from app.api.pagination import EventSequence, Limit
from app.models import LessonEvaluation
from app.schemas.audit import AuditPage
from app.schemas.lesson_evaluation import LessonGradeCreate, LessonGradeRead, LessonWorkReview
from app.services.attempt_audit import assessment_context, audit_page, teacher_attempt
from app.services.lesson_evaluation import ensure_automatic_grade, grade_lesson, review_work
from app.services.student.access import student_lesson

router = APIRouter(tags=["lesson assessment"])


@router.post("/lessons/{lesson_id}/students/{student_id}/attempts/{attempt_id}/semantic-retry")
async def retry_semantic(
    lesson_id: UUID, student_id: UUID, attempt_id: UUID, session: SessionDep, teacher: TeacherDep
):
    from app.services.semantic_assessment.jobs import retry

    attempt = await teacher_attempt(session, lesson_id, student_id, attempt_id, teacher.id)
    return await retry(session, attempt)


@router.post(
    "/lessons/{lesson_id}/students/{student_id}/automatic-evaluation",
    response_model=LessonGradeRead | None,
)
async def automatic(lesson_id: UUID, student_id: UUID, session: SessionDep, teacher: TeacherDep):
    return await ensure_automatic_grade(session, lesson_id, student_id, teacher.id)


@router.get(
    "/lessons/{lesson_id}/students/{student_id}/attempts/{attempt_id}/events",
    response_model=AuditPage,
)
async def events(
    lesson_id: UUID,
    student_id: UUID,
    attempt_id: UUID,
    session: SessionDep,
    teacher: TeacherDep,
    after: EventSequence = 0,
    limit: Limit = 50,
    through: EventSequence | None = None,
):
    await teacher_attempt(session, lesson_id, student_id, attempt_id, teacher.id)
    return await audit_page(session, attempt_id, after, limit, through)


@router.get("/lessons/{lesson_id}/students/{student_id}/attempts/{attempt_id}/assessment-context")
async def context(
    lesson_id: UUID, student_id: UUID, attempt_id: UUID, session: SessionDep, teacher: TeacherDep
):
    attempt = await teacher_attempt(session, lesson_id, student_id, attempt_id, teacher.id)
    return await assessment_context(session, attempt)


@router.get("/lessons/{lesson_id}/students/{student_id}/work", response_model=LessonWorkReview)
async def review(lesson_id: UUID, student_id: UUID, session: SessionDep, teacher: TeacherDep):
    return await review_work(session, lesson_id, student_id, teacher.id)


@router.post(
    "/lessons/{lesson_id}/students/{student_id}/evaluations",
    response_model=LessonGradeRead,
    status_code=201,
)
async def grade(
    lesson_id: UUID,
    student_id: UUID,
    payload: LessonGradeCreate,
    session: SessionDep,
    teacher: TeacherDep,
    response: Response,
):
    result, created = await grade_lesson(session, lesson_id, student_id, teacher.id, payload)
    response.status_code = 201 if created else 200
    return result


@router.get("/student/lessons/{lesson_id}/evaluation", response_model=LessonGradeRead | None)
async def result(lesson_id: UUID, session: SessionDep, student: StudentDep):
    await student_lesson(session, lesson_id, student.id)
    return await session.scalar(
        select(LessonEvaluation)
        .where(
            LessonEvaluation.lesson_id == lesson_id,
            LessonEvaluation.student_id == student.id,
        )
        .order_by(LessonEvaluation.revision.desc())
        .limit(1)
    )
