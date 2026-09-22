from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import func, select

from app.models import (
    Assignment,
    Attempt,
    AttemptEvent,
    IncidentCard,
    ResponseEvent,
    ServiceProfile,
    ServiceResponse,
)
from app.models.enums import (
    AttemptStatus,
    CardOrigin,
    CardStatus,
    EventActor,
    LessonStatus,
    ResponseStatus,
)
from app.schemas.dds import STATUS_LABELS, TRANSITIONS, DDSPolicy
from app.services.audit import append_event
from app.services.dds_crews import crew_context
from app.services.service_profiles import profile_read


async def initialize(session, attempt, scenario, source, now):
    raw = scenario.completion_rules.get("dds")
    if not raw:
        raise HTTPException(409, "DDS scenario requires configured exercise steps")
    policy = DDSPolicy.model_validate(raw)
    profile = await session.get(ServiceProfile, scenario.service_profile_id)
    profile_data = (await profile_read(session, profile)).model_dump(mode="json")
    attempt.settings_snapshot = attempt.settings_snapshot | {
        "dds_policy": policy.model_dump(mode="json"),
        "service_profile": profile_data,
    }
    card = IncidentCard(
        attempt_id=attempt.id,
        origin=CardOrigin.PREPARED,
        classifier_version_id=scenario.classifier_version_id,
        classifier_entry_id=source.snapshot["classifier_entry_id"],
        status=CardStatus.NOTIFIED,
        opened_at=now,
        saved_at=now,
        notification_completed_at=now,
        **source.snapshot["data"],
    )
    session.add(card)
    await session.flush()
    for recipient in source.snapshot["recipients"]:
        session.add(
            ServiceResponse(
                card_id=card.id,
                attempt_id=attempt.id,
                service_id=recipient["service_id"],
                service_name=recipient["name"],
                service_short_name=recipient.get("short_name"),
                status=ResponseStatus.RECEIVED,
                added_at=now,
                sent_at=now,
                received_at=now,
            )
        )
    await session.flush()
    await append_event(
        session,
        attempt.id,
        "dds.card_received",
        {"service_id": str(profile.service_id), "sent_at": now.isoformat()},
        actor=EventActor.SIMULATION,
    )
    await information(session, attempt, 0)


async def information(session, attempt, index):
    steps = attempt.settings_snapshot["dds_policy"]["steps"]
    if index < len(steps):
        await append_event(
            session,
            attempt.id,
            "dds.information",
            {"step": index, "message": steps[index]["message"]},
            actor=EventActor.SIMULATION,
        )


async def context(session, attempt, responses):
    events = list(
        await session.scalars(
            select(AttemptEvent)
            .where(
                AttemptEvent.attempt_id == attempt.id,
                AttemptEvent.kind.in_(["dds.information", "dds.status_changed"]),
            )
            .order_by(AttemptEvent.sequence)
        )
    )
    history = [e for e in events if e.kind == "dds.status_changed"]
    info = next((e for e in reversed(events) if e.kind == "dds.information"), None)
    profile = attempt.settings_snapshot["service_profile"]
    responses = sorted(
        responses,
        key=lambda r: (
            str(r.service_id) != profile["service_id"],
            r.service_short_name or r.service_name,
            str(r.service_id),
        ),
    )
    own = next(r for r in responses if str(r.service_id) == profile["service_id"])
    crews = await crew_context(session, attempt)
    requirements = attempt.settings_snapshot["dds_policy"].get("required_crews", [])
    return {
        "crews": crews,
        "crew_goals": [
            {
                **r,
                "name": next(
                    c["name"] for c in profile.get("crews", []) if c["code"] == r["crew_code"]
                ),
            }
            for r in requirements
        ],
        "profile": profile,
        "goal": STATUS_LABELS[attempt.settings_snapshot["dds_policy"]["steps"][-1]["status"]],
        "response_id": str(own.id),
        "revision": own.revision,
        "status": own.status.value,
        "sent_at": own.sent_at.isoformat(),
        "first_decision_at": own.first_decision_at.isoformat() if own.first_decision_at else None,
        "crew_number": own.crew_number,
        "comment": own.comment,
        "allowed_statuses": sorted(TRANSITIONS.get(own.status.value, set())),
        "can_finish": bool(history)
        and (
            own.status.value in {"not_accepted", "completed", "refused"}
            or len(history) >= len(attempt.settings_snapshot["dds_policy"]["steps"])
        ),
        "information": {"id": str(info.id), "message": info.payload["message"]} if info else None,
        "history": [
            {"id": str(e.id), "at": e.occurred_at.isoformat(), **e.payload} for e in history
        ],
        "responses": [
            {
                "service_id": str(r.service_id),
                "name": r.service_name,
                "short_name": r.service_short_name,
                "status": r.status.value,
                "crew_number": r.crew_number,
                "comment": r.comment,
            }
            for r in responses
        ],
    }


async def owned_dds(session, attempt_id, student_id):
    from app.services.student import owned_attempt

    attempt, lesson = await owned_attempt(session, attempt_id, student_id, lock=True)
    if "dds_policy" not in attempt.settings_snapshot:
        raise HTTPException(409, "This command requires a DDS exercise")
    service_id = attempt.settings_snapshot["service_profile"]["service_id"]
    response = await session.scalar(
        select(ServiceResponse).where(
            ServiceResponse.attempt_id == attempt.id, ServiceResponse.service_id == service_id
        )
    )
    return attempt, lesson, response


async def act(session, attempt_id, student_id, data):
    from app.services.student import attempt_read

    attempt, lesson, response = await owned_dds(session, attempt_id, student_id)
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
    from app.services.automatic_assessment import assess_submission
    from app.services.student import attempt_read

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
