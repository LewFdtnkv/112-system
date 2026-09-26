from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import func, select

from app.models import (
    GroupMembership,
    MessageRecipient,
    TeachingMessage,
    TrainingGroup,
    User,
)
from app.services.activity import owned_student
from app.services.groups import owned_group
from app.services.learning_recommendations.jobs import available_lessons


async def send_message(session, teacher_id, payload):
    if payload.group_id:
        await owned_group(session, payload.group_id, teacher_id, lock=True, active=True)
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


async def unread_summary(session, student_id):
    count = await session.scalar(
        select(func.count())
        .select_from(MessageRecipient)
        .where(MessageRecipient.student_id == student_id, MessageRecipient.read_at.is_(None))
    )
    return {"unread_count": count}


async def list_messages(
    session, student_id, limit=20, offset=0, include_advice=True, unread_only=False
):
    query = (
        select(
            TeachingMessage.id,
            TeachingMessage.text,
            TeachingMessage.source,
            TeachingMessage.details,
            TeachingMessage.created_at,
            MessageRecipient.read_at,
            TrainingGroup.name.label("group_name"),
            func.concat_ws(" ", User.last_name, User.first_name).label("teacher_name"),
        )
        .select_from(TeachingMessage)
        .join(MessageRecipient, MessageRecipient.message_id == TeachingMessage.id)
        .outerjoin(User, User.id == TeachingMessage.teacher_id)
        .outerjoin(TrainingGroup, TrainingGroup.id == TeachingMessage.group_id)
        .where(MessageRecipient.student_id == student_id)
    )
    if unread_only:
        query = query.where(MessageRecipient.read_at.is_(None))
    if not include_advice:
        query = query.where(TeachingMessage.source == "teacher")
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = (
        (
            await session.execute(
                query.order_by(TeachingMessage.created_at.desc(), TeachingMessage.id)
                .limit(limit)
                .offset(offset)
            )
        )
        .mappings()
        .all()
    )
    items = [dict(row) for row in rows]
    if include_advice:
        available = set()
        for role in {m["details"].get("role") for m in items if m["source"] == "learning_advice"}:
            available.update(
                str(lesson.id) for lesson in await available_lessons(session, student_id, role)
            )
        for item in items:
            if item["source"] == "learning_advice":
                item["details"] = item["details"] | {
                    "suggestions": [
                        s
                        if s.get("lesson_id") in available and not item["details"].get("obsolete")
                        else s | {"lesson_id": None, "lesson_title": None}
                        for s in item["details"].get("suggestions", [])
                    ]
                }
    return {"items": items, "total": total, "limit": limit, "offset": offset}


async def mark_read(session, message_id, student_id):
    recipient = await session.get(MessageRecipient, (message_id, student_id))
    if recipient is None:
        raise HTTPException(404, "Message not found")
    recipient.read_at = recipient.read_at or datetime.now(UTC)
    await session.commit()


async def record_feedback(session, message_id, student_id, helpful):
    row = await session.scalar(
        select(TeachingMessage)
        .join(MessageRecipient)
        .where(
            TeachingMessage.id == message_id,
            MessageRecipient.student_id == student_id,
            TeachingMessage.source == "learning_advice",
        )
        .with_for_update(of=TeachingMessage)
    )
    if row is None:
        raise HTTPException(404, "Recommendation not found")
    row.details = row.details | {"feedback": "helpful" if helpful else "not_helpful"}
    await session.commit()
