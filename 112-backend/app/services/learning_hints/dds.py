from app.services.dds_assessment import crew_goal_met
from app.services.learning_hints.policy import GOALS


def dds_task(read, goals):
    from app.schemas.dds import CREW_LABELS, CREW_TRANSITIONS

    crews = {c["crew_code"]: c for c in read.dds["crews"]}
    for goal in goals:
        crew = crews.get(goal["crew_code"])
        if not crew or crew["status"] == "cancelled" and goal["status"] != "cancelled":
            return (
                f"crew.{goal['crew_code']}.assign",
                "dds_crews",
                GOALS["dds_crews"],
                (
                    "Откройте карандаш отменённой бригады и возобновите её назначение."
                    if crew
                    else "Откройте свою службу в нижней панели и выберите «Назначить бригаду». "
                    "Сопоставьте профиль бригады со сведениями задания."
                ),
                f"Назначьте бригаду «{goal['name']}».",
            )
        if not crew_goal_met(crew, goal["status"]):
            # Shortest valid route to the configured goal, no service-status side effects.
            queue = [(crew["status"], [])]
            seen = set()
            route = []
            while queue:
                current, path = queue.pop(0)
                if current == goal["status"]:
                    route = path
                    break
                if current in seen:
                    continue
                seen.add(current)
                for status in sorted(CREW_TRANSITIONS[current]):
                    queue.append((status, path + [status]))
            if not route:
                return (
                    f"crew.{goal['crew_code']}.finished",
                    "submit",
                    GOALS["dds_response"],
                    f"У бригады «{goal['name']}» уже конечный статус. Он не соответствует заданию. "
                    f"Этот цикл нельзя исправить; завершите попытку и разберите результат.",
                    f"Цель бригады «{goal['name']}»: {CREW_LABELS[goal['status']]}.",
                )
            return (
                f"crew.{goal['crew_code']}.{crew['status']}",
                "dds_response",
                GOALS["dds_response"],
                f"Откройте карандаш бригады «{goal['name']}». "
                f"По сообщению сценария выберите следующий статус; комментарий необязателен.",
                f"Для бригады «{goal['name']}» следующий шаг: «{CREW_LABELS[route[0]]}». "
                f"Основание — сведения задания.",
            )
    expected = {g["crew_code"] for g in goals}
    for crew in crews.values():
        if crew["crew_code"] not in expected and crew["status"] != "cancelled":
            return (
                f"crew.extra.{crew['crew_code']}",
                "dds_crews",
                GOALS["dds_crews"],
                "В составе есть бригада, которая не требуется по условию. Проверьте назначение.",
                f"Отмените назначение «{crew['name']}», если её текущий статус допускает отмену."
                " Уже завершённую работу отменить нельзя; она останется в результате.",
            )
    return (
        "dds.submit",
        "submit",
        "Зафиксируйте результат обработки карточки.",
        "Нажмите «Завершить упражнение». Статусы служб остаются «Добавлена».",
        "Нажмите «Завершить упражнение».",
    )
