"""The model selects approved wording; factual strings never pass through free rewriting."""

import json
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.generation import GeneratedText


class Wording(BaseModel):
    model_config = ConfigDict(extra="forbid")
    wording: Literal[0, 1]
    opening: Literal[0, 1]
    order: Literal[0, 1]


def prompt(plan, facts):
    return (
        "Ты редактор учебного сообщения в 112. Выбери естественную подачу из готовых вариантов. "
        "Ответь только JSON с тремя целыми числами 0 или 1. "
        "wording — номер фразы; opening: 0 — «Здравствуйте», 1 — «Помогите, пожалуйста» "
        "(для справочного вызова — «Добрый день»); order: 0 — сначала происшествие, "
        "1 — сначала адрес. Не добавляй текст или факты.\n"
        + json.dumps(
            {
                "ситуация": plan["title"],
                "канал": plan.get("message_format", "call"),
                "фразы": plan["phrases"],
                "состояние_заявителя": facts.get("Состояние заявителя", "Спокоен"),
                "служебный_вызов": plan["service_call"],
                "пример_формата": {"wording": 0, "opening": 0, "order": 0},
            },
            ensure_ascii=False,
        )
    )


def render(job_input, selection):
    plan, facts = job_input["narrative"], job_input["facts"]
    chosen = Wording.model_validate(selection)
    event = plan["phrases"][chosen.wording]
    if facts.get("Пол") == "Женский":
        event = event.replace("ошибся", "ошиблась")
    address = "" if plan["service_call"] else f"Адрес: {facts['Адрес']}."
    # Coordinates, names and house numbers are substituted by code, not produced by LLM.
    if plan["service_call"]:
        opening = ["Здравствуйте.", "Добрый день."][chosen.opening]
    elif facts.get("Состояние заявителя") == "Спокоен":
        opening = ["Здравствуйте.", "Добрый день."][chosen.opening]
    else:
        opening = ["Здравствуйте, нужна помощь.", "Помогите, пожалуйста."][chosen.opening]
    detail = facts.get("Подробность сообщения", "Обычное сообщение")
    sms = plan.get("message_format") == "sms"
    parts = [] if sms or detail == "Краткое сообщение" else [opening]
    parts += [address, event] if chosen.order else [event, address]
    flags = plan["flags"]
    if not plan["service_call"]:
        count = plan["victims_count"]
        if count is not None:
            parts.append(
                {
                    0: "Пострадавших нет.",
                    1: "Помощь нужна одному пострадавшему.",
                    2: "Пострадали два человека.",
                    3: "Пострадали три человека.",
                }[count]
            )
        if flags.get("blocked"):
            parts.append("Доступ к месту происшествия перекрыт.")
        if flags.get("refusedAmbulance"):
            parts.append("От медицинской помощи пострадавшие отказываются.")
        if flags.get("blocked") is False:
            parts.append("Доступ к месту происшествия свободен.")
        if flags.get("refusedAmbulance") is False and count:
            parts.append("Отказа от медицинской помощи не было.")
    # Additional explicitly authored answers retain their meaning without invented paraphrases.
    data = job_input["card"]["data"]
    extras = plan.get("extra_evidence", [])
    parts.extend(extras)
    caller = facts.get("ФИО заявителя")
    if caller:
        parts.append(f"Меня зовут {caller}.")
    if sms and facts.get("Возраст"):
        parts.append(f"Мне {facts['Возраст']} лет.")
    if sms and facts.get("Пол"):
        parts.append(f"Я {'женщина' if facts['Пол'] == 'Женский' else 'мужчина'}.")
    separator = "\n" if detail == "Подробное сообщение" else " "
    speech = separator.join(part for part in parts if part)
    observations = []
    if data.get("caller_phone"):
        observations.append(f"Номер на экране АОН: {data['caller_phone']}.")
    if not sms and facts.get("Возраст"):
        observations.append(f"При уточнении возраста заявитель сообщает: {facts['Возраст']}.")
    if not sms and facts.get("Пол"):
        observations.append(f"Заявитель: {'женщина' if facts['Пол'] == 'Женский' else 'мужчина'}.")
    if not plan["service_call"] and not sms:
        observations.append(f"Место: {plan['object']}. Время суток: {facts['Время суток']}.")
    if observations:
        speech += "\n\nСведения, доступные оператору:\n" + "\n".join(observations)
    if sms:
        speech = "СМС: " + speech
    description = " ".join(
        filter(
            None,
            [
                plan["title"] + ".",
                address,
                f"Пострадавших: {plan['victims_count']}."
                if not plan["service_call"] and plan["victims_count"] is not None
                else "",
            ],
        )
    )
    return GeneratedText(title=plan["title"], caller_message=speech, description=description)


def fallback(job_input):
    return render(job_input, job_input["narrative"]["default_wording"])


def protect(job_input, text, metadata):
    """Revalidate at publication too: callers cannot bypass guards by calling finish directly."""
    try:
        expected = render(job_input, metadata["selection"])
        if text != expected:
            raise ValueError("Text was changed after composition")
        return text, metadata
    except (ValueError, KeyError, TypeError):
        return fallback(job_input), {
            **metadata,
            "source": "template-fallback",
            "quality_note": "Использован текст заготовки: результат модели не прошёл проверку.",
        }
