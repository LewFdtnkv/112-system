"""Read-only evidence shared by DDS assessment and telephone UI; no call control imports."""

from sqlalchemy import select

from app.models import CrewAssignment, TrainingCall
from app.services.dds.evidence import initial_codes, prepared_assignment
from app.services.learning_scope import skills_for


def required(attempt):
    return bool(
        attempt.settings_snapshot.get("dds_policy", {}).get("crew_calls_required")
        and "dds_crews" in skills_for(attempt.settings_snapshot.get("learning", {}), "dds")
    )


def assignment_cycle(crew):
    events = [e for e in crew["history"] if e["status"] == "assigned"]
    return events[-1]["id"] if events else crew["id"]


async def notifications(session, attempt, crews):
    if not required(attempt):
        return []
    calls = list(
        await session.scalars(
            select(TrainingCall).where(
                TrainingCall.attempt_id == attempt.id, TrainingCall.dialogue.is_not(None)
            )
        )
    )
    directory = {c["code"]: c for c in attempt.settings_snapshot["service_profile"]["crews"]}
    assigned = {c["crew_code"]: c for c in crews}
    result = []
    # Student-visible progress must not reveal which unselected crews the answer key expects.
    for code, crew in assigned.items():
        if crew["status"] == "cancelled" or (
            code in initial_codes(attempt.settings_snapshot["dds_policy"])
            and prepared_assignment(crew)
        ):
            continue
        successful = next(
            (
                c
                for c in calls
                if crew
                and c.dialogue
                and c.dialogue.get("crew_code") == code
                and c.dialogue.get("assignment_id") == crew["id"]
                and c.dialogue.get("cycle") == assignment_cycle(crew)
                and c.dialogue.get("phase") == "acknowledged"
                and c.direction == "outgoing"
                and c.transport == "manual"
                and c.connected_at is not None
                and c.ended_at is not None
                and (attempt.ended_at is None or c.ended_at <= attempt.ended_at)
            ),
            None,
        )
        result.append(
            {
                "crew_code": code,
                "name": directory[code]["name"],
                "contact_code": directory[code].get("contact_code"),
                "completed": successful is not None,
                "call_id": str(successful.id) if successful else None,
            }
        )
    return result


async def selected_crew(session, attempt, contact_key, crew_code):
    from fastapi import HTTPException

    if not crew_code:
        raise HTTPException(422, "Выберите бригаду для оповещения")
    row = await session.scalar(
        select(CrewAssignment).where(
            CrewAssignment.attempt_id == attempt.id, CrewAssignment.crew_code == crew_code
        )
    )
    if not row or row.status == "cancelled" or row.snapshot.get("contact_code") != contact_key:
        raise HTTPException(422, "Сначала назначьте бригаду с этим контактом")
    # Compare against the latest assignment cycle, including re-assignment after cancellation.
    from app.models import AttemptEvent

    event = await session.scalar(
        select(AttemptEvent)
        .where(
            AttemptEvent.attempt_id == attempt.id,
            AttemptEvent.kind == "dds.crew_changed",
            AttemptEvent.payload["crew_code"].astext == crew_code,
            AttemptEvent.payload["status"].astext == "assigned",
        )
        .order_by(AttemptEvent.sequence.desc())
        .limit(1)
    )
    return {
        "crew_code": crew_code,
        "assignment_id": str(row.id),
        "cycle": str(event.id if event else row.id),
    }
