"""Resolve explicit/random ARM facts before the small model writes any text."""

from fastapi import HTTPException

from app.schemas.card_flags import FLAG_LABELS


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


def resolve_silent(p, rng):
    return {
        "noContact": True,
        "callDropped": p.call_dropped if p.call_dropped is not None else rng.random() < 0.05,
    }, None


def facts(flags, count):
    return {FLAG_LABELS[k]: v for k, v in flags.items()} | (
        {"Количество пострадавших": count} if count is not None else {}
    )
