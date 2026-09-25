"""Choose an internally consistent situation before prose and EKP routing."""

from fastapi import HTTPException

from app.services.catalog_rules import feature_definitions, feature_is_visible, validate_answers
from app.services.generation.library import for_entry, library
from app.services.generation.validation import ParameterConflict, reject_parameters

LINKED_VICTIMS = {"injured", "victims"}


def build(entry, template, p, rng):
    definitions = feature_definitions(entry)
    by_key = {f.key: f for f in definitions}
    explicit = p.feature_answers
    # Validate types here; visibility is checked with the completed parent answers below.
    if any(k not in by_key or not by_key[k].accepts(v) for k, v in explicit.items()):
        raise ParameterConflict(
            "Значение признака отсутствует в выбранной версии ЕКП",
            *(
                f"feature_answers.{k}"
                for k, v in explicit.items()
                if k not in by_key or not by_key[k].accepts(v)
            ),
        )
    if p.object is not None and p.object.casefold() not in {o.casefold() for o in template.objects}:
        raise ParameterConflict(
            "Для выбранного объекта нет подходящей заготовки. "
            "Выберите другой объект или «Случайно».",
            "object",
        )
    if template.service_call and any(
        (p.locality, p.street, p.house, p.address_description, p.address_format)
    ):
        raise ParameterConflict(
            "Для этого служебного вызова адрес происшествия не предусмотрен. "
            "Уберите заданный адрес или выберите другой тип происшествия.",
            "classifier_entry_id",
            *(
                key
                for key in ("locality", "street", "house", "address_description", "address_format")
                if getattr(p, key)
            ),
        )
    required_victims = [v for v in [p.has_victims, template.has_victims] if v is not None]
    required_victims += [v for k, v in explicit.items() if k in LINKED_VICTIMS]
    if p.victims_count is not None:
        required_victims.append(p.victims_count > 0)
    if len(set(required_victims)) > 1:
        raise ParameterConflict(
            "Отметка и количество пострадавших должны согласовываться с признаками происшествия.",
            "has_victims",
            "victims_count",
            *(f"feature_answers.{k}" for k in explicit if k in LINKED_VICTIMS),
        )
    victims = required_victims[0] if required_victims else rng.random() < 0.2
    if p.victims_count is not None and p.victims_count > template.victims_limit:
        raise ParameterConflict(
            f"Подходящая заготовка рассчитана максимум на {template.victims_limit} пострадавших. "
            "Уменьшите количество или измените признаки происшествия.",
            "victims_count",
        )
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
        raise ParameterConflict(
            "Отметка о доступе противоречит сюжету или признакам.",
            "blocked",
            *(f"feature_answers.{k}" for k in explicit if k in {"trapped", "access"}),
        )
    blocked = blocked_values[0] if blocked_values else rng.random() < 0.1
    refused = p.refused_ambulance if p.refused_ambulance is not None else False
    if refused and (not victims or template.answers.get("conscious") is False):
        raise ParameterConflict(
            "Отказ от помощи несовместим с отсутствием пострадавших или сознания.",
            "refused_ambulance",
            "has_victims",
        )
    answers = {k: v for k, v in template.answers.items() if k in by_key}
    for key, value in explicit.items():
        if key in answers and answers[key] != value:
            raise ParameterConflict(
                "Для этого значения признака нет подходящей заготовки. "
                "Выберите другое значение или «Случайно».",
                f"feature_answers.{key}",
            )
        answers[key] = value
    linked = {k: victims for k in LINKED_VICTIMS}
    linked |= {"trapped": blocked, "medical_help": victims}
    if "people_threat" in by_key and (victims or blocked):
        linked["people_threat"] = True
    for key, value in linked.items():
        if key not in by_key:
            continue
        if key in answers and answers[key] != value:
            raise ParameterConflict(
                "Связанные признаки противоречат друг другу.", f"feature_answers.{key}"
            )
        answers[key] = value
    if blocked and "access" in by_key:
        answers["access"] = "Нет доступа"
    visible = {}
    for f in definitions:
        if not feature_is_visible(f, visible):
            if f.key in explicit:
                raise ParameterConflict(
                    "Уберите значение скрытого признака или измените родительский признак.",
                    "classifier_entry_id",
                )
            continue
        if f.key in answers:
            visible[f.key] = answers[f.key]
        elif f.required:
            raise ParameterConflict(
                f"В заготовках нет обязательного признака «{f.label}». "
                "Выберите другой тип или создайте карточку вручную.",
                "classifier_entry_id",
            )
    try:
        validate_answers(definitions, visible)
    except HTTPException as exc:
        raise ParameterConflict(
            "Заготовка несовместима с текущими признаками ЕКП. "
            "Выберите другой тип или создайте карточку вручную.",
            "classifier_entry_id",
        ) from exc
    flags = {
        "hasVictims": victims,
        "blocked": blocked,
        "refusedAmbulance": refused,
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
    templates = [template for entry in entries for template in for_entry(entry)]
    if templates and p.victims_count is not None:
        limit = max(template.victims_limit for template in templates)
        if p.victims_count > limit:
            reject_parameters(
                f"Для выбранного типа доступны заготовки максимум на {limit} пострадавших. "
                "Уменьшите количество или создайте карточку вручную.",
                "victims_count",
            )
    candidates, errors = [], []
    for entry in entries:
        for template in for_entry(entry):
            try:
                plan = build(entry, template, p, rng)
                candidates.append((entry, plan))
            except ParameterConflict as exc:
                errors.append(exc)
    if not candidates:
        if errors:
            reject_parameters(str(errors[0]), *errors[0].fields)
        reject_parameters(
            "Для выбранного типа пока нет подготовленных ситуаций. "
            "Выберите другой тип "
            "или создайте карточку вручную.",
            "classifier_entry_id",
        )
    least = min(usage.get(plan["template_id"], 0) for _, plan in candidates)
    candidates = [row for row in candidates if usage.get(row[1]["template_id"], 0) == least]
    entry, plan = rng.choice(candidates)
    usage[plan["template_id"]] = usage.get(plan["template_id"], 0) + 1
    return entry, plan
