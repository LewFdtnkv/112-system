"""Exercise scope, prepared fields and assessable work share one mapping."""

from copy import deepcopy

from fastapi import HTTPException

from app.schemas.student import DraftData

CARD_SKILLS = {"address", "caller", "classification", "notification", "description"}
DATA_KEYS = {
    "address": {"address_text", "address_details"},
    "caller": {"caller_name", "caller_phone", "caller_details"},
    "description": {"description", "victim_details"},
}
DETAIL_KEYS = {
    "caller": {"callerStatus", "callerGender", "callerAge", "foreignLanguage"},
    "classification": {
        "classificationDescription",
        "clarifications",
        "hasVictims",
        "noContact",
        "callDropped",
        "blocked",
        "refusedAmbulance",
    },
}


def focused(policy):
    return policy.get("kind") in {"skill_practice", "review"}


def skills_for(policy, role="operator_112"):
    return (
        set(policy.get("target_skills", []))
        if focused(policy)
        else ({"dds_crews", "dds_response"} if role == "dds" else CARD_SKILLS)
    )


def field_skill(path):
    if (
        path == "classifier_entry_id"
        or path.startswith("features.")
        or path.startswith("additional_fields.details.")
    ):
        return "classification"
    if path == "recipients":
        return "notification"
    if path.startswith("address"):
        return "address"
    if path.startswith("caller"):
        return "caller"
    return "description"


def validate_exercise(policy, scenario, cards):
    skills = skills_for(policy.model_dump(mode="json"), scenario.role)
    if scenario.role == "dds":
        targets = (scenario.completion_rules.get("dds") or {}).get("required_crews", [])
        if not targets:
            raise HTTPException(422, "Для занятия ДДС укажите в сценарии бригады и цели их работы.")
        if (
            focused(policy.model_dump(mode="json"))
            and "dds_response" in skills
            and all(t["status"] == "assigned" for t in targets)
        ):
            raise HTTPException(422, "Для отработки статусов нужна цель после назначения бригады.")
        return
    if not focused(policy.model_dump(mode="json")):
        return
    for card in cards:
        data = card.snapshot.get("data", {})
        for skill in skills:
            present = {
                "address": bool(
                    data.get("address_text") or any((data.get("address_details") or {}).values())
                ),
                "caller": bool(data.get("caller_name") or data.get("caller_phone")),
                "classification": bool(
                    card.snapshot.get("classifier_entry_id")
                    or data.get("additional_fields", {}).get("details", {}).get("noContact")
                ),
                "notification": bool(card.snapshot.get("recipients")),
                "description": bool(data.get("description")),
            }[skill]
            if not present:
                raise HTTPException(
                    422,
                    f"Карточка «{card.snapshot.get('title', 'Без названия')}» "
                    f"не содержит данных для навыка {skill}. "
                    "Выберите другой сценарий или дополните карточку.",
                )


def prepared_card(snapshot, policy):
    skills = skills_for(policy)
    data = DraftData.model_validate(snapshot.get("data", {})).model_dump(mode="json")
    # Removing selected fields from a complete source cannot satisfy their exercise.
    for skill, keys in DATA_KEYS.items():
        if skill in skills:
            for key in keys:
                data[key] = None
    if "classification" in skills:
        data["features"] = None
    extra = deepcopy(data["additional_fields"])
    if "address" in skills:
        extra.pop("location", None)
    for skill, keys in DETAIL_KEYS.items():
        if skill in skills:
            extra["details"] = {k: v for k, v in extra.get("details", {}).items() if k not in keys}
    if "description" in skills:
        extra.pop("operatorAction", None)
    data["additional_fields"] = extra
    return {
        **data,
        "classifier_entry_id": None
        if "classification" in skills
        else snapshot["classifier_entry_id"],
        # Explicit empty selection prevents EKP from doing the notification exercise.
        "recipient_service_ids": []
        if "notification" in skills
        else [r["service_id"] for r in snapshot.get("recipients", [])],
    }


def constrain_draft(attempt, card, payload):
    """Project submitted data onto editable fields. Prepared facts never change via API."""
    if not attempt.settings_snapshot.get("exercise_scope"):
        return payload
    skills = set(attempt.settings_snapshot["exercise_scope"])
    saved = DraftData.model_validate(card).model_dump(mode="json")
    incoming = payload.data.model_dump(mode="json")
    for skill, keys in DATA_KEYS.items():
        if skill not in skills:
            for key in keys:
                incoming[key] = saved[key]
    if "classification" not in skills:
        incoming["features"] = saved["features"]
        payload.classifier_entry_id = card.classifier_entry_id
    if "notification" not in skills:
        payload.recipient_service_ids = card.recipient_service_ids
    extra = deepcopy(saved["additional_fields"])
    candidate = incoming["additional_fields"]
    if "address" in skills:
        extra["location"] = candidate.get("location")
    if "description" in skills:
        extra["operatorAction"] = candidate.get("operatorAction", "")
    details = dict(extra.get("details", {}))
    for skill, keys in DETAIL_KEYS.items():
        if skill in skills:
            for key in keys:
                if key in candidate.get("details", {}):
                    details[key] = candidate["details"][key]
                else:
                    details.pop(key, None)
    extra["details"] = details
    incoming["additional_fields"] = extra
    payload.data = DraftData.model_validate(incoming)
    return payload


def scoped_check(check, read):
    from app.services.field_evaluation import summarize

    if read.exercise_scope is None:
        return check
    fields = [f for f in check.fields if field_skill(f.field) in read.exercise_scope]
    # Free text is not semantically graded. A selected text exercise checks presence only.
    for f in fields:
        if not f.scored and (f.field == "description" or f.field == "address_text"):
            f = f.model_copy()
            f.label += " (наличие; смысл требует проверки)"
            f.scored = True
            f.status = "matched" if f.actual.strip() else "missing"
            fields = [f if old.field == f.field else old for old in fields]
    return summarize(fields)
