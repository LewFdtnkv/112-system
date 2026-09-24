from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.api.dependencies import SessionDep, TeacherDep
from app.api.pagination import Limit, Offset
from app.models import GroupMembership, TrainingGroup, User
from app.schemas.group import GroupCreate, GroupMemberRead, GroupRead
from app.schemas.user import UserRead
from app.services.groups import add_student, disband_group, owned_group
from app.services.groups import create_group as create_training_group

router = APIRouter(prefix="/groups", tags=["groups"])


@router.post("", response_model=GroupRead, status_code=201)
async def create_group(payload: GroupCreate, session: SessionDep, teacher: TeacherDep):
    return await create_training_group(session, teacher.id, payload)


@router.get("", response_model=list[GroupRead])
async def list_groups(
    session: SessionDep,
    teacher: TeacherDep,
    limit: Limit = 20,
    offset: Offset = 0,
):
    return list(
        await session.scalars(
            select(TrainingGroup)
            .where(TrainingGroup.teacher_id == teacher.id, TrainingGroup.disbanded_at.is_(None))
            .order_by(TrainingGroup.created_at, TrainingGroup.id)
            .limit(limit)
            .offset(offset)
        )
    )


@router.get("/{group_id}", response_model=GroupRead)
async def get_group(group_id: UUID, session: SessionDep, teacher: TeacherDep):
    return await owned_group(session, group_id, teacher.id)


@router.put("/{group_id}/students/{student_id}", response_model=GroupMemberRead)
async def put_student(group_id: UUID, student_id: UUID, session: SessionDep, teacher: TeacherDep):
    return await add_student(session, group_id, student_id, teacher.id)


@router.get("/{group_id}/students", response_model=list[UserRead])
async def list_students(
    group_id: UUID,
    session: SessionDep,
    teacher: TeacherDep,
    limit: Limit = 20,
    offset: Offset = 0,
):
    await owned_group(session, group_id, teacher.id)
    return list(
        await session.scalars(
            select(User)
            .join(GroupMembership, GroupMembership.user_id == User.id)
            .where(GroupMembership.group_id == group_id)
            .order_by(User.username, User.id)
            .limit(limit)
            .offset(offset)
        )
    )


@router.post("/{group_id}/disband", response_model=GroupRead)
async def disband(group_id: UUID, session: SessionDep, teacher: TeacherDep):
    return await disband_group(session, group_id, teacher.id)
