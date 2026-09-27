"""Translate shared domain refusals into actionable errors for the card editor.

Keep the existing contracts of student commands and scenario authoring unchanged.
Only known, safe messages are exposed; internal or unexpected errors stay untouched.
"""

ERRORS = {
    "Classifier version not found": (
        "classifier_version_id",
        "Версия ЕКП больше недоступна. Выберите другую.",
    ),
    "A published classifier version is required": (
        "classifier_version_id",
        "Выберите опубликованную версию ЕКП.",
    ),
    "Service profile not found": (
        "dds_exercise.service_profile_id",
        "Профиль ДДС больше недоступен. Выберите другой.",
    ),
    "An active service and published profile are required": (
        "dds_exercise.service_profile_id",
        "Выберите опубликованный профиль действующей службы.",
    ),
    "The incident code must belong to the selected classifier": (
        "classifier_entry_id",
        "Выберите тип происшествия из выбранной версии ЕКП.",
    ),
    "Address is required for an incident requiring notification": (
        "data.address_text",
        "Адрес происшествия: укажите адрес для оповещения служб.",
    ),
    "The incident code has no prepared service routes": (
        "classifier_entry_id",
        "Для этого типа происшествия не настроены маршруты. Выберите другой тип или "
        "исправьте справочник ЕКП.",
    ),
    "Recipients must follow the selected classifier routes": (
        "recipient_service_ids",
        "Обновите список служб по рекомендациям ЕКП или включите ручной выбор служб.",
    ),
    "Every recipient must be an existing active service": (
        "recipient_service_ids",
        "В списке есть недоступная служба. Удалите её и выберите действующую.",
    ),
    "Служба профиля ДДС должна быть получателем карточки.": (
        "dds_exercise.service_profile_id",
        "Службы выбранного профиля ДДС нет среди получателей карточки. Добавьте её в "
        "список служб в общих данных или выберите профиль одной из выбранных служб.",
    ),
    "Для карточки ДДС нужна служба-получатель.": (
        "dds_exercise",
        "Молчаливый вызов нельзя использовать для ДДС: отключите подготовку карточки "
        "для ДДС или измените отметку «Нет контакта».",
    ),
    "В истории, сообщениях и целях укажите действующие бригады выбранного профиля.": (
        "dds_exercise",
        "В истории, сообщениях и целях есть недоступная бригада. Заново выберите "
        "профиль ДДС и настройте действующие бригады.",
    ),
    "Для назначения бригады с обязательным звонком нужен контакт руководителя своей службы.": (
        "dds_exercise.crew_calls_required",
        "Для обязательного звонка у бригады должен быть контакт руководителя своей "
        "службы. Настройте контакт в профиле или отключите обязательный звонок.",
    ),
    "Число пострадавших не соответствует отметке «Пострадавшие».": (
        "data.features.victimsCount",
        "Количество пострадавших должно соответствовать отметке «Пострадавшие».",
    ),
    "Наличие пострадавших не согласовано с признаками ЕКП.": (
        "data.features.ekp",
        "Признаки происшествия противоречат отметке «Пострадавшие». Укажите одинаковые сведения.",
    ),
    "Invalid classifier answers": ("data.features.ekp", "Заново заполните признаки происшествия."),
    "Unknown classifier feature": (
        "data.features.ekp",
        "Состав признаков изменился. Заново выберите тип происшествия и заполните его признаки.",
    ),
    "Answers for hidden classifier fields are not allowed": (
        "data.features.ekp",
        "В карточке остались ответы для скрытых признаков. Заново выберите тип "
        "происшествия и заполните его признаки.",
    ),
}


def field_error(detail, entry=None):
    if not isinstance(detail, str):
        return None
    issue = ERRORS.get(detail)
    if issue is None and entry:
        for feature in entry.conditions.get("features", []):
            label = feature["label"]
            if detail == f"Answer required feature: {label}":
                issue = (f"data.features.ekp.{feature['key']}", f"Заполните признак «{label}».")
            elif detail == f"Invalid answer for feature: {label}":
                issue = (
                    f"data.features.ekp.{feature['key']}",
                    f"Проверьте значение признака «{label}».",
                )
    if issue is None:
        return None
    path, message = issue
    return [{"loc": ["body", *path.split(".")], "type": "card_constraint", "msg": message}]
