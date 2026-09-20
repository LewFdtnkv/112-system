"""Deterministic field checks, separate from the teacher's professional assessment.

Only configured structured facts earn points (one per fact). Narrative differences
require review and never reduce the numeric score. Expected answers come exclusively
from the immutable scenario snapshot. This module is used only by teacher review.
"""

import re
import unicodedata

from app.schemas.lesson_evaluation import AutomaticCheck, FieldCheck
from app.schemas.student import StudentAttemptRead

ADDRESS_LABELS = {
    "country": "Страна",
    "region": "Субъект",
    "locality": "Населённый пункт",
    "district": "Округ",
    "area": "Район",
    "street": "Улица",
    "house": "Дом",
    "building": "Корпус",
    "structure": "Строение",
    "apartment": "Квартира",
    "entrance": "Подъезд",
    "floor": "Этаж",
    "doorCode": "Код двери",
    "object": "Объект",
    "description": "Уточнение адреса",
}


def display(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Да" if value else "Нет"
    return str(value)


def normalized(value, *, phone=False):
    value = unicodedata.normalize("NFKC", display(value)).casefold().replace("ё", "е")
    if phone:
        digits = re.sub(r"\D", "", value)
        return "7" + digits[1:] if len(digits) == 11 and digits.startswith("8") else digits
    return " ".join(value.split())


def summarize(fields: list[FieldCheck]) -> AutomaticCheck:
    scored = [f for f in fields if f.scored]
    earned = sum(f.status == "matched" for f in scored)
    return AutomaticCheck(
        fields=fields,
        matched=sum(f.status == "matched" for f in fields),
        missing=sum(f.status == "missing" for f in fields),
        different=sum(f.status == "different" for f in fields),
        needs_review=sum(f.status == "needs_review" for f in fields),
        earned_points=earned,
        possible_points=len(scored),
        score_percent=round(100 * earned / len(scored), 2) if scored else None,
    )


def check_fields(
    snapshot: dict, attempt: StudentAttemptRead, entry_label: str = ""
) -> AutomaticCheck:
    fields = []
    expected = snapshot.get("data") or {}
    actual = attempt.card.data.model_dump()

    def add(
        path,
        label,
        reference,
        answer,
        *,
        scored=True,
        phone=False,
        reference_text=None,
        answer_text=None,
    ):
        if reference is None or normalized(reference, phone=phone) == "":
            return
        if answer is None or normalized(answer, phone=phone) == "":
            status = "missing"
        elif normalized(reference, phone=phone) == normalized(answer, phone=phone):
            status = "matched"
        else:
            status = "different" if scored else "needs_review"
        fields.append(
            FieldCheck(
                field=path,
                label=label,
                expected=reference_text if reference_text is not None else display(reference),
                actual=answer_text if answer_text is not None else display(answer),
                status=status,
                scored=scored,
            )
        )

    add(
        "classifier_entry_id",
        "Тип происшествия (ЕКП)",
        snapshot.get("classifier_entry_id"),
        str(attempt.card.classifier_entry_id) if attempt.card.classifier_entry_id else None,
        reference_text=entry_label or "Тип из эталона",
        answer_text=f"{attempt.classifier_entry.code} — {attempt.classifier_entry.name}"
        if attempt.classifier_entry
        else "",
    )
    recipients = snapshot.get("recipients") or []
    if recipients:
        notified = attempt.notified_services
        add(
            "recipients",
            "Оповещённые службы",
            ",".join(sorted(str(r["service_id"]) for r in recipients)),
            ",".join(sorted(str(r.service_id) for r in notified)),
            reference_text=", ".join(r["name"] for r in recipients),
            answer_text=", ".join(r.name for r in notified),
        )
    add("caller_name", "ФИО заявителя", expected.get("caller_name"), actual.get("caller_name"))
    add(
        "caller_phone",
        "Телефон заявителя",
        expected.get("caller_phone"),
        actual.get("caller_phone"),
        phone=True,
    )
    address = expected.get("address_details") or {}
    for key, label in ADDRESS_LABELS.items():
        add(
            f"address_details.{key}",
            label,
            address.get(key),
            (actual.get("address_details") or {}).get(key),
            scored=key != "description",
        )
    if not any(
        address.get(key) not in (None, "") for key in ADDRESS_LABELS if key != "description"
    ):
        add(
            "address_text",
            "Адрес",
            expected.get("address_text"),
            actual.get("address_text"),
            scored=False,
        )
    add(
        "description",
        "Сообщение в карточке",
        expected.get("description"),
        actual.get("description"),
        scored=False,
    )
    add(
        "victim_details",
        "Сведения о пострадавших",
        expected.get("victim_details"),
        actual.get("victim_details"),
        scored=False,
    )
    add(
        "features.victimsCount",
        "Количество пострадавших",
        (expected.get("features") or {}).get("victimsCount"),
        (actual.get("features") or {}).get("victimsCount"),
    )
    feature_labels = {f["key"]: f["label"] for f in snapshot.get("feature_definitions", [])}
    reference_answers = (expected.get("features") or {}).get("ekp") or {}
    actual_answers = (actual.get("features") or {}).get("ekp") or {}
    if not isinstance(reference_answers, dict):
        reference_answers = {}
    if not isinstance(actual_answers, dict):
        actual_answers = {}
    for key, reference in reference_answers.items():
        if type(reference) is bool:
            add(
                f"features.ekp.{key}",
                f"Признак: {feature_labels.get(key, key)}",
                reference,
                actual_answers.get(key),
            )
    return summarize(fields)
