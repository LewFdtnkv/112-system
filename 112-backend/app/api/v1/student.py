from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import select

from app.api.dependencies import SessionDep, StudentDep
from app.api.v1.authoring import Limit, Offset
from app.models import Assignment, ClassifierEntry, IncidentCard, Lesson
from app.schemas.audit import ObservationBatch
from app.schemas.catalog import ClassifierEntryRead
from app.schemas.student import (
    CardSubmit,
    DraftSave,
    RecipientRead,
    StudentAttemptRead,
    StudentLessonRead,
)
from app.services.attempt_audit import record_observations, reject_command
from app.services.student import (
    attempt_read,
    lesson_work,
    owned_attempt,
    recipients,
    save_card,
    start_attempt,
    student_lesson,
    submit_card,
)

router = APIRouter(prefix="/student", tags=["student workflow"])


@router.get("/lessons", response_model=list[StudentLessonRead])
async def lessons(session: SessionDep, student: StudentDep, limit: Limit = 20, offset: Offset = 0):
    rows = list(
        await session.scalars(
            select(Lesson)
            .where(
                Lesson.id.in_(
                    select(Assignment.lesson_id).where(Assignment.student_id == student.id),
                )
            )
            .order_by(Lesson.created_at, Lesson.id)
            .limit(limit)
            .offset(offset)
        )
    )
    return [await lesson_work(session, lesson, student.id) for lesson in rows]


@router.get("/lessons/{lesson_id}", response_model=StudentLessonRead)
async def lesson(lesson_id: UUID, session: SessionDep, student: StudentDep):
    return await lesson_work(
        session, await student_lesson(session, lesson_id, student.id), student.id
    )


@router.post(
    "/assignments/{assignment_id}/start", response_model=StudentAttemptRead, status_code=201
)
async def start(assignment_id: UUID, session: SessionDep, student: StudentDep, response: Response):
    result, created = await start_attempt(session, assignment_id, student.id)
    response.status_code = 201 if created else 200
    return result


@router.get("/attempts/{attempt_id}", response_model=StudentAttemptRead)
async def attempt(attempt_id: UUID, session: SessionDep, student: StudentDep):
    row, _ = await owned_attempt(session, attempt_id, student.id)
    return await attempt_read(session, row)


@router.put("/attempts/{attempt_id}/card", response_model=StudentAttemptRead)
async def save(attempt_id: UUID, payload: DraftSave, session: SessionDep, student: StudentDep):
    try:
        return await save_card(session, attempt_id, student.id, payload)
    except HTTPException as exc:
        await reject_command(session, attempt_id, student.id, "save_draft", exc)
        raise


@router.get("/attempts/{attempt_id}/classifier-entries", response_model=list[ClassifierEntryRead])
async def codes(
    attempt_id: UUID,
    session: SessionDep,
    student: StudentDep,
    limit: Limit = 20,
    offset: Offset = 0,
    q: str = Query(default="", max_length=200),
):
    row, _ = await owned_attempt(session, attempt_id, student.id)
    card = await session.scalar(select(IncidentCard).where(IncidentCard.attempt_id == row.id))
    return list(
        await session.scalars(
            select(ClassifierEntry)
            .where(
                ClassifierEntry.classifier_version_id == card.classifier_version_id,
                (ClassifierEntry.name.ilike(f"%{q}%") | ClassifierEntry.code.ilike(f"%{q}%")),
            )
            .order_by(ClassifierEntry.code, ClassifierEntry.id)
            .limit(limit)
            .offset(offset)
        )
    )


@router.get("/attempts/{attempt_id}/recipients", response_model=list[RecipientRead])
async def preview(
    attempt_id: UUID,
    session: SessionDep,
    student: StudentDep,
    classifier_entry_id: UUID | None = None,
):
    row, _ = await owned_attempt(session, attempt_id, student.id)
    card = await session.scalar(select(IncidentCard).where(IncidentCard.attempt_id == row.id))
    return [
        RecipientRead(service_id=service.id, name=service.name)
        for service in await recipients(session, card, classifier_entry_id)
    ]


@router.post("/attempts/{attempt_id}/submit", response_model=StudentAttemptRead)
async def submit(attempt_id: UUID, payload: CardSubmit, session: SessionDep, student: StudentDep):
    try:
        return await submit_card(session, attempt_id, student.id, payload)
    except HTTPException as exc:
        await reject_command(session, attempt_id, student.id, "submit", exc)
        raise


@router.post("/attempts/{attempt_id}/observations")
async def observations(
    attempt_id: UUID, payload: ObservationBatch, session: SessionDep, student: StudentDep
):
    return await record_observations(session, attempt_id, student.id, payload)
