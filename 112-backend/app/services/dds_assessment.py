from decimal import ROUND_HALF_UP, Decimal

from app.schemas.dds import CREW_LABELS, STATUS_LABELS
from app.schemas.lesson_evaluation import FieldCheck
from app.services.field_evaluation import normalized, summarize


def crew_goal_met(crew, expected):
    if not crew:
        return False
    if expected == "cancelled":
        return crew["status"] == "cancelled"
    if crew["status"] == "cancelled":
        return False
    # Reassignment begins a new cycle; cancelled work cannot satisfy its goals.
    cycle = []
    for event in crew["history"]:
        if event["status"] == "assigned":
            cycle = []
        cycle.append(event["status"])
    return expected in cycle


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
    crews = {c["crew_code"]: c for c in read.dds.get("crews", [])}
    names = {c["code"]: c["name"] for c in read.dds.get("profile", {}).get("crews", [])}
    for requirement in policy.get("required_crews", []):
        code = requirement["crew_code"]
        crew = crews.get(code)
        expected = requirement["status"]
        # Compare each crew independently: interleaving two crews is valid.
        matched = crew_goal_met(crew, expected)
        fields.append(
            FieldCheck(
                field=f"dds.assignment.{code}",
                label=f"Бригада: {names.get(code, code)}",
                expected=CREW_LABELS[expected],
                actual=CREW_LABELS[crew["status"]] if crew else "",
                scored=True,
                status="matched" if matched else "different" if crew else "missing",
            )
        )
    for crew in crews.values():
        fields.append(
            FieldCheck(
                field=f"dds.assignment_comment.{crew['crew_code']}",
                label=f"Смысл комментариев: {crew['name']}",
                expected="Проверка смысла преподавателем или будущим ИИ",
                actual="\n".join(e["comment"] for e in crew["history"]),
                scored=False,
                status="needs_review",
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
        ("dds_assignment", "dds.assignment.", 20, "Назначение и результат работы бригад"),
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
