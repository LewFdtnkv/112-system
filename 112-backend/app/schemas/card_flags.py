"""Known ARM flags inside existing JSON fields; absent reference flags are ungraded."""

from pydantic import BaseModel, ConfigDict, StrictBool

FLAG_LABELS = {
    "hasVictims": "Пострадавшие",
    "refusedAmbulance": "Нет на месте / Отказ от скорой",
    "blocked": "Нет доступа / Заблокированные",
    "noContact": "Нет контакта",
    "callDropped": "Срыв звонка",
}


class CardFlags(BaseModel):
    model_config = ConfigDict(extra="ignore")
    hasVictims: StrictBool | None = None
    refusedAmbulance: StrictBool | None = None
    blocked: StrictBool | None = None
    noContact: StrictBool | None = None
    callDropped: StrictBool | None = None


def flags(data):
    extra = data.get("additional_fields") if isinstance(data, dict) else data.additional_fields
    return (extra or {}).get("details", {})


def validate_flags(value):
    details = value.get("details", {})
    if not isinstance(details, dict):
        raise ValueError("Сведения карточки должны быть объектом")
    CardFlags.model_validate(details)
    return value


def validate_count(value):
    if value and value.get("victimsCount") is not None:
        count = value["victimsCount"]
        if type(count) is not int or not 0 <= count <= 100000:
            raise ValueError("Количество пострадавших — целое число от 0 до 100000")
    return value


def check_silent(data, entry_id, recipients):
    """Only facts a silent call can actually provide; description records observations."""
    from fastapi import HTTPException

    d = data if isinstance(data, dict) else data.model_dump()
    f = flags(d)
    if not f.get("noContact"):
        return
    if (
        entry_id
        or recipients
        or d.get("address_text")
        or any((d.get("address_details") or {}).values())
        or d.get("caller_name")
        or (d.get("additional_fields") or {}).get("location")
        or any(f.get(k) for k in ("callerGender", "callerAge", "callerStatus"))
        or any(
            v
            for k, v in (d.get("caller_details") or {}).items()
            if k not in {"callerId", "provided", "onSite"}
        )
        or (d.get("features") or {}).get("ekp")
        or (d.get("features") or {}).get("victimsCount") is not None
        or any(f.get(k) for k in ("hasVictims", "blocked", "refusedAmbulance"))
    ):
        raise HTTPException(
            422,
            "Молчаливый вызов: тип, адрес, личность, пострадавшие и службы "
            "неизвестны. Уберите эти сведения.",
        )


def check_consistency(data):
    from fastapi import HTTPException

    d = data if isinstance(data, dict) else data.model_dump()
    f = flags(d)
    count = (d.get("features") or {}).get("victimsCount")
    if count is not None and f.get("hasVictims") is not None and (count > 0) != f["hasVictims"]:
        raise HTTPException(422, "Число пострадавших не соответствует отметке «Пострадавшие».")
    for key in ("injured", "victims"):
        value = ((d.get("features") or {}).get("ekp") or {}).get(key)
        if type(value) is bool and f.get("hasVictims") is not None and value != f["hasVictims"]:
            raise HTTPException(422, "Наличие пострадавших не согласовано с признаками ЕКП.")
