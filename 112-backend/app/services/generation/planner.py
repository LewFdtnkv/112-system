"""Choose an internally consistent situation before prose and EKP routing."""

from fastapi import HTTPException

from app.services.catalog_rules import feature_definitions, feature_is_visible, validate_answers
from app.services.generation.library import for_entry, library

LINKED_VICTIMS = {"injured", "victims"}


def build(entry, template, p, rng):
    definitions = feature_definitions(entry)
    by_key = {f.key: f for f in definitions}
    explicit = p.feature_answers
    # Validate types here; visibility is checked with the completed parent answers below.
    if any(k not in by_key or not by_key[k].accepts(v) for k, v in explicit.items()):
        raise ValueError("Значение признака отсутствует в выбранной версии ЕКП")
    if p.object is not None and p.object.casefold() not in {o.casefold() for o in template.objects}:
        raise ValueError("Объект несовместим с сюжетом")
    if template.service_call and any((p.locality, p.street, p.house)):
        raise ValueError("Для этого служебного вызова адрес происшествия не предусмотрен")
    required_victims = [v for v in [p.has_victims, template.has_victims] if v is not None]
    required_victims += [v for k, v in explicit.items() if k in LINKED_VICTIMS]
    if p.victims_count is not None:
        required_victims.append(p.victims_count > 0)
    if len(set(required_victims)) > 1:
        raise ValueError("Пострадавшие противоречат выбранному сюжету или признакам")
    victims = required_victims[0] if required_victims else rng.random() < 0.2
    if p.victims_count is not None and p.victims_count > template.victims_limit:
        raise ValueError(f"Этот сюжет рассчитан максимум на {template.victims_limit} пострадавших")
    count = (
        p.victims_count
        if p.victims_count is not None
        else rng.randint(1, template.victims_limit)
        if victims
        else 0
    )
    blocked_values = [
        v for v in [p.blocked, template.blocked, explicit.get("trapped")] if v is not None
    ]
    if explicit.get("access") == "Нет доступа":
        blocked_values.append(True)
    if len(set(blocked_values)) > 1:
        raise ValueError("Отметка о доступе противоречит сюжету или признакам")
    blocked = blocked_values[0] if blocked_values else rng.random() < 0.1
    refused = p.refused_ambulance if p.refused_ambulance is not None else False
    if refused and (not victims or template.answers.get("conscious") is False):
        raise ValueError("Отказ от помощи несовместим с отсутствием пострадавших или сознания")
    answers = {k: v for k, v in template.answers.items() if k in by_key}
    for key, value in explicit.items():
        if key in answers and answers[key] != value:
            raise ValueError("Признаки несовместимы с подготовленной ситуацией")
        answers[key] = value
    linked = {k: victims for k in LINKED_VICTIMS}
    linked |= {"trapped": blocked, "medical_help": victims}
    if "people_threat" in by_key and (victims or blocked):
        linked["people_threat"] = True
    for key, value in linked.items():
        if key not in by_key:
            continue
        if key in answers and answers[key] != value:
            raise ValueError("Связанные признаки противоречат друг другу")
        answers[key] = value
    if blocked and "access" in by_key:
        answers["access"] = "Нет доступа"
    visible = {}
    for f in definitions:
        if not feature_is_visible(f, visible):
            if f.key in explicit:
                raise ValueError("Задано значение скрытого поля")
            continue
        if f.key in answers:
            visible[f.key] = answers[f.key]
        elif f.required:
            raise ValueError(f"В заготовке нет обязательного признака «{f.label}»")
    try:
        validate_answers(definitions, visible)
    except HTTPException as exc:
        raise ValueError("Заготовка несовместима с текущей схемой признаков ЕКП") from exc
    flags = {
        "hasVictims": victims,
        "noContact": False,
        "blocked": blocked,
        "refusedAmbulance": refused,
        "callDropped": p.call_dropped if p.call_dropped is not None else rng.random() < 0.05,
    }
    return {
        "version": library()[0],
        "template_id": template.id,
        "title": template.title,
        "phrases": list(template.phrases),
        "answers": visible,
        "covered_features": list(template.answers),
        "flags": flags,
        "victims_count": count,
        "object": p.object or (rng.choice(template.objects) if template.objects else None),
        "service_call": template.service_call,
    }


def choose(entries, p, rng, usage):
    candidates, errors = [], []
    for entry in entries:
        for template in for_entry(entry):
            try:
                plan = build(entry, template, p, rng)
                candidates.append((entry, plan))
            except ValueError as exc:
                errors.append(str(exc))
    if not candidates:
        detail = errors[0] if errors else "Для выбранного типа пока нет подготовленных ситуаций"
        raise HTTPException(422, detail + ". Измените параметры или создайте карточку вручную.")
    least = min(usage.get(plan["template_id"], 0) for _, plan in candidates)
    candidates = [row for row in candidates if usage.get(row[1]["template_id"], 0) == least]
    entry, plan = rng.choice(candidates)
    usage[plan["template_id"]] = usage.get(plan["template_id"], 0) + 1
    return entry, plan
