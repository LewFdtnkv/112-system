"""Additive, offline acceptance dataset. Never run external AI or PBX providers."""

import secrets
from datetime import UTC, datetime, timedelta
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.core.config import settings
from app.models import CardTemplate, Lesson, ScenarioVersion, TrainingGroup, User
from scripts.seed_demo_results import complete_lesson, expired_lesson, paused_lesson, teacher_review
from scripts.seed_demo_support import populate_support
from scripts.seed_training import populate_training


def key(state, name):
    return uuid5(NAMESPACE_URL, f"full-demo-v1/{state.data['prefix']}/{name}")


async def populate_full_demo(
    gateway, state, catalog_id, document, recommendation_cards=6, with_crew_calls=True
):
    """Local settings apply only inside this CLI process and are always restored."""
    previous = settings.semantic_assessment_enabled
    settings.semantic_assessment_enabled = False
    try:
        return await _populate(
            gateway, state, catalog_id, document, max(6, recommendation_cards), with_crew_calls
        )
    finally:
        settings.semantic_assessment_enabled = previous


async def _populate(gateway, state, catalog_id, document, count, with_crew_calls):
    session = gateway.session
    prefix = state.data["prefix"]
    # A finished run is a snapshot, not a command to reset a tester's subsequent work.
    if "full-demo-v1" in state.data:
        return state.data["full-demo-v1"]
    result = await populate_training(gateway, state, catalog_id, document, count, with_crew_calls)

    async def create(name, resource, payload):
        marker = f"full-demo-v1-{name}"
        if marker not in state.data["ids"]:
            # Recover a committed create if writing the local checkpoint was interrupted.
            model, clause = {
                "users": (User, User.username == payload.get("username")),
                "lessons/start": (Lesson, Lesson.start_request_id == payload.get("request_id")),
                "cards": (
                    CardTemplate,
                    (CardTemplate.title == payload.get("title"))
                    & (CardTemplate.created_by_id == gateway.teacher.id),
                ),
                "scenarios": (
                    ScenarioVersion,
                    (ScenarioVersion.title == payload.get("title"))
                    & (ScenarioVersion.approved_by_id == gateway.teacher.id),
                ),
                "groups": (
                    TrainingGroup,
                    (TrainingGroup.name == payload.get("name"))
                    & (TrainingGroup.teacher_id == gateway.teacher.id),
                ),
            }.get(resource, (None, None))
            existing = await session.scalar(select(model).where(clause)) if model else None
            if existing:
                value = str(existing.id)
            else:
                value = (await gateway.create(resource, payload))["id"]
            state.remember(marker, value)
        return state.data["ids"][marker]

    group_id = state.data["ids"]["source-training-group"]
    student_ids = [state.data["ids"]["source-training-student"]]
    for suffix, first, last in (
        ("student-good", "Анна", "Примерова"),
        ("student-help", "Иван", "Практиков"),
        ("student-new", "Мария", "Начинающая"),
    ):
        account = state.data["accounts"].setdefault(
            suffix,
            {
                "username": f"{prefix}-{suffix}",
                "initial_password": secrets.token_urlsafe(24),
                "password": f"{prefix}-{suffix}-123",
            },
        )
        state.save()
        student_id = await create(
            suffix,
            "users",
            dict(
                username=account["username"],
                initial_password=account["initial_password"],
                role="student",
                first_name=first,
                last_name=last,
            ),
        )
        account["pending_password"] = account["password"]
        await gateway.prepare_account(student_id, account)
        account.pop("pending_password")
        state.save()
        await gateway.enroll(group_id, student_id)
        student_ids.append(student_id)
        result["accounts"][suffix] = {k: account[k] for k in ("username", "password")}

    # One-card versions avoid artificial sleeps for DDS arrivals during an offline seed.
    scenario_ids = {}
    for role in ("operator_112", "dds"):
        original = await session.get(
            ScenarioVersion, UUID(result["learning"]["scenario_ids"][role])
        )
        scenario_ids[role] = await create(
            f"scenario-{role}",
            "scenarios",
            {
                "title": f"{prefix}: демо — {'112' if role == 'operator_112' else 'ДДС'}",
                "role": role,
                "card_ids": result["learning"]["card_ids"][:1],
                "service_profile_id": str(original.service_profile_id)
                if original.service_profile_id
                else None,
                "instructions": original.instructions,
                "arrival_offsets_seconds": [0],
            },
        )

    lessons = {}
    completed = []
    for role, scenario_id in scenario_ids.items():
        for kind, label in (
            ("introduction", "Освоение интерфейса"),
            ("practice", "Практика"),
            ("skill_practice", "Отработка навыков"),
            ("review", "Повторение"),
            ("assessment", "Контроль"),
        ):
            name = f"result-{role}-{kind}"
            learning = {
                "kind": kind,
                "assistance": {"max_level": "none" if kind == "assessment" else "solution"},
            }
            if kind in {"skill_practice", "review"}:
                learning["target_skills"] = (
                    ["address", "classification"]
                    if role == "operator_112"
                    else ["dds_crews", "dds_response"]
                )
            lesson_id = await create(
                name,
                "lessons/start",
                {
                    "request_id": str(key(state, name)),
                    "student_ids": student_ids,
                    "scenario_version_id": scenario_id,
                    "learning": learning,
                    "title": f"{prefix}: результаты {role} — {label}",
                },
            )
            lessons[name] = lesson_id
            # New learner retains a ready assignment in every format; other learners
            # demonstrate strong, incomplete and assisted work in the same class report.
            for index, student_id in enumerate(student_ids[:3]):
                completed.extend(
                    await complete_lesson(gateway, state, lesson_id, student_id, role, kind, index)
                )

    for mode, title in (
        ("paused", "Продолжить после паузы"),
        ("planned", "Запланированное занятие"),
        ("timed", "Личный лимит 20 минут"),
        ("expired", "Срок истёк — незавершённая работа"),
    ):
        name = f"lesson-{mode}"
        payload = {
            "request_id": str(key(state, name)),
            "student_ids": student_ids,
            "scenario_version_id": scenario_ids["operator_112"],
            "title": f"{prefix}: {title}",
            "learning": {"kind": "practice"},
        }
        if mode == "planned":
            # Freeze the planned dates on the first run so retries keep the same fingerprint.
            window = state.data.setdefault(
                "full-demo-window",
                {
                    "available_from": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
                    "available_until": (datetime.now(UTC) + timedelta(days=8)).isoformat(),
                },
            )
            state.save()
            payload.update(window)
        if mode == "timed":
            payload["time_limit_seconds"] = 1200
        if mode == "expired":
            payload["student_ids"] = student_ids[:1]
            payload["time_limit_seconds"] = 1
        lessons[mode] = await create(name, "lessons/start", payload)
    await paused_lesson(session, state, lessons["paused"], student_ids[0])
    await expired_lesson(session, lessons["expired"], student_ids[0])
    await teacher_review(
        session,
        state,
        gateway.teacher.id,
        lessons["result-operator_112-assessment"],
        student_ids[2],
    )

    source = await session.get(CardTemplate, UUID(result["learning"]["card_ids"][0]))
    support = await populate_support(
        gateway, state, create, student_ids, group_id, source, completed, result
    )
    result["full_demo"] = {
        "version": 1,
        "student_ids": student_ids,
        "lessons": lessons,
        "completed_attempt_ids": completed,
        **support,
    }
    # Do not change the semantics of the legacy card_count (training plan only).
    state.data["full-demo-v1"] = result
    state.save()
    return result
