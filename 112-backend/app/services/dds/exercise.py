"""Validate and instantiate the card's DDS exercise without crediting prepared work."""

from datetime import timedelta

from fastapi import HTTPException

from app.models import CrewAssignment
from app.models.enums import EventActor
from app.schemas.dds_exercise import DDSExercise
from app.services.audit import append_event
from app.services.authoring.catalog_access import published_profile
from app.services.service_profiles import profile_read


async def validate_profile(session, exercise: DDSExercise, recipient_ids):
    profile = await published_profile(session, exercise.service_profile_id)
    if str(profile.service_id) not in {str(i) for i in recipient_ids}:
        raise HTTPException(422, "Служба профиля ДДС должна быть получателем карточки.")
    data = await profile_read(session, profile)
    active = {c.code: c for c in data.crews if c.is_active}
    codes = {
        c.crew_code for c in exercise.initial_crews + exercise.required_crews + exercise.messages
    }
    if not codes <= active.keys():
        raise HTTPException(
            422, "В истории, сообщениях и целях укажите действующие бригады выбранного профиля."
        )
    initial = {c.crew_code: c.history[-1].status for c in exercise.initial_crews}
    if exercise.crew_calls_required:
        contacts = {c.code: c for c in data.contacts}
        for goal in exercise.required_crews:
            if goal.status == "cancelled" or initial.get(goal.crew_code) not in (None, "cancelled"):
                continue
            contact = contacts.get(active[goal.crew_code].contact_code)
            if not contact or contact.target_service_id != profile.service_id:
                raise HTTPException(
                    422,
                    "Для назначения бригады с обязательным звонком нужен контакт "
                    "руководителя своей службы.",
                )
    return profile


def policy_for(exercise):
    data = DDSExercise.model_validate(exercise)
    briefing = (
        "Вы приняли карточку в работу. Бригады уже работают: изучите их историю "
        "в нижней панели и обработайте новые сообщения."
        if data.initial_crews
        else "В вашу службу поступила карточка. Изучите сообщения в нижней панели "
        "и организуйте начальную работу необходимых бригад."
    )
    return {
        "workflow": "crews-v1",
        "crew_calls_required": data.crew_calls_required,
        "required_crews": [g.model_dump() for g in data.required_crews],
        "steps": [{"status": "completed", "message": briefing, "crew_number": None}],
        "card_exercise": data.model_dump(mode="json"),
    }


async def prepare_crews(session, attempt, response, profile, exercise, now):
    directory = {c["code"]: c for c in profile["crews"]}
    for initial in exercise["initial_crews"]:
        last = initial["history"][-1]
        code = initial["crew_code"]
        row = CrewAssignment(
            attempt_id=attempt.id,
            response_id=response.id,
            crew_code=code,
            snapshot=directory[code],
            status=last["status"],
            comment=last["comment"],
            crew_number=last["crew_number"],
            assigned_at=now - timedelta(seconds=initial["history"][0]["seconds_before_start"]),
        )
        session.add(row)
        await session.flush()
        for event in initial["history"]:
            await append_event(
                session,
                attempt.id,
                "dds.crew_changed",
                {
                    "crew_code": code,
                    "name": directory[code]["name"],
                    "status": event["status"],
                    "comment": event["comment"],
                    "crew_number": event["crew_number"],
                    "prepared": True,
                    "source_at": (
                        now - timedelta(seconds=event["seconds_before_start"])
                    ).isoformat(),
                },
                actor=EventActor.SIMULATION,
            )
