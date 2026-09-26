"""Keep every scored feature observable, including teacher-supplied free-text values."""

BOOLEAN_PHRASES = {
    "medical_help": ("Медицинская помощь не нужна.", "Нужна медицинская помощь."),
    "trapped": ("Заблокированных людей нет.", "Люди заблокированы и не могут выбраться."),
    "fire": ("Возгорания нет.", "Видно возгорание."),
    "flame": ("Открытого огня нет.", "Видно открытое пламя."),
    "weapon": ("Оружия не вижу.", "Вижу оружие."),
    "child": ("Пострадавший — взрослый.", "Пострадавший — ребёнок."),
    "people_threat": ("Угрозы людям нет.", "Люди находятся в опасности."),
    "evacuation": (
        "Выводить людей из опасной зоны не требуется.",
        "Нужно вывести людей из опасной зоны.",
    ),
    "blocked": ("Проход и проезд свободны.", "Проход или проезд перекрыт."),
    "rising": ("Уровень воды не повышается.", "Уровень воды повышается."),
}


def readable(value):
    if isinstance(value, bool):
        return "да" if value else "нет"
    if isinstance(value, list):
        return ", ".join(value) or "нет"
    return str(value)


def extra_evidence(definitions, answers, plan):
    covered = set(plan["covered_features"]) | {"injured", "victims"}
    # Main medical and police phrases already state consciousness, breathing and timing.
    covered -= set(BOOLEAN_PHRASES)
    if plan["flags"].get("blocked"):
        covered.add("access")
    sentences = []
    for f in definitions:
        if f.key in answers and f.key not in covered:
            if f.type == "boolean" and f.key in BOOLEAN_PHRASES:
                sentences.append(BOOLEAN_PHRASES[f.key][int(answers[f.key])])
            else:
                sentences.append(
                    (
                        f"В сообщении указано «{f.label}»: "
                        if plan.get("message_format") == "sms"
                        else f"{f.label}: "
                    )
                    + f"{readable(answers[f.key])}."
                )
    return sentences
