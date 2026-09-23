from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import (
    Assignment,
    Attempt,
    ClassifierEntry,
    ClassifierRoute,
    IncidentCard,
    Lesson,
    LessonEvaluation,
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
from app.schemas.catalog import ClassifierEntryRead
from app.schemas.student import (
    CardSubmit,
    DraftData,
    DraftSave,
    JournalCardRead,
    RecipientRead,
    StudentAssignmentRead,
    StudentAttemptRead,
    StudentCardRead,
    StudentLessonRead,
)
from app.services.assessment_policy import scenario_policy
from app.services.audit import append_event, field_changes
from app.services.learning import learning_result


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
    query = query.with_for_update()
    lesson = await session.scalar(query.execution_options(populate_existing=True))
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    from app.services.deadlines import enforce_deadlines

    if await enforce_deadlines(session, lesson):
        await session.refresh(lesson, with_for_update=True)
    return lesson


async def lesson_work(session: AsyncSession, lesson: Lesson, student_id: UUID) -> StudentLessonRead:
    rows = (
        await session.execute(
            select(
                Assignment,
                ScenarioVersion,
                ScenarioCard,
                Attempt,
                IncidentCard,
                ClassifierEntry.name,
            )
            .join(
                ScenarioVersion,
                ScenarioVersion.id == Assignment.scenario_version_id,
            )
            .outerjoin(ScenarioCard, ScenarioCard.id == Assignment.scenario_card_id)
            .outerjoin(
                Attempt,
                (Attempt.assignment_id == Assignment.id) & (Attempt.number == 1),
            )
            .outerjoin(IncidentCard, IncidentCard.attempt_id == Attempt.id)
            .outerjoin(ClassifierEntry, ClassifierEntry.id == IncidentCard.classifier_entry_id)
            .where(Assignment.lesson_id == lesson.id, Assignment.student_id == student_id)
            .order_by(Assignment.position)
        )
    ).all()
    from app.services.dds_delivery import execution_for
    from app.services.deadlines import attempt_deadline

    execution = await execution_for(session, lesson.id, student_id)
    stream = execution is not None and any(
        row[0].settings.get("delivery") == "dds-stream-v1" for row in rows
    )
    assignments = []
    previous_complete = True
    for assignment, scenario, source, attempt, card, category_name in rows:
        complete = attempt is not None and attempt.status in (
            AttemptStatus.COMPLETED,
            AttemptStatus.INTERRUPTED,
        )
        assignments.append(
            StudentAssignmentRead(
                id=assignment.id,
                position=assignment.position,
                title=(
                    "Ожидается поступление"
                    if stream and attempt is None
                    else source.snapshot["title"]
                    if source
                    else scenario.title
                ),
                role=scenario.role,
                available=(bool(attempt) if stream else previous_complete)
                and not complete
                and (attempt is None or attempt.status == AttemptStatus.IN_PROGRESS)
                and lesson.status == LessonStatus.ACTIVE
                and (
                    scenario.role == TrainingRole.OPERATOR_112
                    or bool(scenario.completion_rules.get("dds"))
                ),
                scheduled_at=assignment.scheduled_at,
                received_at=assignment.released_at,
                first_opened_at=attempt.first_opened_at if attempt else None,
                first_response_at=attempt.first_response_at if attempt else None,
                response_norm_seconds=attempt.settings_snapshot.get("response_norm_seconds")
                if stream and attempt
                else None,
                deadline_at=attempt_deadline(attempt, lesson) if attempt else None,
                attempt_id=attempt.id if attempt else None,
                card=JournalCardRead(
                    id=card.id,
                    started_at=attempt.started_at,
                    status=card.status,
                    address_text=card.address_text,
                    description=card.description,
                    caller_name=card.caller_name,
                    caller_phone=card.caller_phone,
                    classifier_entry_id=card.classifier_entry_id,
                    category_name=category_name,
                )
                if card
                else None,
                status=attempt.status if attempt else "pending",
            )
        )
        previous_complete = previous_complete and complete
    state = (
        "submitted"
        if lesson.status == LessonStatus.FINISHED or (assignments and previous_complete)
        else ("in_progress" if any(item.attempt_id for item in assignments) else "assigned")
    )
    grade = await session.scalar(
        select(LessonEvaluation)
        .where(LessonEvaluation.lesson_id == lesson.id, LessonEvaluation.student_id == student_id)
        .order_by(LessonEvaluation.revision.desc())
        .limit(1)
    )
    return StudentLessonRead(
        delivery="dds-stream-v1" if stream else "sequential",
        execution_started_at=execution.started_at if execution else None,
        server_time=datetime.now(UTC),
        learning=lesson.learning,
        learning_result=learning_result([row[3] for row in rows if row[3]], grade),
        id=lesson.id,
        title=lesson.title,
        status=lesson.status,
        started_at=lesson.started_at,
        ended_at=lesson.ended_at,
        available_from=lesson.available_from,
        available_until=lesson.available_until,
        work_status=state,
        assignments=assignments,
    )


async def attempt_read(
    session: AsyncSession, attempt: Attempt, *, context=None, preview: bool = True
) -> StudentAttemptRead:
    if context is None:
        assignment = await session.get(Assignment, attempt.assignment_id)
        source = await session.get(ScenarioCard, assignment.scenario_card_id)
        scenario = await session.get(ScenarioVersion, assignment.scenario_version_id)
        card = await session.scalar(
            select(IncidentCard).where(IncidentCard.attempt_id == attempt.id)
        )
        responses = list(
            await session.scalars(
                select(ServiceResponse)
                .where(
                    ServiceResponse.attempt_id == attempt.id,
                )
                .order_by(ServiceResponse.service_id)
            )
        )
        entry = (
            await session.get(ClassifierEntry, card.classifier_entry_id)
            if card.classifier_entry_id
            else None
        )
    else:
        assignment, source, scenario, card, entry, responses = context
    targets = []
    recipient_error = None
    if (
        scenario.role == TrainingRole.OPERATOR_112
        and preview
        and entry
        and attempt.status == AttemptStatus.IN_PROGRESS
    ):
        try:
            targets = [
                RecipientRead(service_id=item.id, name=item.name, short_name=item.short_name)
                for item in await final_recipients(session, card)
            ]
        except HTTPException as exc:
            recipient_error = str(exc.detail)
    from app.services.dds import context as dds_context

    return StudentAttemptRead(
        learning=attempt.settings_snapshot.get("learning", {}),
        exercise_scope=attempt.settings_snapshot.get("exercise_scope"),
        role=scenario.role,
        dds=await dds_context(session, attempt, responses)
        if scenario.role == TrainingRole.DDS
        else None,
        classifier_entry=ClassifierEntryRead.model_validate(entry) if entry else None,
        recipient_services=targets,
        recipient_error=recipient_error,
        norm_seconds=scenario.norm_seconds,
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
            recipient_service_ids=card.recipient_service_ids,
        ),
        notified_services=[
            RecipientRead(
                service_id=r.service_id, name=r.service_name, short_name=r.service_short_name
            )
            for r in responses
        ],
    )


async def review_attempts(session: AsyncSession, attempts: list[Attempt]):
    """Two queries for any number of cards; teacher previews need no route calculation."""
    if not attempts:
        return {}
    ids = [attempt.id for attempt in attempts]
    rows = (
        await session.execute(
            select(
                Attempt.id, Assignment, ScenarioCard, ScenarioVersion, IncidentCard, ClassifierEntry
            )
            .join(Assignment, Assignment.id == Attempt.assignment_id)
            .join(ScenarioVersion, ScenarioVersion.id == Assignment.scenario_version_id)
            .join(ScenarioCard, ScenarioCard.id == Assignment.scenario_card_id)
            .join(IncidentCard, IncidentCard.attempt_id == Attempt.id)
            .outerjoin(ClassifierEntry, ClassifierEntry.id == IncidentCard.classifier_entry_id)
            .where(Attempt.id.in_(ids))
        )
    ).all()
    services = {}
    for response in await session.scalars(
        select(ServiceResponse)
        .where(ServiceResponse.attempt_id.in_(ids))
        .order_by(ServiceResponse.service_id)
    ):
        services.setdefault(response.attempt_id, []).append(response)
    contexts = {row[0]: (*row[1:], services.get(row[0], [])) for row in rows}
    return {
        attempt.id: await attempt_read(
            session, attempt, context=contexts[attempt.id], preview=False
        )
        for attempt in attempts
        if attempt.id in contexts
    }


async def event(
    session: AsyncSession, attempt: Attempt, student_id: UUID, kind: str, payload: dict
):
    return await append_event(
        session, attempt.id, kind, payload, actor=EventActor.STUDENT, actor_id=student_id
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
    if assignment.settings.get("delivery") == "dds-stream-v1":
        from app.services.dds_delivery import open_assignment

        return await open_assignment(session, lesson, assignment, student_id)
    existing = await session.scalar(select(Attempt).where(Attempt.assignment_id == assignment.id))
    if existing is not None:
        return await attempt_read(session, existing), False
    if lesson.status != LessonStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="Lesson is not active")
    scenario = await session.get(ScenarioVersion, assignment.scenario_version_id)
    if assignment.scenario_card_id is None:
        raise HTTPException(status_code=409, detail="Only composed scenarios can be started")
    previous = await session.scalar(
        select(func.count())
        .select_from(Assignment)
        .where(
            Assignment.lesson_id == lesson.id,
            Assignment.student_id == student_id,
            Assignment.position < assignment.position,
            ~select(Attempt.id)
            .where(
                Attempt.assignment_id == Assignment.id,
                Attempt.status.in_([AttemptStatus.COMPLETED, AttemptStatus.INTERRUPTED]),
            )
            .exists(),
        )
    )
    if previous:
        raise HTTPException(status_code=409, detail="Complete the previous card first")
    attempt = await create_attempt(session, assignment, scenario, student_id, datetime.now(UTC))
    await session.commit()
    return await attempt_read(session, attempt), True


async def create_attempt(session, assignment, scenario, student_id, now):
    attempt = Attempt(
        assignment_id=assignment.id,
        student_id=student_id,
        scenario_version_id=scenario.id,
        number=1,
        mode=assignment.mode,
        started_at=now,
        settings_snapshot={
            "delivery": assignment.settings.get("delivery"),
            "response_norm_seconds": scenario.norm_seconds,
            "semantic_assessment": settings.semantic_assessment_enabled,
            "learning": assignment.settings.get("learning", {}),
            "learning_engine": assignment.settings.get("learning_engine"),
            "deadline_policy": "bpmn-v1",
            "time_limit_seconds": assignment.time_limit_seconds,
            "hint_delay_seconds": assignment.hint_delay_seconds,
            "settings": assignment.settings,
            "assessment_policy": (await scenario_policy(session, scenario.id)).model_dump(
                mode="json"
            ),
        },
    )
    session.add(attempt)
    await session.flush()
    if scenario.role == TrainingRole.DDS:
        from app.services.dds import initialize

        source = await session.get(ScenarioCard, assignment.scenario_card_id)
        await initialize(session, attempt, scenario, source, now)
    else:
        from app.services.learning_scope import focused, prepared_card, skills_for

        initial = {}
        policy = attempt.settings_snapshot["learning"]
        if attempt.settings_snapshot.get("learning_engine") and focused(policy):
            source = await session.get(ScenarioCard, assignment.scenario_card_id)
            initial = prepared_card(source.snapshot, policy)
            attempt.settings_snapshot = attempt.settings_snapshot | {
                "exercise_scope": sorted(skills_for(policy))
            }
        session.add(
            IncidentCard(
                **initial,
                attempt_id=attempt.id,
                origin=CardOrigin.STUDENT,
                created_by_id=student_id,
                classifier_version_id=scenario.classifier_version_id,
                opened_at=now,
            )
        )
    if assignment.settings.get("delivery") == "dds-stream-v1":
        from app.services.audit import append_event

        await append_event(session, attempt.id, "attempt.started", {"source": "arrival_schedule"})
    else:
        await event(session, attempt, student_id, "attempt.started", {})
    if scenario.role != TrainingRole.DDS and attempt.settings_snapshot.get("exercise_scope"):
        from app.services.audit import append_event

        await append_event(
            session,
            attempt.id,
            "learning.prepared",
            {
                "editable_skills": attempt.settings_snapshot["exercise_scope"],
                "source": "scenario_card_snapshot",
            },
        )
    await session.flush()
    return attempt


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


async def recipients(
    session: AsyncSession, card: IncidentCard, entry_id: UUID | None = None
) -> list[Service]:
    if entry_id is None:
        entry = await selected_entry(session, card)
    else:
        entry = await session.get(ClassifierEntry, entry_id)
        if entry is None or entry.classifier_version_id != card.classifier_version_id:
            raise HTTPException(
                status_code=422, detail="Choose a code from the assigned classifier"
            )
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
    if (
        (entry.notification_required and not routes)
        or (not entry.notification_required and routes)
        or any(not service.is_active for _, service in routes)
    ):
        raise HTTPException(status_code=409, detail="Active prepared service routes are required")
    from app.services.catalog_rules import applicable_routes

    selected = {
        r.service_id for r in applicable_routes(entry, [r for r, _ in routes], card.features)
    }
    return [service for route, service in routes if route.service_id in selected]


async def selected_services(session, ids):
    rows = list(
        await session.scalars(
            select(Service)
            .where(Service.id.in_(ids), Service.is_active.is_(True))
            .order_by(Service.name, Service.id)
        )
    )
    if len(rows) != len(ids):
        raise HTTPException(422, "Choose existing active training services")
    return rows


async def final_recipients(session, card):
    from app.schemas.card_flags import flags

    if flags(card).get("noContact"):
        return []
    if card.recipient_service_ids is None:
        return await recipients(session, card)
    # The operator decides who to notify independently of route recommendations.
    # Required feature validation happens on submission, not while reading a draft.
    return await selected_services(session, card.recipient_service_ids)


async def save_card(session: AsyncSession, attempt_id: UUID, student_id: UUID, payload: DraftSave):
    attempt, lesson = await owned_attempt(session, attempt_id, student_id, lock=True)
    if "dds_policy" in attempt.settings_snapshot:
        raise HTTPException(409, "DDS input cards are read-only; use response actions")
    if attempt.status != AttemptStatus.IN_PROGRESS or lesson.status != LessonStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="This attempt is no longer editable")
    card = await session.scalar(select(IncidentCard).where(IncidentCard.attempt_id == attempt.id))
    if card.revision != payload.revision:
        raise HTTPException(status_code=409, detail="Card revision is stale; reload the card")
    from app.services.learning_scope import constrain_draft

    payload = constrain_draft(attempt, card, payload)
    if payload.classifier_entry_id is not None:
        entry = await session.get(ClassifierEntry, payload.classifier_entry_id)
        if entry is None or entry.classifier_version_id != card.classifier_version_id:
            raise HTTPException(
                status_code=422, detail="Choose a code from the assigned classifier"
            )
    if payload.recipient_service_ids is not None:
        await selected_services(session, payload.recipient_service_ids)
    if payload.classifier_entry_id is not None:
        from app.services.catalog_rules import feature_definitions, validate_answers

        validate_answers(
            feature_definitions(entry),
            (payload.data.features or {}).get("ekp", {}),
            require_complete=False,
        )
    before_revision = card.revision
    previous_services = card.recipient_service_ids
    chosen_services = (
        [str(sid) for sid in payload.recipient_service_ids]
        if payload.recipient_service_ids is not None
        else None
    )
    card.recipient_service_ids = chosen_services
    if previous_services != chosen_services:
        await event(
            session,
            attempt,
            student_id,
            "card.services_changed",
            {
                "before": previous_services,
                "after": chosen_services,
                "mode": "ekp" if chosen_services is None else "manual",
            },
        )
    before = DraftData.model_validate(card).model_dump(mode="json") | {
        "classifier_entry_id": str(card.classifier_entry_id) if card.classifier_entry_id else None
    }
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
            "before_revision": before_revision,
            "changes": field_changes(
                before,
                payload.data.model_dump(mode="json")
                | {
                    "classifier_entry_id": str(card.classifier_entry_id)
                    if card.classifier_entry_id
                    else None
                },
            ),
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
    if "dds_policy" in attempt.settings_snapshot:
        raise HTTPException(409, "DDS input cards are read-only; use response actions")
    if attempt.status == AttemptStatus.COMPLETED:
        return await attempt_read(session, attempt)
    if "dds_policy" in attempt.settings_snapshot:
        raise HTTPException(409, "DDS input cards are read-only; use response actions")
    if attempt.status != AttemptStatus.IN_PROGRESS or lesson.status != LessonStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="This attempt cannot be submitted")
    card = await session.scalar(select(IncidentCard).where(IncidentCard.attempt_id == attempt.id))
    if card.revision != payload.revision:
        raise HTTPException(status_code=409, detail="Card revision is stale; reload the card")
    from app.schemas.card_flags import check_silent, flags

    silent = flags(card).get("noContact") is True
    check_silent(
        DraftData.model_validate(card), card.classifier_entry_id, card.recipient_service_ids
    )
    entry = None if silent else await selected_entry(session, card)
    if (entry and entry.notification_required and not (card.address_text or "").strip()) or not (
        card.description or ""
    ).strip():
        raise HTTPException(status_code=422, detail="Address and incident description are required")
    from app.services.catalog_rules import feature_definitions, validate_answers

    if entry:
        validate_answers(feature_definitions(entry), (card.features or {}).get("ekp", {}))
    targets = await final_recipients(session, card)
    now = datetime.now(UTC)
    card.saved_at = now
    card.notification_completed_at = now if targets else None
    card.status = CardStatus.NOTIFIED if targets else CardStatus.REGISTERED
    session.add_all(
        [
            ServiceResponse(
                card_id=card.id,
                attempt_id=attempt.id,
                service_id=service.id,
                service_name=service.name,
                service_short_name=service.short_name,
                added_at=now,
                sent_at=now,
            )
            for service in targets
        ]
    )
    attempt.status = AttemptStatus.COMPLETED
    attempt.ended_at = now
    attempt.end_reason = (
        "operator_112_notification_completed"
        if targets
        else "operator_112_registered_without_notification"
    )
    await event(
        session,
        attempt,
        student_id,
        "card.notified" if targets else "card.registered_without_notification",
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
                Attempt.assignment_id == Assignment.id,
                Attempt.status.in_([AttemptStatus.COMPLETED, AttemptStatus.INTERRUPTED]),
            )
            .exists(),
        )
    )
    if not remaining:
        lesson.status = LessonStatus.FINISHED
        lesson.ended_at = now
    from app.services.automatic_assessment import assess_submission

    submitted_read = await attempt_read(session, attempt, preview=False)
    await assess_submission(session, attempt, lesson, submitted_read)
    await session.commit()
    return submitted_read
