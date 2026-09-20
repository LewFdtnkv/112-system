from decimal import ROUND_HALF_UP, Decimal

from app.schemas.dds import STATUS_LABELS
from app.schemas.lesson_evaluation import FieldCheck
from app.services.field_evaluation import normalized, summarize


def check_dds(policy, read):
    history = read.dds["history"]
    fields = []
    for index, step in enumerate(policy["steps"]):
        action = history[index] if index < len(history) else {}
        fields.append(
            FieldCheck(
                field=f"dds.status.{index}",
                label=f"Этап {index + 1}: статус",
                expected=STATUS_LABELS[step["status"]],
                actual=STATUS_LABELS.get(action.get("status"), ""),
                scored=True,
                status="matched"
                if action.get("status") == step["status"]
                else "different"
                if action
                else "missing",
            )
        )
        if step.get("crew_number"):
            value = action.get("crew_number")
            fields.append(
                FieldCheck(
                    field=f"dds.crew.{index}",
                    label=f"Этап {index + 1}: номер наряда",
                    expected=step["crew_number"],
                    actual=value or "",
                    scored=True,
                    status="matched"
                    if normalized(value) == normalized(step["crew_number"])
                    else "different"
                    if value
                    else "missing",
                )
            )
    fields.append(
        FieldCheck(
            field="dds.comment",
            label="Смысл комментариев ДДС",
            expected="Проверка смысла преподавателем или будущим ИИ",
            actual=read.dds["comment"],
            scored=False,
            status="needs_review",
        )
    )
    return summarize(fields)


def criteria_dds(check):
    criteria = []
    for code, prefix, weight, label in [
        ("dds_status", "dds.status.", 80, "Статусы ДДС по сообщениям задания"),
        ("dds_crew", "dds.crew.", 20, "Номер наряда"),
    ]:
        fields = [f for f in check.fields if f.field.startswith(prefix)]
        if fields:
            correct = sum(f.status == "matched" for f in fields)
            criteria.append(
                {
                    "code": code,
                    "label": label,
                    "score": (Decimal(weight) * correct / len(fields)).quantize(
                        Decimal("0.01"), rounding=ROUND_HALF_UP
                    ),
                    "max_score": Decimal(weight),
                    "explanation": f"Совпало {correct} из {len(fields)} действий.",
                    "fields": fields,
                }
            )
    return criteria
