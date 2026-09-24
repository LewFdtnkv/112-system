from decimal import ROUND_HALF_UP, Decimal

GROUPS = {
    "dds_status": "Статусы ДДС по сообщениям задания",
    "dds_crew": "Номер наряда",
    "dds_assignment": "Назначение и результат работы бригад",
    "classification": "Тип и признаки происшествия",
    "notification": "Оповещение служб",
    "address": "Адрес происшествия",
    "caller": "Сведения о заявителе",
    "victims": "Количество пострадавших",
    "description": "Наличие описания (без оценки смысла)",
}


def field_group(path):
    if (
        path == "classifier_entry_id"
        or path.startswith("features.ekp.")
        or path.startswith("additional_fields.details.")
    ):
        return "classification"
    if path == "recipients":
        return "notification"
    if path.startswith("address"):
        return "address"
    if path.startswith("caller"):
        return "caller"
    if path in {"description", "address_text"}:
        return "description" if path == "description" else "address"
    return "victims"


def weighted_criteria(check, policy):
    grouped = {}
    for field in check.fields:
        if field.scored:
            grouped.setdefault(field_group(field.field), []).append(field)
    result = []
    for code, fields in grouped.items():
        maximum = Decimal(getattr(policy.weights, code, 10))
        correct = sum(field.status == "matched" for field in fields)
        points = (maximum * correct / len(fields)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        result.append(
            {
                "code": code,
                "label": GROUPS[code],
                "score": points,
                "max_score": maximum,
                "explanation": f"Совпало {correct} из {len(fields)} проверяемых полей.",
                "fields": fields,
            }
        )
    return result
