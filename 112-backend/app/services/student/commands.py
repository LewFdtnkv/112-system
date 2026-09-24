from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Assignment,
    Attempt,
    ClassifierEntry,
    IncidentCard,
    ServiceResponse,
)
from app.models.enums import (
    AttemptStatus,
    CardStatus,
    LessonStatus,
)
from app.schemas.student import (
    CardSubmit,
    DraftData,
    DraftSave,
)
from app.services.audit import append_student_event, field_changes
from app.services.automatic_assessment.submission import assess_submission
from app.services.catalog_rules import feature_definitions, validate_answers
from app.services.learning_scope import constrain_draft
from app.services.student.access import owned_attempt
from app.services.student.reads import attempt_read
from app.services.student.routing import final_recipients, selected_entry, selected_services


async def save_card(session: AsyncSession, attempt_id: UUID, student_id: UUID, payload: DraftSave):
    attempt, lesson = await owned_attempt(session, attempt_id, student_id, lock=True)
    if "dds_policy" in attempt.settings_snapshot:
        raise HTTPException(409, "DDS input cards are read-only; use response actions")
    if attempt.status != AttemptStatus.IN_PROGRESS or lesson.status != LessonStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="This attempt is no longer editable")
    card = await session.scalar(select(IncidentCard).where(IncidentCard.attempt_id == attempt.id))
    if card.revision != payload.revision:
        raise HTTPException(status_code=409, detail="Card revision is stale; reload the card")

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
        await append_student_event(
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
    await append_student_event(
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
    await append_student_event(
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

    submitted_read = await attempt_read(session, attempt, preview=False)
    await assess_submission(session, attempt, lesson, submitted_read)
    await session.commit()
    return submitted_read
