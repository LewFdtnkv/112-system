"""Deterministic fallback and publication guards for generated caller speech."""

from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.generation import GeneratedText


class Wording(BaseModel):
    model_config = ConfigDict(extra="forbid")
    wording: Literal[0, 1]
    opening: Literal[0, 1]
    order: Literal[0, 1]


def render(job_input, selection):
    plan, facts = job_input["narrative"], job_input["facts"]
    chosen = Wording.model_validate(selection)
    event = plan["phrases"][chosen.wording]
    if facts.get("Пол") == "Женский":
        event = event.replace("ошибся", "ошиблась")
    address = "" if plan["service_call"] else f"Это {facts['Адрес']}."
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
    details_start = len(parts)
    flags = plan["flags"]
    if not plan["service_call"]:
        count = plan["victims_count"]
        if count is not None:
            parts.append(
                {
                    0: "Никто не пострадал.",
                    1: "Помощь нужна одному человеку.",
                    2: "Пострадали два человека.",
                    3: "Пострадали три человека.",
                }[count]
            )
        if flags.get("blocked") and not plan["answers"].get("trapped"):
            parts.append("Доступ к месту происшествия перекрыт.")
        if flags.get("refusedAmbulance"):
            parts.append(
                "Пострадавший отказывается от медицинской помощи."
                if count == 1
                else "От медицинской помощи пострадавшие отказываются."
            )
        if flags.get("blocked") is False:
            parts.append("Сюда можно добраться.")
        if flags.get("refusedAmbulance") is False and count:
            parts.append("От скорой никто не отказывался.")
    # Additional explicitly authored answers retain their meaning without invented paraphrases.
    data = job_input["card"]["data"]
    extras = plan.get("extra_evidence", [])
    parts.extend(extras)
    description = " ".join(filter(None, [event, address, *parts[details_start:]]))
    caller = facts.get("ФИО заявителя")
    if caller:
        parts.append(f"Меня зовут {caller}.")
    if sms and facts.get("Возраст"):
        age = facts["Возраст"]
        unit = (
            "лет"
            if 11 <= age % 100 <= 14
            else "год"
            if age % 10 == 1
            else "года"
            if age % 10 in (2, 3, 4)
            else "лет"
        )
        parts.append(f"Мне {age} {unit}.")
    separator = "\n" if detail == "Подробное сообщение" else " "
    speech = separator.join(part for part in parts if part)
    observations = []
    if data.get("caller_phone"):
        observations.append(f"Номер на экране АОН: {data['caller_phone']}.")
    if not sms and facts.get("Возраст"):
        observations.append(f"При уточнении возраста заявитель сообщает: {facts['Возраст']}.")
    if facts.get("Пол"):
        observations.append(f"Заявитель: {'женщина' if facts['Пол'] == 'Женский' else 'мужчина'}.")
    if not plan["service_call"] and not sms:
        observations.append(f"Место: {plan['object']}. Время суток: {facts['Время суток']}.")
    if observations:
        speech += "\n\nСведения, доступные оператору:\n" + "\n".join(observations)
    if sms:
        speech = "СМС: " + speech
    return GeneratedText(title=plan["title"], caller_message=speech, description=description)


def fallback(job_input):
    return render(job_input, job_input["narrative"]["default_wording"])
