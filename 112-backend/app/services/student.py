from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Assignment,
    Attempt,
    AttemptEvent,
    ClassifierEntry,
    ClassifierRoute,
    IncidentCard,
    Lesson,
    ScenarioCard,
    ScenarioVersion,
    Service,
    ServiceResponse,
)
from app.models.enums import (
    AttemptStatus,
    CardOrigin,
    CardStatus,
    EventActor,
    LessonStatus,
    TrainingRole,
)
from app.schemas.student import (
    CardSubmit,
    DraftData,
    DraftSave,
    RecipientRead,
    StudentAssignmentRead,
    StudentAttemptRead,
    StudentCardRead,
    StudentLessonRead,
)


async def student_lesson(
    session: AsyncSession,
    lesson_id: UUID,
    student_id: UUID,
    *,
    lock: bool = False,
) -> Lesson:
    query = select(Lesson).where(
        Lesson.id == lesson_id,
        Lesson.id.in_(
            select(Assignment.lesson_id).where(Assignment.student_id == student_id),
        ),
    )
    if lock:
        query = query.with_for_update()
    lesson = await session.scalar(query)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return lesson


async def lesson_work(session: AsyncSession, lesson: Lesson, student_id: UUID) -> StudentLessonRead:
    rows = (
        await session.execute(
            select(Assignment, ScenarioVersion, ScenarioCard, Attempt)
            .join(
                ScenarioVersion,
                ScenarioVersion.id == Assignment.scenario_version_id,
            )
            .outerjoin(ScenarioCard, ScenarioCard.id == Assignment.scenario_card_id)
            .outerjoin(
                Attempt,
                (Attempt.assignment_id == Assignment.id) & (Attempt.number == 1),
            )
            .where(Assignment.lesson_id == lesson.id, Assignment.student_id == student_id)
            .order_by(Assignment.position)
        )
    ).all()
    assignments = []
    previous_complete = True
    for assignment, scenario, source, attempt in rows:
        complete = attempt is not None and attempt.status == AttemptStatus.COMPLETED
        assignments.append(
            StudentAssignmentRead(
                id=assignment.id,
                position=assignment.position,
                title=source.snapshot["title"] if source else scenario.title,
                role=scenario.role,
                available=previous_complete
                and not complete
                and (attempt is None or attempt.status == AttemptStatus.IN_PROGRESS)
                and lesson.status == LessonStatus.ACTIVE
                and scenario.role == TrainingRole.OPERATOR_112,
                attempt_id=attempt.id if attempt else None,
                status=attempt.status if attempt else "pending",
            )
        )
        previous_complete = previous_complete and complete
    state = (
        "submitted"
        if assignments and previous_complete
        else ("in_progress" if any(item.attempt_id for item in assignments) else "assigned")
    )
    return StudentLessonRead(
        id=lesson.id,
        title=lesson.title,
        status=lesson.status,
        started_at=lesson.started_at,
        ended_at=lesson.ended_at,
        work_status=state,
        assignments=assignments,
    )


async def attempt_read(session: AsyncSession, attempt: Attempt) -> StudentAttemptRead:
    assignment = await session.get(Assignment, attempt.assignment_id)
    source = await session.get(ScenarioCard, assignment.scenario_card_id)
    scenario = await session.get(ScenarioVersion, assignment.scenario_version_id)
    card = await session.scalar(select(IncidentCard).where(IncidentCard.attempt_id == attempt.id))
    responses = list(
        await session.scalars(
            select(ServiceResponse)
            .where(
                ServiceResponse.attempt_id == attempt.id,
            )
            .order_by(ServiceResponse.service_id)
        )
    )
    return StudentAttemptRead(
        id=attempt.id,
        assignment_id=attempt.assignment_id,
        status=attempt.status,
        started_at=attempt.started_at,
        ended_at=attempt.ended_at,
        instructions="\n\n".join(
            filter(None, [scenario.instructions, source.snapshot["instructions"]])
        ),
        caller_message=source.snapshot["caller_message"],
        time_limit_seconds=attempt.settings_snapshot.get("time_limit_seconds"),
        card=StudentCardRead(
            id=card.id,
            revision=card.revision,
            status=card.status,
            classifier_version_id=card.classifier_version_id,
            classifier_entry_id=card.classifier_entry_id,
            data=DraftData.model_validate(card),
            opened_at=card.opened_at,
            saved_at=card.saved_at,
            notification_completed_at=card.notification_completed_at,
        ),
        notified_services=[
            RecipientRead(service_id=r.service_id, name=r.service_name) for r in responses
        ],
    )


async def event(
    session: AsyncSession, attempt: Attempt, student_id: UUID, kind: str, payload: dict
):
    sequence = 1 + (
        await session.scalar(
            select(func.max(AttemptEvent.sequence)).where(
                AttemptEvent.attempt_id == attempt.id,
            )
        )
        or 0
    )
    session.add(
        AttemptEvent(
            attempt_id=attempt.id,
            sequence=sequence,
            kind=kind,
            actor=EventActor.STUDENT,
            actor_id=student_id,
            payload=payload,
        )
    )


async def start_attempt(session: AsyncSession, assignment_id: UUID, student_id: UUID):
    assignment = await session.scalar(
        select(Assignment).where(
            Assignment.id == assignment_id,
            Assignment.student_id == student_id,
        )
    )
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    lesson = await student_lesson(session, assignment.lesson_id, student_id, lock=True)
    existing = await session.scalar(select(Attempt).where(Attempt.assignment_id == assignment.id))
    if existing is not None:
        return await attempt_read(session, existing), False
    if lesson.status != LessonStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="Lesson is not active")
    scenario = await session.get(ScenarioVersion, assignment.scenario_version_id)
    if scenario.role != TrainingRole.OPERATOR_112 or assignment.scenario_card_id is None:
        raise HTTPException(
            status_code=409, detail="Only composed operator 112 scenarios can be started"
        )
    previous = await session.scalar(
        select(func.count())
        .select_from(Assignment)
        .where(
            Assignment.lesson_id == lesson.id,
            Assignment.student_id == student_id,
            Assignment.position < assignment.position,
            ~select(Attempt.id)
            .where(
                Attempt.assignment_id == Assignment.id, Attempt.status == AttemptStatus.COMPLETED
            )
            .exists(),
        )
    )
    if previous:
        raise HTTPException(status_code=409, detail="Complete the previous card first")
    now = datetime.now(UTC)
    attempt = Attempt(
        assignment_id=assignment.id,
        student_id=student_id,
        scenario_version_id=scenario.id,
        number=1,
        mode=assignment.mode,
        started_at=now,
        settings_snapshot={
            "time_limit_seconds": assignment.time_limit_seconds,
            "hint_delay_seconds": assignment.hint_delay_seconds,
            "settings": assignment.settings,
        },
    )
    session.add(attempt)
    await session.flush()
    session.add(
        IncidentCard(
            attempt_id=attempt.id,
            origin=CardOrigin.STUDENT,
            created_by_id=student_id,
            classifier_version_id=scenario.classifier_version_id,
            opened_at=now,
        )
    )
    await event(session, attempt, student_id, "attempt.started", {})
    await session.commit()
    return await attempt_read(session, attempt), True


async def owned_attempt(
    session: AsyncSession,
    attempt_id: UUID,
    student_id: UUID,
    *,
    lock: bool = False,
) -> tuple[Attempt, Lesson]:
    attempt = await session.scalar(
        select(Attempt).where(
            Attempt.id == attempt_id,
            Attempt.student_id == student_id,
        )
    )
    if attempt is None:
        raise HTTPException(status_code=404, detail="Attempt not found")
    assignment = await session.get(Assignment, attempt.assignment_id)
    lesson = await student_lesson(session, assignment.lesson_id, student_id, lock=lock)
    if lock:
        # The row may have changed while waiting for another command on this lesson.
        await session.refresh(attempt)
    return attempt, lesson


async def selected_entry(session: AsyncSession, card: IncidentCard) -> ClassifierEntry:
    entry = (
        await session.get(ClassifierEntry, card.classifier_entry_id)
        if card.classifier_entry_id
        else None
    )
    if entry is None or entry.classifier_version_id != card.classifier_version_id:
        raise HTTPException(
            status_code=422, detail="Choose an incident code from the assigned classifier"
        )
    return entry


async def recipients(session: AsyncSession, card: IncidentCard) -> list[Service]:
    entry = await selected_entry(session, card)
    routes = (
        await session.execute(
            select(ClassifierRoute, Service)
            .join(Service)
            .where(
                ClassifierRoute.entry_id == entry.id,
            )
            .order_by(Service.id)
        )
    ).all()
    if not routes or any(not service.is_active for _, service in routes):
        raise HTTPException(status_code=409, detail="Active prepared service routes are required")
    if entry.conditions or any(route.conditions for route, _ in routes):
        raise HTTPException(
            status_code=409, detail="Conditional routing is not supported by this workflow yet"
        )
    return [service for _, service in routes]


async def save_card(session: AsyncSession, attempt_id: UUID, student_id: UUID, payload: DraftSave):
    attempt, lesson = await owned_attempt(session, attempt_id, student_id, lock=True)
    if attempt.status != AttemptStatus.IN_PROGRESS or lesson.status != LessonStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="This attempt is no longer editable")
    card = await session.scalar(select(IncidentCard).where(IncidentCard.attempt_id == attempt.id))
    if card.revision != payload.revision:
        raise HTTPException(status_code=409, detail="Card revision is stale; reload the card")
    if payload.classifier_entry_id is not None:
        entry = await session.get(ClassifierEntry, payload.classifier_entry_id)
        if entry is None or entry.classifier_version_id != card.classifier_version_id:
            raise HTTPException(
                status_code=422, detail="Choose a code from the assigned classifier"
            )
    card.classifier_entry_id = payload.classifier_entry_id
    for key, value in payload.data.model_dump(mode="json").items():
        setattr(card, key, value)
    await session.flush()
    await event(
        session,
        attempt,
        student_id,
        "card.draft_saved",
        {
            "revision": card.revision,
            "classifier_entry_id": str(card.classifier_entry_id)
            if card.classifier_entry_id
            else None,
            "data": payload.data.model_dump(mode="json"),
        },
    )
    await session.commit()
    return await attempt_read(session, attempt)


async def submit_card(
    session: AsyncSession, attempt_id: UUID, student_id: UUID, payload: CardSubmit
):
    attempt, lesson = await owned_attempt(session, attempt_id, student_id, lock=True)
    if attempt.status == AttemptStatus.COMPLETED:
        return await attempt_read(session, attempt)
    if attempt.status != AttemptStatus.IN_PROGRESS or lesson.status != LessonStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="This attempt cannot be submitted")
    card = await session.scalar(select(IncidentCard).where(IncidentCard.attempt_id == attempt.id))
    if card.revision != payload.revision:
        raise HTTPException(status_code=409, detail="Card revision is stale; reload the card")
    if not (card.address_text or "").strip() or not (card.description or "").strip():
        raise HTTPException(status_code=422, detail="Address and incident description are required")
    targets = await recipients(session, card)
    now = datetime.now(UTC)
    card.saved_at = now
    card.notification_completed_at = now
    card.status = CardStatus.NOTIFIED
    session.add_all(
        [
            ServiceResponse(
                card_id=card.id,
                attempt_id=attempt.id,
                service_id=service.id,
                service_name=service.name,
                added_at=now,
                sent_at=now,
            )
            for service in targets
        ]
    )
    attempt.status = AttemptStatus.COMPLETED
    attempt.ended_at = now
    attempt.end_reason = "operator_112_notification_completed"
    await event(
        session,
        attempt,
        student_id,
        "card.notified",
        {
            "service_ids": [str(service.id) for service in targets],
        },
    )
    await session.flush()
    remaining = await session.scalar(
        select(func.count())
        .select_from(Assignment)
        .where(
            Assignment.lesson_id == lesson.id,
            ~select(Attempt.id)
            .where(
                Attempt.assignment_id == Assignment.id, Attempt.status == AttemptStatus.COMPLETED
            )
            .exists(),
        )
    )
    if not remaining:
        lesson.status = LessonStatus.FINISHED
        lesson.ended_at = now
    await session.commit()
    return await attempt_read(session, attempt)
