"""Select reachable, unfinished goals; LLM never decides recipients or statuses."""

import random

from fastapi import HTTPException

from app.domain.dds_workflow import PATH, required_path
from app.schemas.dds_exercise import DDSExercise
from app.services.authoring.catalog_access import published_profile
from app.services.dds.exercise import validate_profile
from app.services.service_profiles import profile_read

MEANINGS = {
    "accepted": "Руководитель подтвердил принятие карточки бригадой в работу.",
    "not_accepted": "Бригада не приняла карточку.",
    "refused": "Бригада отказывается продолжать принятые работы.",
    "assigned": "Назначить бригаду для работы по поступившей карточке.",
    "responding": "Бригада выехала к месту происшествия.",
    "arrived": "Бригада прибыла к месту происшествия.",
    "in_progress": "Бригада приступила к работам по карточке.",
    "completed": "Бригада завершила работы по карточке.",
    "cancelled": "Поручение отменить назначение этой бригады. ",
}


async def plan(session, card, recipients, request, seed):
    profile = await published_profile(session, request.service_profile_id)
    directory = await profile_read(session, profile)
    crews = [c for c in directory.crews if c.is_active]
    if (
        request.crew_calls_required
        and request.initial_status in (None, "unassigned")
        and request.target_status != "cancelled"
    ):
        contacts = {c.code for c in directory.contacts if c.target_service_id == profile.service_id}
        crews = [c for c in crews if c.contact_code in contacts]
    if request.crew_codes:
        if len(set(request.crew_codes)) != len(request.crew_codes):
            raise HTTPException(422, "Бригады не должны повторяться.")
        crews = [c for c in crews if c.code in request.crew_codes]
        if len(crews) != len(request.crew_codes):
            raise HTTPException(422, "Выберите действующие бригады с подходящими контактами.")
    if not crews:
        raise HTTPException(422, "В профиле нет подходящих действующих бригад.")
    rng = random.Random(seed)
    if not request.crew_codes:
        crews = rng.sample(crews, 1)
    if (
        request.target_status in {"not_accepted", "refused", "cancelled"}
        and not (request.reason or "").strip()
    ):
        from app.core.validation import reject_field

        reject_field("reason", "Укажите причину отказа или отмены — она станет частью условия.")
    # Validate every fixed combination before enqueueing, not inside the worker.
    combinations = [
        (start, end)
        for start in ["unassigned", *PATH[:-1]]
        for end in ([request.target_status] if request.target_status else PATH)
        if (request.initial_status is None or start == request.initial_status)
        and (request.target_status is None or end == request.target_status)
        and (
            (end == "cancelled")
            or (end == "not_accepted" and start in {"unassigned", "assigned"})
            or (end == "refused")
            or (
                end in PATH
                and PATH.index(end) > (-1 if start == "unassigned" else PATH.index(start))
            )
        )
    ]
    if not combinations:
        raise HTTPException(
            422,
            [
                {
                    "loc": ["body", "target_status"],
                    "msg": "Учебная цель должна быть позже исходного статуса бригады.",
                    "type": "value_error",
                }
            ],
        )
    initial, goals, slots = [], [], []
    for crew in crews:
        start, end = rng.choice(combinations)
        done = [] if start == "unassigned" else PATH[: PATH.index(start) + 1]
        remaining = (
            PATH[len(done) : PATH.index(end) + 1]
            if end in PATH
            else [status for status in required_path(end) if status not in done]
        )
        history = []
        for i, status in enumerate(done):
            history.append(
                {
                    "status": status,
                    "seconds_before_start": (len(done) - i) * 120,
                    "comment": "Подготовка текста",
                }
            )
            slots.append(
                {
                    "key": f"h:{crew.code}:{i}",
                    "crew": crew.name,
                    "status": status,
                    "kind": "history",
                    "meaning": MEANINGS[status]
                    if status != "assigned"
                    else "Бригада уже назначена предыдущим оператором.",
                }
            )
        if history:
            initial.append({"crew_code": crew.code, "history": history})
        goals.append({"crew_code": crew.code, "status": end})
        for i, status in enumerate(remaining):
            slots.append(
                {
                    "key": f"m:{crew.code}:{i}",
                    "crew": crew.name,
                    "status": status,
                    "kind": "message",
                    "meaning": MEANINGS[status]
                    + (
                        f" Причина: {request.reason}"
                        if status in {"not_accepted", "refused", "cancelled"}
                        else ""
                    ),
                }
            )
    exercise = DDSExercise.model_validate(
        {
            "service_profile_id": profile.id,
            "initial_crews": initial,
            "required_crews": goals,
            "messages": [{"crew_code": c.code, "message": "Подготовка текста"} for c in crews],
            "crew_calls_required": request.crew_calls_required,
        }
    )
    await validate_profile(session, exercise, recipients)
    return {
        "exercise": exercise.model_dump(mode="json"),
        "slots": slots,
        "situation": {
            "title": card.title,
            "data": {
                key: card.data.get(key)
                for key in ("description", "address_text", "features", "additional_fields")
            },
        },
        "profile": {"name": profile.name, "responsibility": directory.responsibility},
    }
