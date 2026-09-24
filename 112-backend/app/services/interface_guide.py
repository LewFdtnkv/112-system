"""Scenario-driven guidance with explicit, audited confirmation of open-ended work."""

import hashlib

from fastapi import HTTPException
from sqlalchemy import select

from app.models import AttemptEvent
from app.models.enums import EventActor
from app.services.audit import append_event
from app.services.field_evaluation import check_fields

INSTRUCTIONS = {
    "classification": "Выберите тип происшествия. Для поиска введите хотя бы два символа.",
    "caller": "Заполните сведения, которые сообщил заявитель. Неизвестное оставьте пустым.",
    "address": "Укажите место происшествия в подсвеченном поле.",
    "description": "Кратко опишите, что случилось. Можно написать своими словами.",
    "notification": "Нажмите «+» рядом со службами, выберите нужные и подтвердите список.",
    "submit": "Проверьте карточку и нажмите «сохранить» внизу. Затем вернитесь к списку карточек.",
    "dds_crews": "Откройте свою службу и нажмите «Назначить бригаду».",
    "dds_response": "Нажмите карандаш бригады, выберите статус и подтвердите галочкой.",
}


def field_token(value):
    return hashlib.sha256(value.strip().encode()).hexdigest()


def is_free_text(source, field):
    if not field.scored:
        return True
    return any(
        f.get("type") == "text" and field.field == f"features.ekp.{f['key']}"
        for f in source.get("feature_definitions", [])
    )


def guide_text(task, target, goal, explanation, solution):
    if task in {"guide.source", "guide.services"} or task.endswith(".finished"):
        return explanation
    instruction = INSTRUCTIONS.get(target, explanation)
    if task.startswith("features."):
        instruction = "Выберите ответ в подсвеченном вопросе. Повторный клик снимает выбор."
    if target == "submit":
        return explanation
    return f"{instruction}\n\n{solution}".replace(" (ЕКП)", "").replace(
        "Для этой ситуации эталонный список:", "По условию задачи нужны службы:"
    )


def choose_step(source, read, goals, confirmed):
    from app.services.learning_hints import dds_task, operator_task

    if "guide.source" not in confirmed:
        return (
            (
                "guide.source",
                "source",
                "",
                (
                    "Здесь условия задачи: что произошло и что нужно сделать. "
                    "Прочитайте их. Во время работы сюда можно вернуться. "
                    "Когда будете готовы, нажмите «Продолжить»."
                ),
                "",
            ),
            "confirm",
            True,
            "seen",
        )
    step = dds_task(read, goals) if read.dds else operator_task(source, read, confirmed)
    task, target, *_ = step
    if not read.dds and target in {"notification", "submit"} and "guide.services" not in confirmed:
        expected = {str(r["service_id"]) for r in source.get("recipients", [])}
        actual = {str(r.service_id) for r in read.recipient_services}
        text = (
            "Службы внизу подбираются автоматически по типу и признакам происшествия. "
            "Если нужно, список можно изменить кнопкой «+». "
        )
        text += (
            "Сейчас список подходит к задаче, менять его не нужно. Нажмите «Продолжить»."
            if actual == expected and expected
            else "В этой задаче оповещение не требуется. Оставьте список пустым. "
            "Нажмите «Продолжить»."
            if actual == expected
            else "В этой задаче список нужно изменить. Нажмите «Продолжить», и разберём выбор."
        )
        return (("guide.services", "notification", "", text, ""), "confirm", True, "seen")
    if not read.dds:
        field = next((f for f in check_fields(source, read).fields if f.field == task), None)
        if field and is_free_text(source, field):
            task, target, goal, explanation, _ = step
            step = (
                task,
                target,
                goal,
                explanation,
                f"Например: {field.expected}. Допишите свой ответ и нажмите «Продолжить».",
            )
            return step, "confirm", bool(field.actual.strip()), field_token(field.actual)
    return step, "action", False, None


async def next_step(session, attempt, read, source, goals, confirm_hint_id):
    events = await session.scalars(
        select(AttemptEvent)
        .where(
            AttemptEvent.attempt_id == attempt.id,
            AttemptEvent.kind == "learning.guide_confirmed",
        )
        .order_by(AttemptEvent.sequence)
    )
    confirmed = {e.payload["task"]: e.payload["value_token"] for e in events}
    step, advance, allowed, token = choose_step(source, read, goals, confirmed)
    if confirm_hint_id:
        issued = await session.scalar(
            select(AttemptEvent).where(
                AttemptEvent.attempt_id == attempt.id,
                AttemptEvent.kind == "learning.hint_issued",
                AttemptEvent.command_id == confirm_hint_id,
            )
        )
        if not issued or issued.payload.get("guide_version") != 2:
            raise HTTPException(422, "Этот шаг не был показан в текущей карточке.")
        if issued.payload["task"] != step[0] or advance != "confirm":
            # Network retries with a new request ID must not confirm the NEXT step.
            if issued.payload["task"] not in confirmed:
                raise HTTPException(409, "Шаг изменился. Проверьте текущую подсказку.")
        elif not allowed:
            raise HTTPException(422, "Сначала заполните подсвеченное поле.")
        else:
            confirmed[step[0]] = token
            await append_event(
                session,
                attempt.id,
                "learning.guide_confirmed",
                {
                    "task": step[0],
                    "value_token": token,
                    "hint_id": str(confirm_hint_id),
                },
                actor=EventActor.STUDENT,
                actor_id=attempt.student_id,
            )
            step, advance, allowed, _ = choose_step(source, read, goals, confirmed)
    return step, advance, allowed
