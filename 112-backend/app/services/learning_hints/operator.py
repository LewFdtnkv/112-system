from app.services.catalog_rules import feature_is_visible
from app.services.field_evaluation import check_fields
from app.services.learning_hints.confirmation import field_token, is_free_text
from app.services.learning_hints.policy import GOALS
from app.services.learning_scope import field_skill, skills_for


def operator_task(source, read, confirmed=None):
    skills = skills_for(read.learning.model_dump(mode="json"))
    check = check_fields(source, read)
    # Type comes first: showing child answers before selecting their type is misleading.
    ordered = sorted(check.fields, key=lambda f: 0 if f.field == "classifier_entry_id" else 1)
    for field in ordered:
        # ARM records this information in description; there is no separate input.
        if field.field == "victim_details":
            continue
        if (
            confirmed is not None
            and field.field == "address_text"
            and (source.get("data", {}).get("address_details") or {}).get("description")
        ):
            # Both projections refer to the same descriptive-address input.
            continue
        skill = field_skill(field.field)
        if skill not in skills or skill == "notification":
            continue
        if confirmed is not None:
            manual = is_free_text(source, field)
            if manual:
                if field.actual.strip() and confirmed.get(field.field) == field_token(field.actual):
                    continue
            elif field.status == "matched":
                continue
        elif field.status == "matched" or (not field.scored and field.status != "missing"):
            continue
        if field.field.startswith("features.ekp."):
            from app.schemas.catalog_document import FeatureDefinition

            definition = next(
                (
                    f
                    for f in source.get("feature_definitions", [])
                    if f["key"] == field.field.rsplit(".", 1)[-1]
                ),
                None,
            )
            if definition and not feature_is_visible(
                FeatureDefinition.model_validate(definition),
                (read.card.data.features or {}).get("ekp", {}),
            ):
                continue
        reference = field.expected
        if field.field == "classifier_entry_id":
            reference = (
                source.get("classifier_entry", {}).get("display_name")
                or source.get("classifier_entry", {}).get("name")
                or "тип, указанный в условии"
            )
        reason = (
            "значение пока не заполнено"
            if field.status == "missing"
            else "значение отличается от данных учебной ситуации"
        )
        return (
            field.field,
            skill,
            "Зафиксируйте результат вызова, не придумывая неизвестных сведений."
            if (
                source.get("data", {})
                .get("additional_fields", {})
                .get("details", {})
                .get("noContact")
            )
            else GOALS[skill],
            f"Проверьте «{field.label}»: {reason}. "
            "Найдите соответствующие сведения в сообщении заявителя.",
            (
                f"По условию задачи правильный ответ в поле «{field.label}»: {reference}."
                if confirmed is not None
                else f"Для «{field.label}» в эталонном решении указано: {reference}."
            ),
        )
    if "notification" in skills:
        expected = {str(r["service_id"]) for r in source.get("recipients", [])}
        actual = {str(r.service_id) for r in read.recipient_services}
        if expected != actual:
            names = (
                ", ".join(r.get("short_name") or r["name"] for r in source.get("recipients", []))
                or "оповещение не требуется"
            )
            return (
                "recipients",
                "notification",
                GOALS["notification"],
                "Список служб отличается от учебной ситуации. "
                "Откройте выбор служб кнопкой «+» внизу карточки и проверьте получателей. "
                "Рекомендации ЕКП можно изменить.",
                f"Для этой ситуации эталонный список: {names}.",
            )
    return (
        "submit",
        "submit",
        GOALS["submit"],
        "Проверьте введённые сведения и нажмите «сохранить» внизу карточки. "
        "Это завершает заполнение и оповещает выбранные службы.",
        "Нажмите «сохранить» после проверки карточки.",
    )
