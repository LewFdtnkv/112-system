"""Crew commands share the attempt lock and the response revision with DDS commands."""

from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select

from app.models import AttemptEvent, CrewAssignment
from app.models.enums import AttemptStatus, EventActor, LessonStatus
from app.schemas.dds import CREW_TRANSITIONS
from app.services.audit import append_event


async def crew_context(session, attempt):
    rows = list(
        await session.scalars(
            select(CrewAssignment)
            .where(CrewAssignment.attempt_id == attempt.id)
            .order_by(CrewAssignment.assigned_at, CrewAssignment.id)
        )
    )
    events = list(
        await session.scalars(
            select(AttemptEvent)
            .where(
                AttemptEvent.attempt_id == attempt.id,
                AttemptEvent.kind == "dds.crew_changed",
            )
            .order_by(AttemptEvent.sequence)
        )
    )
    return [
        {
            "id": str(row.id),
            "crew_code": row.crew_code,
            "name": row.snapshot["name"],
            "description": row.snapshot.get("description", ""),
            "contact_code": row.snapshot.get("contact_code"),
            "status": row.status,
            "assigned_at": row.assigned_at.isoformat(),
            "status_updated_at": next(
                (
                    e.occurred_at
                    for e in reversed(events)
                    if e.payload["crew_code"] == row.crew_code
                ),
                row.assigned_at,
            ).isoformat(),
            "crew_number": row.crew_number,
            "comment": row.comment,
            "allowed_statuses": sorted(CREW_TRANSITIONS[row.status]),
            "history": [
                {"id": str(e.id), "at": e.occurred_at.isoformat(), **e.payload}
                for e in events
                if e.payload["crew_code"] == row.crew_code
            ],
        }
        for row in rows
    ]


async def act(session, attempt_id, student_id, data):
    from app.services.dds import owned_dds
    from app.services.student import attempt_read

    attempt, lesson, response = await owned_dds(session, attempt_id, student_id)
    command = data.model_dump(mode="json", exclude={"request_id"})
    existing = await session.scalar(
        select(AttemptEvent).where(
            AttemptEvent.attempt_id == attempt.id,
            AttemptEvent.command_id == data.request_id,
        )
    )
    if existing:
        if existing.kind != "dds.crew_changed" or existing.payload.get("command") != command:
            raise HTTPException(409, "Request ID was already used with different parameters")
        return await attempt_read(session, attempt, preview=False)
    if attempt.status != AttemptStatus.IN_PROGRESS or lesson.status != LessonStatus.ACTIVE:
        raise HTTPException(409, "This attempt is no longer editable")
    if response.revision != data.revision:
        raise HTTPException(409, "DDS response revision is stale; reload the card")
    if attempt.settings_snapshot["dds_policy"].get(
        "workflow"
    ) != "crews-v1" and response.status.value not in {
        "accepted",
        "responding",
        "arrived",
        "in_progress",
    }:
        raise HTTPException(409, "Accept the service response before managing crews")
    source = await session.scalar(
        select(AttemptEvent).where(
            AttemptEvent.id == data.information_event_id,
            AttemptEvent.attempt_id == attempt.id,
            AttemptEvent.kind == "dds.information",
        )
    )
    if source is None:
        raise HTTPException(422, "Crew action requires a message from this attempt")
    directory = attempt.settings_snapshot["service_profile"].get("crews", [])
    crew = next((c for c in directory if c["code"] == data.crew_code and c["is_active"]), None)
    if crew is None:
        raise HTTPException(422, "Crew must be active in the attempt profile")
    row = await session.scalar(
        select(CrewAssignment).where(
            CrewAssignment.response_id == response.id,
            CrewAssignment.crew_code == data.crew_code,
        )
    )
    scope = attempt.settings_snapshot.get("exercise_scope")
    if scope and "dds_crews" not in scope and row is None:
        raise HTTPException(
            422, "В этом упражнении состав бригад подготовлен; отрабатываются их статусы."
        )
    if scope and "dds_response" not in scope and data.status not in {"assigned", "cancelled"}:
        raise HTTPException(422, "В этом упражнении отрабатывается только назначение бригад.")
    previous = row.status if row else None
    allowed = CREW_TRANSITIONS[row.status] if row else {"assigned"}
    if data.status not in allowed:
        raise HTTPException(422, "Invalid crew status transition")
    if row is None:
        row = CrewAssignment(
            attempt_id=attempt.id,
            response_id=response.id,
            crew_code=data.crew_code,
            snapshot=crew,
        )
        session.add(row)
    row.status, row.crew_number, row.comment = data.status, data.crew_number, data.comment
    # Only a valid student command counts; prepared assignments never start reaction timing.
    if attempt.settings_snapshot.get("delivery") == "dds-stream-v1":
        attempt.first_response_at = attempt.first_response_at or datetime.now(UTC)
    # All crew and service edits participate in one optimistic concurrency boundary.
    response.revision += 1
    await session.flush()
    await append_event(
        session,
        attempt.id,
        "dds.crew_changed",
        {
            **command,
            "command": command,
            "previous_status": previous,
            "service_id": str(response.service_id),
            "response_id": str(response.id),
            "assignment_id": str(row.id),
            "name": crew["name"],
        },
        actor=EventActor.STUDENT,
        actor_id=student_id,
        command_id=data.request_id,
    )
    await session.commit()
    return await attempt_read(session, attempt, preview=False)
