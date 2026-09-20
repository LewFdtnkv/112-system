from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.dialects.postgresql import insert

from app.models import (
    Assignment,
    GroupMembership,
    Lesson,
    MessageRecipient,
    TeachingMessage,
    TrainingGroup,
    User,
    UserActivity,
)
from app.services.groups import owned_group


async def owned_student(session, student_id: UUID, teacher_id: UUID):
    in_group = (
        select(GroupMembership.user_id)
        .join(TrainingGroup)
        .where(TrainingGroup.teacher_id == teacher_id, GroupMembership.user_id == student_id)
        .exists()
    )
    assigned = (
        select(Assignment.id)
        .join(Lesson)
        .where(Lesson.teacher_id == teacher_id, Assignment.student_id == student_id)
        .exists()
    )
    user = await session.scalar(select(User).where(User.id == student_id, or_(in_group, assigned)))
    if user is None:
        raise HTTPException(404, "Student not found")
    return user


async def change_membership(session, teacher_id, group_id, student_id, target_id=None):
    if target_id == group_id:
        raise HTTPException(422, "Choose another group")
    for identifier in sorted({group_id, *([target_id] if target_id else [])}):
        await owned_group(session, identifier, teacher_id, lock=True)
    membership = await session.get(GroupMembership, (group_id, student_id))
    if membership is None:
        raise HTTPException(404, "Student is not a member of this group")
    if target_id:
        user = await session.get(User, student_id)
        if not user.is_active or user.role != "student":
            raise HTTPException(409, "Group members must be active students")
        await session.execute(
            insert(GroupMembership)
            .values(group_id=target_id, user_id=student_id)
            .on_conflict_do_nothing()
        )
    await session.execute(
        delete(GroupMembership).where(
            GroupMembership.group_id == group_id, GroupMembership.user_id == student_id
        )
    )
    session.add(
        UserActivity(
            user_id=student_id,
            actor_id=teacher_id,
            kind="group.transferred" if target_id else "group.removed",
            details={"from": str(group_id), "to": str(target_id) if target_id else None},
        )
    )
    await session.commit()


async def send_message(session, teacher_id, payload):
    if payload.group_id:
        await owned_group(session, payload.group_id, teacher_id, lock=True)
        recipients = list(
            await session.scalars(
                select(GroupMembership.user_id).where(GroupMembership.group_id == payload.group_id)
            )
        )
    else:
        await owned_student(session, payload.student_id, teacher_id)
        recipients = [payload.student_id]
    if not recipients:
        raise HTTPException(409, "The group has no students")
    message = TeachingMessage(teacher_id=teacher_id, group_id=payload.group_id, text=payload.text)
    session.add(message)
    await session.flush()
    session.add_all([MessageRecipient(message_id=message.id, student_id=s) for s in recipients])
    await session.commit()
    return {"id": message.id, "recipient_count": len(recipients)}
