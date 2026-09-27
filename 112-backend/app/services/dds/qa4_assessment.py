"""Exact QA4 checks; semantic review cannot replace absent workflow evidence."""

from app.domain.dds_workflow import cycle, required_path
from app.schemas.dds import CREW_LABELS
from app.schemas.lesson_evaluation import FieldCheck


def completion_checks(policy, crews, names):
    result = []
    for goal in policy["required_crews"]:
        code = goal["crew_code"]
        crew = crews.get(code)
        events = cycle(crew["history"]) if crew else []
        for status in required_path(goal["status"]):
            if status == "assigned":
                continue  # Separate assignment/call criteria.
            event = next((e for e in events if e["status"] == status), None)
            if event and event.get("prepared"):
                continue
            matched = bool(event and event.get("comment", "").strip())
            result.append(
                FieldCheck(
                    field=f"dds.status.{code}.{status}",
                    label=f"{names[code]}: {CREW_LABELS[status]}",
                    expected="Статус с текстом по сведениям задания",
                    actual=event.get("comment", "") if event else "Запись отсутствует",
                    scored=True,
                    status="matched" if matched else "different" if event else "missing",
                )
            )
        # A matching status in an abandoned/refused cycle is not completed work.
        if crew and crew["status"] != goal["status"]:
            result.append(
                FieldCheck(
                    field=f"dds.status.{code}.outcome",
                    label=f"{names[code]}: результат",
                    expected=CREW_LABELS[goal["status"]],
                    actual=CREW_LABELS[crew["status"]],
                    scored=True,
                    status="different",
                )
            )
    return result


def timing_checks(read):
    result = []
    for key, label in (
        ("opening", "Открытие карточки"),
        ("first_record", "Первый статус с текстом"),
    ):
        data = (read.dds.get("timing") or {}).get(key)
        if not data:
            continue
        result.append(
            FieldCheck(
                field=f"dds.timing.{key}",
                label=label,
                expected=f"Не позднее {data['norm_seconds']} с от поступления",
                actual=f"{data['seconds']:.1f} с" if data["at"] else "Не выполнено",
                scored=read.learning.kind in {"practice", "assessment"},
                status="matched"
                if data["state"] == "on_time"
                else "different"
                if data["at"]
                else "missing",
            )
        )
    return result
