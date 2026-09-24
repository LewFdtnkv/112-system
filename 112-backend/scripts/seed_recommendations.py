"""Completed study evidence through the same public commands as a real learner."""

from copy import deepcopy
from uuid import NAMESPACE_URL, UUID, uuid5


async def populate_recommendations(gateway, state, create, student_id, source_cards, count):
    if count == 0:
        return {"card_ids": [], "lesson_ids": [], "completed_cards": 0}
    if not 3 <= count <= 30:
        raise ValueError("Для рекомендаций нужно 3–30 карточек или 0 для отключения")
    prefix = state.data["prefix"]
    cards, definitions = [], []
    for i in range(count):
        source = deepcopy(source_cards[i % 2])
        address = {
            "country": "Россия",
            "region": "Москва",
            "locality": "Москва",
            "street": "Учебная улица",
            "house": str(i + 1),
            "building": "2",
        }
        line = f"Москва, Учебная улица, дом {i + 1}, корпус 2"
        source.update(
            title=f"{prefix}: история обучения {i + 1}",
            caller_message=f"Адрес: {line}. {source['data']['description']}",
        )
        source["data"].update(address_text=line, address_details=address)
        cards.append(await create(f"advice-card-{i}", "cards", source))
        definitions.append(source)
    lessons = []
    for batch in range((count + 1) // 2):
        scenario = await create(
            f"advice-scenario-{batch}",
            "scenarios",
            {
                "title": f"{prefix}: история навыков {batch + 1}",
                "role": "operator_112",
                "card_ids": cards[batch * 2 : batch * 2 + 2],
            },
        )
        lessons.append(
            await create(
                f"advice-lesson-{batch}",
                "lessons/start",
                {
                    "request_id": str(
                        uuid5(NAMESPACE_URL, f"study-advice/{student_id}/{scenario}")
                    ),
                    "student_ids": [student_id],
                    "scenario_version_id": scenario,
                    "title": f"{prefix}: результаты для рекомендаций {batch + 1}",
                    "learning": {
                        "kind": "skill_practice",
                        "target_skills": ["address", "classification"],
                        "assistance": {"max_level": "none"},
                    },
                },
            )
        )
    student = gateway.dds()  # Shared authentication/start/lesson protocol, operator commands below.
    await student.use_student(state.data["accounts"]["student"])
    for batch, lesson_id in enumerate(lessons):
        work = await student.lesson(lesson_id)
        for pos, assignment in enumerate(work["assignments"]):
            if assignment["status"] == "completed":
                continue
            attempt = await student.start(assignment["id"])
            i = batch * 2 + pos
            source = definitions[i]
            data = deepcopy(source["data"])
            # Four of six examples omit the house/building; classification remains correct.
            if i % 3 != 2:
                data["address_details"]["house"] = ""
                data["address_details"]["building"] = ""
                data["address_text"] = "Москва, Учебная улица"
            payload = {
                "revision": attempt["card"]["revision"],
                "classifier_entry_id": source["classifier_entry_id"],
                "data": data,
            }
            if hasattr(student, "session"):
                from app.schemas.student import CardSubmit, DraftSave
                from app.services.student.commands import save_card, submit_card

                saved = await save_card(
                    student.session,
                    UUID(attempt["id"]),
                    student.student_id,
                    DraftSave.model_validate(payload),
                )
                await submit_card(
                    student.session,
                    UUID(attempt["id"]),
                    student.student_id,
                    CardSubmit(revision=saved.card.revision),
                )
            else:
                saved = student.student.request(
                    "PUT", f"student/attempts/{attempt['id']}/card", payload
                )
                student.student.request(
                    "POST",
                    f"student/attempts/{attempt['id']}/submit",
                    {"revision": saved["card"]["revision"]},
                )
    await student.logout()
    return {"card_ids": cards, "lesson_ids": lessons, "completed_cards": count}
