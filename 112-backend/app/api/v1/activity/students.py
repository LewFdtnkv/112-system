from uuid import UUID

from fastapi import APIRouter

from app.api.dependencies import SessionDep, StudentDep, TeacherDep
from app.api.pagination import Limit, Offset
from app.schemas.student_overview import StudentOverview
from app.schemas.user import UserRead
from app.services.activity import owned_student
from app.services.student_overview import student_overview
from app.services.views import lesson_page

router = APIRouter(tags=["activity"])


@router.get("/student/overview", response_model=StudentOverview)
async def my_overview(
    session: SessionDep,
    student: StudentDep,
    active_offset: Offset = 0,
    available_offset: Offset = 0,
):
    return await student_overview(
        session, student, active_offset=active_offset, available_offset=available_offset
    )


@router.get("/teaching/students/{student_id}/overview", response_model=StudentOverview)
async def teaching_overview(
    student_id: UUID,
    session: SessionDep,
    teacher: TeacherDep,
    active_offset: Offset = 0,
    available_offset: Offset = 0,
):
    user = await owned_student(session, student_id, teacher.id)
    return await student_overview(
        session,
        user,
        teacher_id=teacher.id,
        active_offset=active_offset,
        available_offset=available_offset,
    )


@router.get("/teaching/students/{student_id}")
async def student_profile(
    student_id: UUID,
    session: SessionDep,
    teacher: TeacherDep,
    limit: Limit = 20,
    offset: Offset = 0,
):
    user = await owned_student(session, student_id, teacher.id)
    return {
        "user": UserRead.model_validate(user),
        "lessons": await lesson_page(
            session, teacher_id=teacher.id, student_id=student_id, limit=limit, offset=offset
        ),
    }
