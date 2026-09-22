from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import func, select

from app.api.dependencies import SessionDep, StudentDep
from app.api.v1.authoring import Limit, Offset
from app.models import Assignment, ClassifierEntry, IncidentCard, Lesson, Service
from app.schemas.audit import ObservationBatch
from app.schemas.catalog import ClassifierEntryRead, ServiceRead
from app.schemas.catalog_document import RoutePreview
from app.schemas.dds import CrewCommand, DDSAction, DDSFinish
from app.schemas.learning import HintRead, HintRequest
from app.schemas.student import (
    CardSubmit,
    DraftSave,
    RecipientRead,
    StudentAttemptRead,
    StudentLessonRead,
)
from app.services import dds as dds_service
from app.services import dds_crews
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
    popular: bool = False,
    q: str = Query(default="", max_length=200),
):
    row, _ = await owned_attempt(session, attempt_id, student.id)
    card = await session.scalar(select(IncidentCard).where(IncidentCard.attempt_id == row.id))
    query = select(ClassifierEntry).where(
        ClassifierEntry.classifier_version_id == card.classifier_version_id
    )
    term = q.strip()
    if popular:
        query = query.where(ClassifierEntry.is_popular).order_by(
            ClassifierEntry.popular_order, ClassifierEntry.source_row, ClassifierEntry.id
        )
        limit = min(limit, 11)
    elif len(term) < 2:
        return []
    else:
        # Escape LIKE wildcards: two '%' characters must not expose the entire catalog.
        term = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.where(
            ClassifierEntry.code.ilike(f"%{term}%", escape="\\")
            | ClassifierEntry.name.ilike(f"%{term}%", escape="\\")
            | ClassifierEntry.display_name.ilike(f"%{term}%", escape="\\")
        ).order_by(ClassifierEntry.name, ClassifierEntry.id)
    return list(await session.scalars(query.limit(limit).offset(offset)))


@router.get("/attempts/{attempt_id}/services")
async def available_services(
    attempt_id: UUID,
    session: SessionDep,
    student: StudentDep,
    limit: Limit = 20,
    offset: Offset = 0,
    q: str = Query(default="", max_length=200),
):
    await owned_attempt(session, attempt_id, student.id)
    query = select(Service).where(
        Service.is_active.is_(True),
        Service.name.ilike(f"%{q.strip()}%")
        | Service.short_name.ilike(f"%{q.strip()}%")
        | Service.code.ilike(f"%{q.strip()}%"),
    )
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = await session.scalars(
        query.order_by(Service.name, Service.id).limit(limit).offset(offset)
    )
    return {
        "items": [ServiceRead.model_validate(s) for s in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


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
        RecipientRead(service_id=service.id, name=service.name, short_name=service.short_name)
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


@router.post("/attempts/{attempt_id}/dds/actions", response_model=StudentAttemptRead)
async def dds_action(
    attempt_id: UUID, payload: DDSAction, session: SessionDep, student: StudentDep
):
    try:
        return await dds_service.act(session, attempt_id, student.id, payload)
    except HTTPException as exc:
        await reject_command(session, attempt_id, student.id, "dds_action", exc)
        raise


@router.post("/attempts/{attempt_id}/dds/submit", response_model=StudentAttemptRead)
async def dds_submit(
    attempt_id: UUID, payload: DDSFinish, session: SessionDep, student: StudentDep
):
    try:
        return await dds_service.finish(session, attempt_id, student.id, payload)
    except HTTPException as exc:
        await reject_command(session, attempt_id, student.id, "dds_submit", exc)
        raise


@router.post("/attempts/{attempt_id}/dds/crews", response_model=StudentAttemptRead)
async def dds_crew(
    attempt_id: UUID, payload: CrewCommand, session: SessionDep, student: StudentDep
):
    try:
        return await dds_crews.act(session, attempt_id, student.id, payload)
    except HTTPException as exc:
        await reject_command(session, attempt_id, student.id, "dds_crew", exc)
        raise


@router.post("/attempts/{attempt_id}/recipients-preview", response_model=list[RecipientRead])
async def preview_fields(
    attempt_id: UUID, payload: RoutePreview, session: SessionDep, student: StudentDep
):
    from types import SimpleNamespace

    row, _ = await owned_attempt(session, attempt_id, student.id)
    card = await session.scalar(select(IncidentCard).where(IncidentCard.attempt_id == row.id))
    preview_card = SimpleNamespace(
        classifier_version_id=card.classifier_version_id,
        classifier_entry_id=payload.classifier_entry_id,
        features={"ekp": payload.answers},
    )
    return [
        RecipientRead(service_id=s.id, name=s.name, short_name=s.short_name)
        for s in await recipients(session, preview_card)
    ]


@router.post("/attempts/{attempt_id}/hints", response_model=HintRead)
async def hint(attempt_id: UUID, payload: HintRequest, session: SessionDep, student: StudentDep):
    from app.services.learning_hints import issue_hint

    return await issue_hint(session, attempt_id, student.id, payload)
