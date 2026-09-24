from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GroupMembership, TrainingGroup, User, UserActivity
from app.schemas.group import GroupCreate


async def owned_group(
    session: AsyncSession,
    group_id: UUID,
    teacher_id: UUID,
    *,
    lock: bool = False,
    active: bool = False,
) -> TrainingGroup:
    query = select(TrainingGroup).where(
        TrainingGroup.id == group_id, TrainingGroup.teacher_id == teacher_id
    )
    if lock:
        query = query.with_for_update()
    group = await session.scalar(query)
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    if active and group.disbanded_at is not None:
        raise HTTPException(409, "Group is disbanded")
    return group


async def add_student(
    session: AsyncSession, group_id: UUID, student_id: UUID, teacher_id: UUID
) -> GroupMembership:
    # Launching a lesson takes the same group lock, giving membership snapshots a clear boundary.
    await owned_group(session, group_id, teacher_id, lock=True, active=True)
    user = await session.get(User, student_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Student not found")
    if not user.is_active or user.is_admin or user.is_teacher:
        raise HTTPException(status_code=409, detail="Group members must be active student accounts")
    await session.execute(
        insert(GroupMembership)
        .values(group_id=group_id, user_id=student_id)
        .on_conflict_do_nothing(index_elements=["group_id", "user_id"])
    )
    await session.commit()
    return await session.get(GroupMembership, (group_id, student_id))


async def disband_group(session: AsyncSession, group_id: UUID, teacher_id: UUID) -> TrainingGroup:
    # Same lock as enrollment, transfer and lesson launch: no half-disbanded membership snapshot.
    group = await owned_group(session, group_id, teacher_id, lock=True)
    if group.disbanded_at is None:
        members = list(
            await session.scalars(
                select(GroupMembership.user_id).where(GroupMembership.group_id == group_id)
            )
        )
        await session.execute(delete(GroupMembership).where(GroupMembership.group_id == group_id))
        group.disbanded_at = datetime.now(UTC)
        session.add_all(
            [
                UserActivity(
                    user_id=student_id,
                    actor_id=teacher_id,
                    kind="group.disbanded",
                    details={"group_id": str(group_id), "group_name": group.name},
                )
                for student_id in members
            ]
        )
        await session.commit()
    return group


async def create_group(
    session: AsyncSession, teacher_id: UUID, payload: GroupCreate
) -> TrainingGroup:
    group = TrainingGroup(name=payload.name, teacher_id=teacher_id)
    session.add(group)
    await session.commit()
    await session.refresh(group)
    return group
