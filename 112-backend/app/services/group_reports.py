"""Teacher-owned group evidence; counts are deterministic, AI selects teaching strategies."""

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import HTTPException
from sqlalchemy import select

from app.core.config import settings
from app.core.fingerprints import context_hash
from app.models import AIJob, Lesson, ScenarioVersion, User
from app.models.enums import AIPurpose, JobStatus
from app.services.ai_jobs.lease import valid_lease
from app.services.groups import owned_group
from app.services.learning_recommendations.profile import LABELS
from app.services.report_data import card_results
from app.services.views import lesson_rows_query

PROMPT_VERSION = "group-advice-v1"


def aggregate(cards):
    groups = {}
    skipped = 0
    for card in cards:
        if card.get("teacher_reviewed", bool(card["teacher_review"])):
            skipped += 1
            continue  # A whole-lesson override does not explain which automatic finding is upheld.
        if card["status"] not in {"completed", "interrupted"}:
            continue
        for skill, credit in card["credits"].items():
            if skill not in LABELS:
                continue
            key = (card["kind"], skill)
            g = groups.setdefault(
                key,
                {
                    "kind": card["kind"],
                    "skill": skill,
                    "label": LABELS[skill],
                    "students": set(),
                    "affected": set(),
                    "cards": set(),
                    "failed_cards": set(),
                    "examples": [],
                },
            )
            g["students"].add(card["student_id"])
            g["cards"].add(card["assignment_id"])
            if credit >= 0.999:
                continue
            g["affected"].add(card["student_id"])
            g["failed_cards"].add(card["assignment_id"])
            if len(g["examples"]) < 3:
                g["examples"].append(
                    {
                        "lesson_id": card["lesson_id"],
                        "student_id": card["student_id"],
                        "position": card["position"],
                        "label": LABELS[skill],
                    }
                )
    stats = [
        {
            **g,
            "students": len(g["students"]),
            "affected": len(g["affected"]),
            "cards": len(g["cards"]),
            "failed_cards": len(g["failed_cards"]),
        }
        for g in groups.values()
    ]
    skills = defaultdict(lambda: {"signal": "practice", "checked_cards": 0, "failed_cards": 0})
    for s in stats:
        skills[s["skill"]]["checked_cards"] += s["cards"]
        skills[s["skill"]]["failed_cards"] += s["failed_cards"]
    candidates = sorted(
        (k for k, v in skills.items() if v["failed_cards"]),
        key=lambda k: -skills[k]["failed_cards"],
    )[:4]
    return {
        "statistics": stats,
        "teacher_reviewed_cards": skipped,
        "profile": {"group": True, "skills": dict(skills), "candidates": candidates},
        "fingerprint": context_hash(cards),
    }


async def data(session, teacher_id, group_id, role, days):
    await owned_group(session, group_id, teacher_id)
    since = datetime.now(UTC) - timedelta(days=days)
    query = (
        lesson_rows_query(teacher_id=teacher_id)
        .where(
            Lesson.group_id == group_id,
            Lesson.created_at >= since,
            ScenarioVersion.role == role,
            Lesson.status != "cancelled",
        )
        .order_by(Lesson.created_at, Lesson.id)
        .limit(1001)
    )
    rows = (await session.execute(query)).mappings().all()
    if len(rows) > 1000:
        raise HTTPException(422, "Сократите период: больше 1000 результатов занятий.")
    return aggregate(await card_results(session, rows))


async def latest(session, teacher_id, group_id, role, days):
    return await session.scalar(
        select(AIJob)
        .where(
            AIJob.created_by_id == teacher_id,
            AIJob.purpose == AIPurpose.GROUP_RECOMMENDATION,
            AIJob.input["group_id"].astext == str(group_id),
            AIJob.input["role"].astext == role,
            AIJob.input["days"].as_integer() == days,
        )
        .order_by(AIJob.created_at.desc(), AIJob.id)
        .limit(1)
    )


async def enqueue(session, teacher_id, group_id, role, days):
    # Lock serializes duplicate button presses; the unique key protects retries.
    await owned_group(session, group_id, teacher_id, lock=True)
    report = await data(session, teacher_id, group_id, role, days)
    if not report["profile"]["candidates"]:
        raise HTTPException(422, "В выбранных работах нет подтверждённых ошибок для разбора.")
    key = uuid5(
        NAMESPACE_URL, f"group-advice/{teacher_id}/{group_id}/{role}/{days}/{report['fingerprint']}"
    )
    job = await session.scalar(select(AIJob).where(AIJob.idempotency_key == key))
    if not job:
        job = AIJob(
            purpose=AIPurpose.GROUP_RECOMMENDATION,
            created_by_id=teacher_id,
            idempotency_key=key,
            status=JobStatus.QUEUED,
            prompt_version=PROMPT_VERSION,
            model_version=settings.recommendation_model or settings.llm_model,
            input={"group_id": str(group_id), "role": role, "days": days, **report},
            context={},
        )
        session.add(job)
    elif job.status == JobStatus.FAILED:
        job.status, job.retry_count, job.error = JobStatus.QUEUED, 0, None
        job.available_at, job.completed_at = datetime.now(UTC), None
    await session.commit()
    return job


async def finish(session, job_id, token, output):
    from app.services.learning_recommendations.inference import validate

    job = await session.scalar(select(AIJob).where(AIJob.id == job_id).with_for_update())
    if not valid_lease(job, token):
        await session.rollback()
        return False
    owner = await session.get(User, job.created_by_id)
    if not owner or not owner.is_active or owner.role != "teacher":
        raise ValueError("Group analysis owner is no longer an active teacher")
    await owned_group(session, UUID(job.input["group_id"]), job.created_by_id)
    materials = job.context["materials"]["examples"]
    selected = validate({"selected_ids": output["selected_ids"]}, materials)
    job.output = {**output, "recommendations": [m for m in materials if m["id"] in selected]}
    job.status, job.completed_at = JobStatus.SUCCEEDED, datetime.now(UTC)
    job.worker_id = job.lease_expires_at = None
    await session.commit()
    return True
