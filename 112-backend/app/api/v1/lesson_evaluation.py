from uuid import UUID

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.api.dependencies import SessionDep, StudentDep, TeacherDep
from app.models import LessonEvaluation
from app.schemas.lesson_evaluation import LessonGradeCreate, LessonGradeRead, LessonWorkReview
from app.services.lesson_evaluation import grade_lesson, review_work
from app.services.student import student_lesson

router = APIRouter(tags=["lesson assessment"])


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
