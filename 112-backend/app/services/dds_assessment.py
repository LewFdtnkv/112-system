from decimal import ROUND_HALF_UP, Decimal

from app.schemas.dds import CREW_LABELS, STATUS_LABELS
from app.schemas.lesson_evaluation import FieldCheck
from app.services.field_evaluation import normalized, summarize
from app.services.learning_scope import skills_for


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
    if policy.get("workflow") == "crews-v1":
        return check_crew_exercise(policy, read)
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
        ("dds_notification", "dds.notification.", 20, "Оповещение руководителей бригад"),
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


def check_crew_exercise(policy, read):
    skills = skills_for(read.learning.model_dump(mode="json"), "dds")
    crews = {c["crew_code"]: c for c in read.dds.get("crews", [])}
    names = {c["code"]: c["name"] for c in read.dds["profile"].get("crews", [])}
    fields = []
    for goal in policy["required_crews"]:
        code = goal["crew_code"]
        crew = crews.get(code)
        for skill, prefix, expected, matched in (
            (
                "dds_crews",
                "dds.assignment.",
                "Назначена",
                bool(crew and (crew["status"] != "cancelled" or goal["status"] == "cancelled")),
            ),
            (
                "dds_response",
                "dds.status.",
                CREW_LABELS[goal["status"]],
                crew_goal_met(crew, goal["status"]),
            ),
        ):
            if skill in skills and not (skill == "dds_response" and goal["status"] == "assigned"):
                fields.append(
                    FieldCheck(
                        field=prefix + code,
                        label=f"Бригада: {names[code]}",
                        expected=expected,
                        actual=CREW_LABELS[crew["status"]] if crew else "",
                        scored=True,
                        status="matched" if matched else "different" if crew else "missing",
                    )
                )
    required = {g["crew_code"] for g in policy["required_crews"]}
    if "dds_crews" in skills:
        for code, crew in crews.items():
            if code not in required and crew["status"] != "cancelled":
                fields.append(
                    FieldCheck(
                        field=f"dds.assignment.extra.{code}",
                        label=f"Лишняя бригада: {crew['name']}",
                        expected="Не назначать",
                        actual=CREW_LABELS[crew["status"]],
                        scored=True,
                        status="different",
                    )
                )
    if policy.get("crew_calls_required") and "dds_crews" in skills:
        calls = {c["crew_code"]: c for c in read.dds.get("crew_calls", [])}
        for goal in policy["required_crews"]:
            if goal["status"] == "cancelled":
                continue
            code = goal["crew_code"]
            completed = calls.get(code, {}).get("completed", False)
            fields.append(
                FieldCheck(
                    field=f"dds.notification.{code}",
                    label=f"Оповещение: {names[code]}",
                    expected="Сообщение передано, получено «Принято»",
                    actual="Подтверждено АТС" if completed else "Нет завершённого разговора",
                    scored=True,
                    status="matched" if completed else "missing",
                )
            )
    norm = read.dds.get("reaction_norm_seconds")
    if norm is not None:
        response_at = read.dds.get("first_decision_at")
        seconds = read.dds.get("reaction_seconds") if response_at else None
        fields.append(
            FieldCheck(
                field="dds.reaction",
                label="Первый статус бригады после поступления",
                expected=f"Не позднее {norm} с",
                actual=f"{seconds:.1f} с" if seconds is not None else "Статус не введён",
                scored=False,
                status="matched"
                if seconds is not None and seconds <= norm
                else "different"
                if seconds is not None
                else "missing",
            )
        )
    return summarize(fields)
