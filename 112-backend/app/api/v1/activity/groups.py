from uuid import UUID

from fastapi import APIRouter

from app.api.dependencies import SessionDep, TeacherDep
from app.schemas.activity import TransferStudent
from app.services.activity import change_membership

router = APIRouter(tags=["activity"])


@router.delete("/groups/{group_id}/students/{student_id}", status_code=204)
async def remove_student(
    group_id: UUID, student_id: UUID, session: SessionDep, teacher: TeacherDep
):
    await change_membership(session, teacher.id, group_id, student_id)


@router.post("/groups/{group_id}/students/{student_id}/transfer", status_code=204)
async def transfer_student(
    group_id: UUID,
    student_id: UUID,
    payload: TransferStudent,
    session: SessionDep,
    teacher: TeacherDep,
):
    await change_membership(session, teacher.id, group_id, student_id, payload.target_group_id)
