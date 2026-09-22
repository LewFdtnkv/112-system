"""Resolve explicit/random ARM facts before the small model writes any text."""

from fastapi import HTTPException

from app.schemas.card_flags import FLAG_LABELS

PARAMETERS = {
    "has_victims": "hasVictims",
    "refused_ambulance": "refusedAmbulance",
    "blocked": "blocked",
    "no_contact": "noContact",
    "call_dropped": "callDropped",
}


def silent_allowed(p):
    return (
        not any(
            getattr(p, key) is not None
            for key in (
                "classifier_entry_id",
                "gender",
                "age",
                "caller_name",
                "locality",
                "street",
                "house",
                "object",
                "caller_state",
                "victims_count",
            )
        )
        and not p.service_ids
        and not p.feature_answers
        and not any(getattr(p, k) is True for k in ("has_victims", "blocked", "refused_ambulance"))
    )


def is_silent(p, rng):
    if p.no_contact is True and not silent_allowed(p):
        raise HTTPException(
            422, "Молчаливый вызов несовместим с заданными сведениями о происшествии и заявителе."
        )
    return p.no_contact if p.no_contact is not None else silent_allowed(p) and rng.random() < 0.1


def resolve(p, rng, answers, definitions, *, silent=False):
    if silent:
        return {
            "noContact": True,
            "callDropped": p.call_dropped
            if p.call_dropped is not None
            else rng.choice([True, False]),
        }, None
    has_victims = p.has_victims
    linked = [f.key for f in definitions if f.key in {"injured", "victims"} and f.type == "boolean"]
    explicit = {p.feature_answers[k] for k in linked if k in p.feature_answers}
    if len(explicit) > 1:
        raise HTTPException(422, "Признаки ЕКП противоречат друг другу по наличию пострадавших.")
    if p.victims_count is not None:
        known = p.victims_count > 0
        if has_victims is not None and has_victims != known:
            raise HTTPException(422, "Количество пострадавших противоречит отметке «Пострадавшие».")
        has_victims = known
    if explicit:
        known = next(iter(explicit))
        if has_victims is not None and has_victims != known:
            raise HTTPException(422, "Отметка «Пострадавшие» противоречит выбранным признакам ЕКП.")
        has_victims = known
    if has_victims is None:
        has_victims = rng.choice([True, False])
    for k in linked:
        if k in answers:
            answers[k] = has_victims
    flags = {"hasVictims": has_victims, "noContact": False}
    for param in ("refused_ambulance", "blocked", "call_dropped"):
        value = getattr(p, param)
        flags[PARAMETERS[param]] = value if value is not None else rng.choice([True, False])
    count = (
        p.victims_count if p.victims_count is not None else rng.randint(1, 3) if has_victims else 0
    )
    return flags, count


def facts(flags, count):
    return {FLAG_LABELS[k]: v for k, v in flags.items()} | (
        {"Количество пострадавших": count} if count is not None else {}
    )
