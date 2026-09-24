from uuid import UUID

from fastapi import APIRouter

from app.api.dependencies import SessionDep, StudentDep, TeacherDep
from app.api.pagination import Limit, Offset
from app.schemas.activity import ProctoringBatch
from app.services import proctoring as proctoring_service

router = APIRouter(tags=["activity"])


@router.post("/student/attempts/{attempt_id}/proctoring")
async def proctoring(
    attempt_id: UUID, payload: ProctoringBatch, session: SessionDep, student: StudentDep
):
    return await proctoring_service.observe(session, attempt_id, student.id, payload)


@router.get("/teaching/attempts/{attempt_id}/proctoring")
async def proctoring_history(
    attempt_id: UUID,
    session: SessionDep,
    teacher: TeacherDep,
    limit: Limit = 20,
    offset: Offset = 0,
):
    return await proctoring_service.history(session, attempt_id, teacher.id, limit, offset)


@router.get("/teaching/monitoring")
async def monitoring(
    session: SessionDep, teacher: TeacherDep, limit: Limit = 20, offset: Offset = 0
):
    return await proctoring_service.monitoring(session, teacher.id, limit, offset)
