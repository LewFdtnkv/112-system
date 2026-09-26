from fastapi import HTTPException
from sqlalchemy import select

from app.models import (
    IncidentCard,
    ServiceProfile,
    ServiceResponse,
)
from app.models.enums import (
    CardOrigin,
    CardStatus,
    EventActor,
    ResponseStatus,
)
from app.schemas.dds import DDSPolicy
from app.services.audit import append_event
from app.services.learning_scope import focused, skills_for
from app.services.service_profiles import profile_read


async def initialize(session, attempt, scenario, source, now):
    exercise = source.snapshot.get("dds_exercise")
    if exercise:
        from app.services.dds.exercise import policy_for

        raw = policy_for(exercise)
    else:
        raw = scenario.completion_rules.get("dds")
    if not raw:
        raise HTTPException(409, "DDS scenario requires configured exercise steps")
    policy = DDSPolicy.model_validate({k: v for k, v in raw.items() if k != "card_exercise"})
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
    if exercise:
        from app.services.dds.exercise import prepare_crews

        response = await session.scalar(
            select(ServiceResponse).where(
                ServiceResponse.attempt_id == attempt.id,
                ServiceResponse.service_id == profile.service_id,
            )
        )
        await prepare_crews(session, attempt, response, profile_data, exercise, now)
        attempt.settings_snapshot = attempt.settings_snapshot | {"dds_policy": raw}
    if attempt.settings_snapshot.get("learning_engine"):
        from app.models import CrewAssignment

        learning = attempt.settings_snapshot["learning"]
        skills = skills_for(learning, "dds")
        effective = (raw if exercise else policy.model_dump(mode="json")) | {"workflow": "crews-v1"}
        if "dds_response" not in skills:
            prepared = {
                c["crew_code"]: c["history"][-1]["status"]
                for c in (exercise or {}).get("initial_crews", [])
            }
            effective["required_crews"] = [
                {**r, "status": "cancelled" if r["status"] == "cancelled" else "assigned"}
                for r in effective["required_crews"]
                if prepared.get(r["crew_code"]) in (None, "cancelled") or r["status"] == "cancelled"
            ]
        attempt.settings_snapshot = attempt.settings_snapshot | {"dds_policy": effective}
        if focused(learning):
            attempt.settings_snapshot = attempt.settings_snapshot | {
                "exercise_scope": sorted(skills)
            }
        if "dds_crews" not in skills:
            response = await session.scalar(
                select(ServiceResponse).where(
                    ServiceResponse.attempt_id == attempt.id,
                    ServiceResponse.service_id == profile.service_id,
                )
            )
            for goal in effective["required_crews"]:
                if exercise and goal["crew_code"] in {
                    c["crew_code"] for c in exercise["initial_crews"]
                }:
                    continue
                crew = next(c for c in profile_data["crews"] if c["code"] == goal["crew_code"])
                session.add(
                    CrewAssignment(
                        attempt_id=attempt.id,
                        response_id=response.id,
                        crew_code=crew["code"],
                        snapshot=crew,
                        status="assigned",
                        comment="",
                    )
                )
                await append_event(
                    session,
                    attempt.id,
                    "dds.crew_changed",
                    {
                        "crew_code": crew["code"],
                        "name": crew["name"],
                        "status": "assigned",
                        "crew_number": None,
                        "comment": "Подготовлено для отработки статусов",
                        "prepared": True,
                    },
                    actor=EventActor.SIMULATION,
                )
        await append_event(
            session,
            attempt.id,
            "dds.information",
            {"step": 0, "message": "\n\n".join(step.message for step in policy.steps)},
            actor=EventActor.SIMULATION,
        )
    else:
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
