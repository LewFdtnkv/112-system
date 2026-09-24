from sqlalchemy import func, select

from app.models import (
    AttemptEvent,
    CrewAssignment,
    ResponseEvent,
)
from app.schemas.dds import CREW_TRANSITIONS, STATUS_LABELS, TRANSITIONS


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
    status_times = dict(
        (
            await session.execute(
                select(ResponseEvent.response_id, func.max(AttemptEvent.occurred_at))
                .join(AttemptEvent, ResponseEvent.attempt_event_id == AttemptEvent.id)
                .where(ResponseEvent.attempt_id == attempt.id)
                .group_by(ResponseEvent.response_id)
            )
        ).all()
    )
    crews = await crew_context(session, attempt)
    requirements = attempt.settings_snapshot["dds_policy"].get("required_crews", [])
    crew_workflow = attempt.settings_snapshot["dds_policy"].get("workflow") == "crews-v1"
    return {
        "workflow": "crews-v1" if crew_workflow else "service-v1",
        "crews": crews,
        "crew_goals": []
        if crew_workflow
        else [
            {
                **r,
                "name": next(
                    c["name"] for c in profile.get("crews", []) if c["code"] == r["crew_code"]
                ),
            }
            for r in requirements
        ],
        "profile": profile,
        "goal": "Обработать бригады по сведениям задания"
        if crew_workflow
        else STATUS_LABELS[attempt.settings_snapshot["dds_policy"]["steps"][-1]["status"]],
        "response_id": str(own.id),
        "revision": own.revision,
        "status": own.status.value,
        "sent_at": own.sent_at.isoformat(),
        "first_decision_at": (
            attempt.first_response_at.isoformat() if attempt.first_response_at else None
        )
        if attempt.settings_snapshot.get("delivery") == "dds-stream-v1"
        else (own.first_decision_at.isoformat() if own.first_decision_at else None),
        "reaction_norm_seconds": attempt.settings_snapshot.get("response_norm_seconds")
        if attempt.settings_snapshot.get("delivery") == "dds-stream-v1"
        else None,
        "reaction_end_at": (attempt.first_response_at or attempt.ended_at).isoformat()
        if (attempt.first_response_at or attempt.ended_at)
        else None,
        "crew_number": own.crew_number,
        "comment": own.comment,
        "allowed_statuses": []
        if crew_workflow
        else sorted(TRANSITIONS.get(own.status.value, set())),
        "can_finish": True
        if crew_workflow
        else bool(history)
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
                "added_at": r.added_at.isoformat(),
                "received_at": r.received_at.isoformat() if r.received_at else None,
                "status_updated_at": (
                    status_times.get(r.id) or r.received_at or r.sent_at or r.added_at
                ).isoformat(),
            }
            for r in responses
        ],
    }


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
