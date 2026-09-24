"""Human-readable, explicitly known ARM facts for generation."""

from app.schemas.card_flags import FLAG_LABELS


def facts(flags, count):
    return {FLAG_LABELS[k]: v for k, v in flags.items()} | (
        {"Количество пострадавших": count} if count is not None else {}
    )
