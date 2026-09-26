"""Ready-to-start learning formats, sharing the HTTP/database seed plan."""

from uuid import NAMESPACE_URL, uuid5

if __package__:
    from scripts.seed_dds import card_exercise
else:
    from seed_dds import card_exercise


async def populate_learning(state, create, group_id, student_id, source_cards, profile_id):
    prefix = state.data["prefix"]
    card_ids = []
    for index, source in enumerate(source_cards[:2], start=1):
        caller = ("Иван Учебный", "Анна Учебная")[index - 1]
        phone = f"+7 000 000-00-0{index}"
        address = {
            "country": "Россия",
            "region": "Москва",
            "locality": "Москва",
            "street": "Учебная улица",
            "house": str(index),
        }
        card_ids.append(
            await create(
                f"learning-card-{index}",
                "cards",
                source
                | {
                    "title": f"{prefix}: навыки — {source['title'].removeprefix(prefix + ': ')}",
                    "instructions": "Изучите учебную ситуацию и выполните действия своей роли.",
                    "dds_exercise": card_exercise(profile_id),
                    "caller_message": (
                        f"Меня зовут {caller}. Учебный номер для обратной связи: {phone}. "
                        "Страна — Россия, субъект — Москва. " + source["caller_message"]
                    ),
                    "data": source["data"]
                    | {
                        "caller_name": caller,
                        "caller_phone": phone,
                        "address_details": address,
                    },
                },
            )
        )

    scenarios = {}
    for role, label in (("operator_112", "112"), ("dds", "ДДС")):
        payload = {
            "title": f"{prefix}: {label} — учебные форматы",
            "role": role,
            "card_ids": card_ids,
        }
        if role == "dds":
            payload |= {
                "service_profile_id": profile_id,
                "instructions": (
                    "Работайте только с бригадами своей службы. Для реагирования нужен "
                    "учебный пожарный расчёт № 1; резервный расчёт не требуется. "
                    "Сообщения старшего расчёта находятся у бригады в нижней панели. "
                    "Статус службы не меняйте."
                ),
            }
        scenarios[role] = await create(f"learning-scenario-{role}", "scenarios", payload)

    lessons = {}
    for role, label, practice_skills, review_skills, objective in (
        (
            "operator_112",
            "112",
            ["address", "caller"],
            ["classification", "notification", "description"],
            (
                "Укажите адрес и сведения о заявителе по сообщению.",
                "Определите тип и признаки, выберите службы и передайте суть сообщения.",
            ),
        ),
        (
            "dds",
            "ДДС",
            ["dds_crews"],
            ["dds_response"],
            (
                "Назначьте необходимые по условию бригады своей службы.",
                "Обновите статусы подготовленных бригад по сведениям старшего расчёта.",
            ),
        ),
    ):
        lessons[role] = {}
        for kind, title, skills, level, goal in (
            (
                "introduction",
                "Освоение интерфейса",
                [],
                "solution",
                "Освойте рабочее место: выполняйте действия в подсвеченных элементах карточки.",
            ),
            (
                "practice",
                "Полная учебная ситуация",
                [],
                "explanation",
                "Выполните всю учебную ситуацию самостоятельно; при затруднении запросите помощь.",
            ),
            ("skill_practice", "Отработка навыков", practice_skills, "solution", objective[0]),
            ("review", "Повторение навыков", review_skills, "explanation", objective[1]),
            (
                "assessment",
                "Контрольное занятие",
                [],
                "none",
                "Выполните всю учебную ситуацию без подсказок.",
            ),
        ):
            lessons[role][kind] = await create(
                f"learning-lesson-{role}-{kind}",
                "lessons/start",
                {
                    "request_id": str(
                        uuid5(
                            NAMESPACE_URL,
                            f"source-demo/{prefix}/learning/{scenarios[role]}/{student_id}/{kind}",
                        )
                    ),
                    "group_id": group_id,
                    "student_id": student_id,
                    "scenario_version_id": scenarios[role],
                    "title": f"{prefix}: {label} — {title}",
                    "learning": {
                        "kind": kind,
                        "objective": goal,
                        "target_skills": skills,
                        "assistance": {"max_level": level},
                    },
                },
            )
    # No student commands: timers and prefilled attempts begin when the learner opens a card.
    return {"card_ids": card_ids, "scenario_ids": scenarios, "lessons": lessons}
