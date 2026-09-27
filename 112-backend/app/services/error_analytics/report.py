"""Bounded teacher-owned error report, independent of LLM availability."""

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select

from app.models import Assignment, Attempt, Lesson, ScenarioVersion
from app.services.groups import owned_group
from app.services.learning_recommendations.profile import LABELS
from app.services.report_data import card_results
from app.services.views import lesson_rows_query

SKILLS = {**LABELS, "dds_timing": "Нормативы времени"}


def measure(checked, errors):
    return {
        "checked": checked,
        "errors": errors,
        "error_percent": round(errors * 100 / checked, 1) if checked else 0,
    }


def aggregate(cards, *, since, limit, offset):
    grouped, fields, students = {}, {}, set()
    summary = dict(
        checked=0, errors=0, teacher_reviewed=0, pending_ai=0, incomplete_ai=0, ungraded=0
    )
    for card in cards:
        if card["status"] not in {"completed", "interrupted"}:
            continue
        if not card["completed_at"] or datetime.fromisoformat(card["completed_at"]) < since:
            continue
        if card["teacher_reviewed"]:
            summary["teacher_reviewed"] += 1
            continue
        if card["ai_status"] in {"queued", "running"}:
            summary["pending_ai"] += 1
            continue
        checks = card["analytics_checks"]
        if not checks:
            summary["ungraded"] += 1
            continue
        if card["ai_status"] == "failed" or any(not f.get("applied") for f in card["findings"]):
            summary["incomplete_ai"] += 1
        failed = any(c["error"] for c in checks)
        summary["checked"] += 1
        summary["errors"] += failed
        students.add(card["student_id"])
        key = (card["template_key"], card["role"])
        item = grouped.setdefault(
            key,
            {
                "key": ":".join(key),
                "title": card["card_title"],
                "role": card["role"],
                "checked": 0,
                "errors": 0,
                "students": set(),
                "skills": {},
                "fields": {},
                "examples": [],
            },
        )
        item["checked"] += 1
        item["errors"] += failed
        item["students"].add(card["student_id"])
        by_skill = {}
        for check in checks:
            by_skill[check["skill"]] = by_skill.get(check["skill"], False) or check["error"]
            for target, field_key in (
                (item["fields"], check["key"]),
                (fields, (card["role"], check["key"], check["label"])),
            ):
                stat = target.setdefault(
                    field_key,
                    {
                        "key": check["key"],
                        "label": check["label"],
                        "role": card["role"],
                        "checked": 0,
                        "errors": 0,
                    },
                )
                stat["checked"] += 1
                stat["errors"] += check["error"]
        for skill, error in by_skill.items():
            stat = item["skills"].setdefault(skill, {"checked": 0, "errors": 0})
            stat["checked"] += 1
            stat["errors"] += error
        if failed and len(item["examples"]) < 3:
            item["examples"].append(
                {k: card[k] for k in ("lesson_id", "student_id", "student", "position")}
            )

    def ranked(values):
        return sorted(
            ({**v, **measure(v["checked"], v["errors"])} for v in values),
            key=lambda v: (
                -v["error_percent"],
                -v["errors"],
                v.get("title", v.get("label", "")),
                v.get("key", ""),
            ),
        )

    rows = ranked(grouped.values())
    for row in rows:
        row["students"] = len(row["students"])
        row["fields"] = [f for f in ranked(row["fields"].values()) if f["errors"]][:10]
        row["skills"] = {k: measure(**v) for k, v in row["skills"].items()}
    return {
        "summary": {
            **summary,
            **measure(summary["checked"], summary["errors"]),
            "students": len(students),
        },
        "skills": [
            {"key": k, "label": v} for k, v in SKILLS.items() if any(k in r["skills"] for r in rows)
        ],
        "fields": [f for f in ranked(fields.values()) if f["errors"]][:10],
        "cards": {
            "items": rows[offset : offset + limit],
            "total": len(rows),
            "offset": offset,
            "limit": limit,
        },
    }


async def report(session, teacher_id, *, group_id, role, track, days, limit, offset):
    if group_id:
        await owned_group(session, group_id, teacher_id)
    since = datetime.now(UTC) - timedelta(days=days)
    recent = (
        select(Assignment.lesson_id)
        .join(Attempt, Attempt.assignment_id == Assignment.id)
        .where(Attempt.ended_at >= since)
    )
    query = lesson_rows_query(teacher_id=teacher_id).where(
        Lesson.id.in_(recent), Lesson.status != "cancelled"
    )
    kinds = ["assessment"] if track == "assessment" else ["practice", "skill_practice", "review"]
    query = query.where(func.coalesce(Lesson.learning["kind"].astext, "practice").in_(kinds))
    if group_id:
        query = query.where(Lesson.group_id == group_id)
    if role != "all":
        query = query.where(ScenarioVersion.role == role)
    rows = (await session.execute(query.order_by(Lesson.id).limit(1001))).mappings().all()
    if len(rows) > 1000:
        raise HTTPException(422, "Сократите период или выберите группу: слишком много результатов.")
    cards = await card_results(session, rows, analytics=True)
    return aggregate(cards, since=since, limit=limit, offset=offset)
