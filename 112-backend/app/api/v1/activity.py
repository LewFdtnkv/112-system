from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import Text, cast, func, select

from app.api.dependencies import AdminDep, SessionDep, StudentDep, TeacherDep
from app.api.v1.authoring import Limit, Offset
from app.models import (
    Assignment,
    Attempt,
    AttemptEvent,
    Lesson,
    MessageRecipient,
    ProctoringEvent,
    TeachingMessage,
    TrainingGroup,
    User,
    UserActivity,
)
from app.schemas.activity import MessageCreate, ProctoringBatch, TransferStudent
from app.schemas.student_overview import StudentOverview
from app.schemas.user import UserRead
from app.services.activity import change_membership, owned_student, send_message
from app.services.exports import export_rows
from app.services.student import owned_attempt
from app.services.student_overview import student_overview
from app.services.views import lesson_page, lesson_rows_query

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


@router.post("/messages", status_code=201)
async def message(payload: MessageCreate, session: SessionDep, teacher: TeacherDep):
    return await send_message(session, teacher.id, payload)


@router.get("/student/messages")
async def messages(
    session: SessionDep,
    student: StudentDep,
    limit: Limit = 20,
    offset: Offset = 0,
    include_advice: bool = True,
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
        .where(MessageRecipient.student_id == student.id)
    )
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
        from app.services.learning_recommendations.jobs import available_lessons

        available = set()
        for role in {m["details"].get("role") for m in items if m["source"] == "learning_advice"}:
            available.update(
                str(lesson.id) for lesson in await available_lessons(session, student.id, role)
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


@router.post("/student/messages/{message_id}/read", status_code=204)
async def read_message(message_id: UUID, session: SessionDep, student: StudentDep):
    recipient = await session.get(MessageRecipient, (message_id, student.id))
    if recipient is None:
        raise HTTPException(404, "Message not found")
    recipient.read_at = recipient.read_at or datetime.now(UTC)
    await session.commit()


@router.post("/student/messages/{message_id}/feedback", status_code=204)
async def recommendation_feedback(
    message_id: UUID, session: SessionDep, student: StudentDep, helpful: bool
):
    row = await session.scalar(
        select(TeachingMessage)
        .join(MessageRecipient)
        .where(
            TeachingMessage.id == message_id,
            MessageRecipient.student_id == student.id,
            TeachingMessage.source == "learning_advice",
        )
        .with_for_update(of=TeachingMessage)
    )
    if row is None:
        raise HTTPException(404, "Recommendation not found")
    row.details = row.details | {"feedback": "helpful" if helpful else "not_helpful"}
    await session.commit()


@router.get("/student/overview", response_model=StudentOverview)
async def my_overview(session: SessionDep, student: StudentDep, active_offset: Offset = 0):
    return await student_overview(session, student, active_offset=active_offset)


@router.get("/teaching/students/{student_id}/overview", response_model=StudentOverview)
async def teaching_overview(
    student_id: UUID, session: SessionDep, teacher: TeacherDep, active_offset: Offset = 0
):
    user = await owned_student(session, student_id, teacher.id)
    return await student_overview(session, user, teacher_id=teacher.id, active_offset=active_offset)


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


@router.get("/teaching/reports/export")
async def report(
    session: SessionDep,
    teacher: TeacherDep,
    format: Literal["txt", "xlsx"] = "xlsx",
    student_id: UUID | None = None,
    group_id: UUID | None = None,
):
    if student_id:
        await owned_student(session, student_id, teacher.id)
    query = lesson_rows_query(teacher_id=teacher.id, student_id=student_id)
    if group_id:
        from app.services.groups import owned_group

        await owned_group(session, group_id, teacher.id)
        query = query.where(Lesson.group_id == group_id)
    data = (
        (await session.execute(query.order_by(Lesson.created_at, Lesson.id).limit(10001)))
        .mappings()
        .all()
    )
    if len(data) > 10000:
        raise HTTPException(422, "Narrow the report to a group or student (maximum 10000 rows)")
    return export_rows(
        [
            "Ученик",
            "Задание",
            "Группа",
            "Выполнено карточек",
            "Всего карточек",
            "Балл",
            "Максимум",
            "Метод оценки",
        ],
        [
            [
                r["student_name"],
                r["title"],
                r["group_name"],
                r["completed_count"],
                r["card_count"],
                r["score"],
                r["max_score"],
                r["evaluation_method"],
            ]
            for r in data
        ],
        format,
        "training-report",
    )


def user_activity_query(user_id):
    # Teaching actions are exported separately from proctoring; no camera/focus data here.
    account = select(
        UserActivity.id,
        UserActivity.created_at.label("occurred_at"),
        UserActivity.kind,
        UserActivity.actor_id,
        UserActivity.reason,
    ).where(UserActivity.user_id == user_id)
    teaching = (
        select(
            AttemptEvent.id,
            AttemptEvent.occurred_at,
            AttemptEvent.kind,
            AttemptEvent.actor_id,
            cast(AttemptEvent.payload, Text).label("reason"),
        )
        .join(Attempt)
        .where(Attempt.student_id == user_id)
    )
    return account.union_all(teaching).subquery()


@router.get("/admin/users/{user_id}/activity")
async def user_activity(
    user_id: UUID, session: SessionDep, admin: AdminDep, limit: Limit = 20, offset: Offset = 0
):
    if await session.get(User, user_id) is None:
        raise HTTPException(404, "User not found")
    rows = user_activity_query(user_id)
    total = await session.scalar(select(func.count()).select_from(rows))
    items = (
        (
            await session.execute(
                select(rows)
                .order_by(rows.c.occurred_at.desc(), rows.c.id)
                .limit(limit)
                .offset(offset)
            )
        )
        .mappings()
        .all()
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/admin/users/{user_id}/activity/export")
async def export_activity(
    user_id: UUID, session: SessionDep, admin: AdminDep, format: Literal["txt", "xlsx"] = "txt"
):
    if await session.get(User, user_id) is None:
        raise HTTPException(404, "User not found")
    rows = user_activity_query(user_id)
    data = (
        (await session.execute(select(rows).order_by(rows.c.occurred_at, rows.c.id).limit(10001)))
        .mappings()
        .all()
    )
    if len(data) > 10000:
        raise HTTPException(422, "Export exceeds 10000 events")
    return export_rows(
        ["Время", "Событие", "Кто выполнил", "Причина / сведения"],
        [[r["occurred_at"], r["kind"], r["actor_id"], r["reason"]] for r in data],
        format,
        "user-activity",
    )


@router.post("/student/attempts/{attempt_id}/proctoring")
async def proctoring(
    attempt_id: UUID, payload: ProctoringBatch, session: SessionDep, student: StudentDep
):
    attempt, _ = await owned_attempt(session, attempt_id, student.id)
    await session.refresh(attempt, with_for_update=True)
    if attempt.ended_at and datetime.now(UTC) - attempt.ended_at > timedelta(minutes=5):
        raise HTTPException(409, "Proctoring observation window has closed")
    existing = {
        r.command_id: r
        for r in await session.scalars(
            select(ProctoringEvent).where(
                ProctoringEvent.attempt_id == attempt.id,
                ProctoringEvent.command_id.in_([e.command_id for e in payload.events]),
            )
        )
    }
    count = await session.scalar(
        select(func.count())
        .select_from(ProctoringEvent)
        .where(ProctoringEvent.attempt_id == attempt.id)
    )
    if count + len({e.command_id for e in payload.events} - existing.keys()) > 2000:
        raise HTTPException(429, "Proctoring event limit reached")
    for event in payload.events:
        previous = existing.get(event.command_id)
        if previous:
            if (
                previous.kind != event.kind
                or previous.client_occurred_at != event.client_occurred_at
            ):
                raise HTTPException(409, "Observation ID was reused with different data")
        else:
            row = ProctoringEvent(
                attempt_id=attempt.id, created_at=datetime.now(UTC), **event.model_dump()
            )
            session.add(row)
            existing[event.command_id] = row
    await session.commit()
    return {"accepted": len(payload.events)}


@router.get("/teaching/attempts/{attempt_id}/proctoring")
async def proctoring_history(
    attempt_id: UUID,
    session: SessionDep,
    teacher: TeacherDep,
    limit: Limit = 20,
    offset: Offset = 0,
):
    permitted = await session.scalar(
        select(Attempt.id)
        .join(Assignment, Assignment.id == Attempt.assignment_id)
        .join(Lesson)
        .where(Attempt.id == attempt_id, Lesson.teacher_id == teacher.id)
    )
    if permitted is None:
        raise HTTPException(404, "Attempt not found")
    query = select(ProctoringEvent).where(ProctoringEvent.attempt_id == attempt_id)
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    return {
        "items": list(
            await session.scalars(
                query.order_by(ProctoringEvent.created_at.desc(), ProctoringEvent.id)
                .limit(limit)
                .offset(offset)
            )
        ),
        "total": total,
        "limit": limit,
        "offset": offset,
        "trusted": False,
    }


@router.get("/teaching/monitoring")
async def monitoring(
    session: SessionDep, teacher: TeacherDep, limit: Limit = 20, offset: Offset = 0
):
    def latest(prefix):
        return (
            select(ProctoringEvent.kind)
            .where(ProctoringEvent.attempt_id == Attempt.id, ProctoringEvent.kind.like(prefix))
            .order_by(ProctoringEvent.created_at.desc(), ProctoringEvent.id.desc())
            .limit(1)
            .correlate(Attempt)
            .scalar_subquery()
        )

    query = (
        select(
            Attempt.id.label("attempt_id"),
            Lesson.title,
            func.coalesce(
                func.nullif(func.trim(func.concat_ws(" ", User.last_name, User.first_name)), ""),
                User.username,
            ).label("student_name"),
            latest("tab.%").label("visibility"),
            latest("window.%").label("focus"),
            select(func.max(ProctoringEvent.created_at))
            .where(ProctoringEvent.attempt_id == Attempt.id)
            .correlate(Attempt)
            .scalar_subquery()
            .label("last_seen"),
            select(func.count())
            .select_from(ProctoringEvent)
            .where(ProctoringEvent.attempt_id == Attempt.id, ProctoringEvent.kind == "tab.hidden")
            .correlate(Attempt)
            .scalar_subquery()
            .label("hidden_count"),
        )
        .select_from(Attempt)
        .join(Assignment, Assignment.id == Attempt.assignment_id)
        .join(Lesson, Lesson.id == Assignment.lesson_id)
        .join(User, User.id == Attempt.student_id)
        .where(Lesson.teacher_id == teacher.id, Attempt.status == "in_progress")
    )
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    items = (
        (
            await session.execute(
                query.order_by(Attempt.started_at.desc(), Attempt.id).limit(limit).offset(offset)
            )
        )
        .mappings()
        .all()
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}
