from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import func, select

from app.models import (
    Assignment,
    Attempt,
    AttemptEvent,
    IncidentCard,
    ResponseEvent,
    ServiceResponse,
)
from app.models.enums import (
    AttemptStatus,
    CardStatus,
    EventActor,
    LessonStatus,
    ResponseStatus,
)
from app.schemas.dds import TRANSITIONS
from app.services.audit import append_event
from app.services.automatic_assessment.submission import assess_submission
from app.services.dds.access import owned_dds
from app.services.dds.initialization import information
from app.services.dds.views import crew_context
from app.services.student.reads import attempt_read


async def act(session, attempt_id, student_id, data):
    attempt, lesson, response = await owned_dds(session, attempt_id, student_id)
    if attempt.settings_snapshot["dds_policy"].get("workflow") == "crews-v1":
        raise HTTPException(409, "В этом занятии меняются только статусы бригад.")
    existing = await session.scalar(
        select(AttemptEvent).where(
            AttemptEvent.attempt_id == attempt.id, AttemptEvent.command_id == data.request_id
        )
    )
    payload = data.model_dump(mode="json", exclude={"request_id"})
    if existing:
        if existing.kind != "dds.status_changed" or existing.payload != payload:
            raise HTTPException(409, "Request ID was already used with different parameters")
        return await attempt_read(session, attempt, preview=False)
    if attempt.status != AttemptStatus.IN_PROGRESS or lesson.status != LessonStatus.ACTIVE:
        raise HTTPException(409, "This attempt is no longer editable")
    if response.revision != data.revision:
        raise HTTPException(409, "DDS response revision is stale; reload the card")
    if data.status not in TRANSITIONS.get(response.status.value, set()):
        raise HTTPException(422, "Invalid DDS status transition")
    if data.status in {"completed", "refused", "not_accepted"}:
        crews = await crew_context(session, attempt)
        if any(c["status"] not in {"completed", "cancelled"} for c in crews):
            raise HTTPException(409, "Complete or cancel active crew assignments first")
    latest = await session.scalar(
        select(AttemptEvent)
        .where(AttemptEvent.attempt_id == attempt.id, AttemptEvent.kind == "dds.information")
        .order_by(AttemptEvent.sequence.desc())
        .limit(1)
    )
    used = await session.scalar(
        select(ResponseEvent.id).where(
            ResponseEvent.attempt_id == attempt.id,
            ResponseEvent.information_event_id == data.information_event_id,
        )
    )
    if (
        latest is None
        or latest.id != data.information_event_id
        or (used and response.status != ResponseStatus.NOT_ACCEPTED)
    ):
        raise HTTPException(409, "Read the next scenario message before updating status")
    response.status = ResponseStatus(data.status)
    response.crew_number, response.comment = data.crew_number, data.comment
    if response.first_decision_at is None:
        response.first_decision_at = datetime.now(UTC)
    event = await append_event(
        session,
        attempt.id,
        "dds.status_changed",
        payload,
        actor=EventActor.STUDENT,
        actor_id=student_id,
        command_id=data.request_id,
    )
    session.add(
        ResponseEvent(
            response_id=response.id,
            attempt_id=attempt.id,
            attempt_event_id=event.id,
            information_event_id=latest.id,
            status=response.status,
            crew_number=response.crew_number,
            comment=response.comment,
        )
    )
    count = await session.scalar(
        select(func.count())
        .select_from(AttemptEvent)
        .where(AttemptEvent.attempt_id == attempt.id, AttemptEvent.kind == "dds.status_changed")
    )
    if data.status not in {"completed", "refused"}:
        await information(session, attempt, count)
    # One service's completion never completes other services' work.
    responses = list(
        await session.scalars(
            select(ServiceResponse).where(ServiceResponse.attempt_id == attempt.id)
        )
    )
    if responses and all(r.status == ResponseStatus.COMPLETED for r in responses):
        card = await session.scalar(
            select(IncidentCard).where(IncidentCard.attempt_id == attempt.id)
        )
        card.status = CardStatus.COMPLETED
    await session.commit()
    return await attempt_read(session, attempt, preview=False)


async def finish(session, attempt_id, student_id, data):
    attempt, lesson, response = await owned_dds(session, attempt_id, student_id)
    if attempt.status == AttemptStatus.COMPLETED:
        return await attempt_read(session, attempt, preview=False)
    if lesson.status != LessonStatus.ACTIVE or attempt.status != AttemptStatus.IN_PROGRESS:
        raise HTTPException(409, "This attempt cannot be submitted")
    if response.revision != data.revision:
        raise HTTPException(409, "DDS response revision is stale; reload the card")
    read = await attempt_read(session, attempt, preview=False)
    if not read.dds["can_finish"]:
        raise HTTPException(409, "Complete the configured DDS exercise before submitting")
    attempt.status, attempt.ended_at, attempt.end_reason = (
        AttemptStatus.COMPLETED,
        datetime.now(UTC),
        "dds_exercise_completed",
    )
    await append_event(
        session, attempt.id, "dds.submitted", {}, actor=EventActor.STUDENT, actor_id=student_id
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
        lesson.status, lesson.ended_at = LessonStatus.FINISHED, attempt.ended_at
    read = await attempt_read(session, attempt, preview=False)
    await assess_submission(session, attempt, lesson, read)
    await session.commit()
    return read
