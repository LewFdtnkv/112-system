"""Deterministic, scenario-aware assistance. Never decides that a pause is an error."""

from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select

from app.models import Assignment, Attempt, AttemptEvent, ScenarioCard
from app.schemas.learning import HintRead, LearningHint
from app.services.audit import append_event
from app.services.learning_scope import field_skill, skills_for

AUTO_HINT_DELAY_SECONDS = 45
LEVELS = ["none", "goal", "explanation", "solution"]
GOALS = {
    "address": (
        "Уточните место происшествия: по карточке должно быть понятно, куда направить помощь."
    ),
    "caller": "Проверьте сведения о заявителе и возможность связаться с ним по данным условия.",
    "classification": "Отразите известные обстоятельства происшествия и результат разговора.",
    "notification": (
        "Определите, какие службы должны получить карточку, и проверьте список оповещения."
    ),
    "description": (
        "Зафиксируйте существенные сведения сообщения, чтобы принимающая служба поняла ситуацию."
    ),
    "submit": (
        "Заполнение ещё не завершено сохранением. Проверьте карточку и передайте её на обработку."
    ),
    "dds_crews": "Проверьте, назначены ли бригады, необходимые по условию задания.",
    "dds_response": (
        "Отразите поступившие сведения о ходе работы бригад. Статус службы менять не нужно."
    ),
}


def operator_task(source, read):
    from app.services.field_evaluation import check_fields

    skills = skills_for(read.learning.model_dump(mode="json"))
    check = check_fields(source, read)
    # Type comes first: showing child answers before selecting their type is misleading.
    ordered = sorted(check.fields, key=lambda f: 0 if f.field == "classifier_entry_id" else 1)
    for field in ordered:
        skill = field_skill(field.field)
        if skill not in skills or skill == "notification":
            continue
        if field.status == "matched" or (not field.scored and field.status != "missing"):
            continue
        if field.field.startswith("features.ekp."):
            from app.schemas.catalog_document import FeatureDefinition
            from app.services.catalog_rules import feature_is_visible

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
            f"Для «{field.label}» в эталонном решении указано: {reference}.",
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


def dds_task(read, goals):
    from app.schemas.dds import CREW_LABELS, CREW_TRANSITIONS
    from app.services.dds_assessment import crew_goal_met

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
                    "dds_response",
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


async def issue_hint(session, attempt_id, student_id, command):
    from app.services.student import attempt_read, owned_attempt

    attempt, lesson = await owned_attempt(session, attempt_id, student_id, lock=True)
    read = await attempt_read(session, attempt)
    revision = read.dds["revision"] if read.dds else read.card.revision
    policy = read.learning.assistance
    if attempt.status != "in_progress" or lesson.status != "active":
        return HintRead(status="complete", revision=revision)
    if (
        read.learning.kind == "assessment"
        or policy.max_level == "none"
        or not attempt.settings_snapshot.get("learning_engine")
    ):
        return HintRead(status="disabled", revision=revision)
    if LEVELS.index(command.level) > LEVELS.index(policy.max_level):
        raise HTTPException(403, "Эта глубина подсказки не разрешена преподавателем.")
    if command.trigger == "request" and not policy.on_request:
        raise HTTPException(403, "Запрос подсказки отключён преподавателем.")
    if command.trigger == "automatic" and command.level != "goal":
        raise HTTPException(422, "Автоматически можно только напомнить цель.")
    request = command.model_dump(mode="json", exclude={"request_id"})
    existing = await session.scalar(
        select(AttemptEvent).where(
            AttemptEvent.attempt_id == attempt.id, AttemptEvent.command_id == command.request_id
        )
    )
    if existing:
        if existing.kind != "learning.hint_issued" or existing.payload["request"] != request:
            raise HTTPException(409, "Request ID was already used with different parameters")
        return (
            HintRead.model_validate(existing.payload["response"])
            if existing.payload["response"]["revision"] == revision
            else HintRead(status="waiting", revision=revision)
        )
    if command.trigger == "automatic":
        if attempt.settings_snapshot.get("delivery") == "dds-stream-v1":
            from app.services.dds_delivery import execution_for

            assignment = await session.get(Assignment, attempt.assignment_id)
            execution = await execution_for(session, assignment.lesson_id, student_id)
            if not execution or execution.active_attempt_id != attempt.id:
                return HintRead(status="waiting", revision=revision)
            recent = await session.scalar(
                select(AttemptEvent.occurred_at)
                .join(Attempt, Attempt.id == AttemptEvent.attempt_id)
                .join(Assignment, Assignment.id == Attempt.assignment_id)
                .where(
                    Assignment.lesson_id == assignment.lesson_id,
                    Assignment.student_id == student_id,
                    AttemptEvent.kind.in_(
                        ["dds.card_opened", "dds.crew_changed", "call.requested"]
                    ),
                )
                .order_by(AttemptEvent.occurred_at.desc())
                .limit(1)
            )
            if recent and (datetime.now(UTC) - recent).total_seconds() < AUTO_HINT_DELAY_SECONDS:
                return HintRead(status="waiting", revision=revision)
        last = await session.scalar(
            select(AttemptEvent)
            .where(
                AttemptEvent.attempt_id == attempt.id,
                AttemptEvent.kind.in_(
                    [
                        "attempt.started",
                        "card.draft_saved",
                        "card.services_changed",
                        "dds.crew_changed",
                        "learning.hint_issued",
                    ]
                ),
            )
            .order_by(AttemptEvent.sequence.desc())
            .limit(1)
        )
        if (
            last
            and (datetime.now(UTC) - last.occurred_at).total_seconds() < AUTO_HINT_DELAY_SECONDS
        ):
            return HintRead(status="waiting", revision=revision)
    assignment = await session.get(Assignment, attempt.assignment_id)
    source = await session.get(ScenarioCard, assignment.scenario_card_id)
    if not read.dds:
        from app.models import ClassifierEntry

        entry = (
            await session.get(ClassifierEntry, source.snapshot["classifier_entry_id"])
            if source.snapshot.get("classifier_entry_id")
            else None
        )
        source_data = source.snapshot | {
            "classifier_entry": {
                "name": (entry.display_name or entry.name) if entry else "Не установлен"
            }
        }
    if read.dds:
        names = {c["code"]: c["name"] for c in read.dds["profile"]["crews"]}
        goals = [
            {**g, "name": names[g["crew_code"]]}
            for g in attempt.settings_snapshot["dds_policy"]["required_crews"]
        ]
    task, target, goal, explanation, solution = (
        dds_task(read, goals) if read.dds else operator_task(source_data, read)
    )
    previous = await session.scalar(
        select(AttemptEvent)
        .where(
            AttemptEvent.attempt_id == attempt.id,
            AttemptEvent.kind == "learning.hint_issued",
            AttemptEvent.payload["task"].astext == task,
            AttemptEvent.payload["level"].astext == command.level,
            AttemptEvent.payload["revision"].as_integer() == revision,
        )
        .order_by(AttemptEvent.sequence.desc())
        .limit(1)
    )
    if previous:
        return (
            HintRead(status="waiting", revision=revision)
            if command.trigger == "automatic"
            else HintRead.model_validate(previous.payload["response"])
        )
    hint = LearningHint(
        id=str(command.request_id),
        task=task,
        level=command.level,
        text={"goal": goal, "explanation": explanation, "solution": solution}[command.level],
        target=None if command.level == "goal" else target,
        presentation="text" if command.level == "goal" else "highlight",
    )
    result = HintRead(status="ready", revision=revision, hint=hint)
    await append_event(
        session,
        attempt.id,
        "learning.hint_issued",
        {
            "request": request,
            "response": result.model_dump(mode="json"),
            "task": task,
            "level": command.level,
            "revision": revision,
            "trigger": command.trigger,
        },
        command_id=command.request_id,
    )
    await session.commit()
    return result
