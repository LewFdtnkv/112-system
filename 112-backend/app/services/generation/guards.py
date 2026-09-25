"""Narrow guards for observed critic misses; not a general Russian fact checker."""

import re


def reject_unreported_negatives(data, message):
    plan = data["narrative"]
    answers, flags = plan["answers"], plan["flags"]
    access_known = (
        flags.get("blocked") is False
        or "blocked" in flags
        and not answers.get("trapped")
        or "access" in answers
        or "blocked" in answers
    )
    checks = [
        (
            "hasVictims" in flags or plan["victims_count"] is not None,
            r"никто\s+не\s+пострад\w*|пострадавших\s+нет|все\s+целы",
            "Неизвестно, есть ли пострадавшие",
        ),
        (
            "trapped" in answers,
            r"никто\s+не\s+зажат|не\s+зажат[ыа]?\b|заблокированных\s+людей\s+нет",
            "Неизвестно, заблокированы ли люди",
        ),
        (
            any(k in answers for k in ("fire", "flame"))
            or bool(
                re.search(r"горит|горят|пламя|огонь|возгорание", " ".join(plan["phrases"]), re.I)
            ),
            r"\bне\s+гор(?:ят|ит)\b|(?:огня|возгорания|пожара)\s+нет",
            "Неизвестно, есть ли огонь",
        ),
        (
            access_known,
            r"(?:проезд|подъезд|доступ|проход)[^.?!]{0,25}(?:свобод|открыт)|подъехать\s+можно",
            "Доступность места не задана",
        ),
    ]
    for known, pattern, reason in checks:
        if not known and re.search(pattern, message, re.I):
            raise ValueError(reason + ": убери неподтверждённое утверждение")


def reject_meta_speech(message):
    if re.search(r"\b(?:в|на|у|возле|около|по|из)\s+\[АДРЕС\]", message, re.I):
        raise ValueError("Полный адрес нельзя склонять: напиши отдельное «Это [АДРЕС].»")
    if re.search(
        r"без лишних слов|в\s*живую|как (?:ИИ|нейросеть)|алло,?\s*(?:я )?могу помочь"
        r"|(?:^|[.!?]\s*)просьба о помощи[.!?]?$",
        message,
        re.I,
    ):
        raise ValueError("Убери комментарии о тексте и реплики оператора. Ты просишь помощь")
