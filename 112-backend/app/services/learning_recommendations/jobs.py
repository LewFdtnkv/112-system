"""Recoverable scheduling, bounded output and fenced publication into the learner inbox."""

from datetime import UTC, datetime
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select

from app.core.config import settings
from app.db.session import session_factory
from app.models import (
    AIJob,
    Assignment,
    Lesson,
    LessonEvaluation,
    MessageRecipient,
    ScenarioVersion,
    TeachingMessage,
    User,
)
from app.models.enums import AIPurpose, JobStatus
from app.services.learning_recommendations.inference import PROMPT_VERSION, validate
from app.services.learning_recommendations.profile import build_profile


async def enqueue(session, student_id, role):
    user = await session.scalar(select(User).where(User.id == student_id).with_for_update())
    if not user or not user.is_active or user.role != "student":
        return None
    profile = await build_profile(session, student_id, role)
    jobs = list(
        await session.scalars(
            select(AIJob)
            .where(
                AIJob.student_id == student_id,
                AIJob.purpose == AIPurpose.RECOMMENDATION,
                AIJob.input["profile"]["role"].astext == role,
            )
            .order_by(AIJob.created_at.desc(), AIJob.id)
        )
    )
    # Teacher corrections invalidate advice based on superseded grades. New lessons alone do not.
    messages = list(
        await session.scalars(
            select(TeachingMessage)
            .where(TeachingMessage.ai_job_id.in_([j.id for j in jobs]))
            .with_for_update()
        )
    )
    for message in messages:
        if any(
            profile["sources"].get(key) != value
            for key, value in message.details.get("sources", {}).items()
        ):
            message.details = message.details | {"obsolete": True}
    if not profile["candidates"] or any(
        j.status in {JobStatus.QUEUED, JobStatus.RUNNING} for j in jobs
    ):
        return None
    valid_ids = {m.ai_job_id for m in messages if not m.details.get("obsolete")}
    previous = next((j for j in jobs if j.id in valid_ids), None)
    if previous and previous.input["profile"]["signature"] == profile["signature"]:
        return None  # No identical advice after every lesson.
    key = uuid5(
        NAMESPACE_URL, f"study-advice/{student_id}/{role}/{profile['fingerprint']}/{PROMPT_VERSION}"
    )
    if any(j.idempotency_key == key for j in jobs):
        return None
    job = AIJob(
        purpose=AIPurpose.RECOMMENDATION,
        student_id=student_id,
        idempotency_key=key,
        prompt_version=PROMPT_VERSION,
        model_version=settings.recommendation_model or settings.llm_model,
        input={"profile": profile},
        context={},
    )
    session.add(job)
    await session.flush()
    return job


async def schedule(session):
    if not settings.learning_recommendations_enabled:
        return
    students = list(await session.scalars(select(LessonEvaluation.student_id).distinct()))
    for student_id in students:
        for role in ("operator_112", "dds"):
            await enqueue(session, student_id, role)
            await session.commit()


async def prepare(job):
    if "materials" in job.context:
        return
    from app.services.learning_recommendations.materials import retrieve

    async with session_factory() as session:
        bundle = await retrieve(session, job.input["profile"])
        await session.commit()
    async with session_factory() as session:
        row = await session.scalar(select(AIJob).where(AIJob.id == job.id).with_for_update())
        if not valid_lease(row, job.worker_id):
            raise ValueError("Recommendation lease expired")
        row.context = row.context | {"materials": bundle}
        await session.commit()
        job.context = row.context


def valid_lease(job, token):
    return bool(
        job
        and job.status == JobStatus.RUNNING
        and job.worker_id == token
        and job.lease_expires_at > datetime.now(UTC)
    )


async def available_lessons(session, student_id, role):
    now = datetime.now(UTC)
    evaluated = select(LessonEvaluation.lesson_id).where(LessonEvaluation.student_id == student_id)
    return list(
        await session.scalars(
            select(Lesson)
            .join(Assignment, Assignment.lesson_id == Lesson.id)
            .join(ScenarioVersion, ScenarioVersion.id == Lesson.scenario_version_id)
            .where(
                Assignment.student_id == student_id,
                ScenarioVersion.role == role,
                Lesson.status == "active",
                Lesson.id.not_in(evaluated),
                (Lesson.available_from.is_(None) | (Lesson.available_from <= now)),
                (Lesson.available_until.is_(None) | (Lesson.available_until > now)),
            )
            .distinct()
            .order_by(Lesson.created_at, Lesson.id)
        )
    )


def render(profile, selected):
    skills = profile["skills"]
    strengths = [s["label"].lower() for s in skills.values() if s["signal"] == "ready"][:2]
    text = []
    if strengths:
        text.append(
            "В последних самостоятельных работах успешно выполнены проверенные задания по навыкам: "
            + ", ".join(strengths)
            + "."
        )
    for material in selected:
        s = skills[material["skill"]]
        text.append(
            f"{s['label']}: в последних {s['cards']} проверенных карточках "
            f"полностью верно выполнено {s['correct']}, с расхождениями — {s['errors']}. "
            + (
                "Повторяются расхождения в полях: "
                + ", ".join(f"«{f['label']}» ({f['cards']})" for f in s["recurring_fields"])
                + ". "
                if s.get("recurring_fields")
                else ""
            )
            + (
                f"В {s['assisted']} карточках выдавались подсказки; это не штраф. "
                if s["assisted"]
                else ""
            )
            + material["text"]
        )
    return "\n\n".join(text)


async def finish(session, job_id, token, output):
    job = await session.scalar(select(AIJob).where(AIJob.id == job_id).with_for_update())
    if not valid_lease(job, token):
        await session.rollback()
        return False
    user = await session.scalar(select(User).where(User.id == job.student_id).with_for_update())
    current = await build_profile(session, job.student_id, job.input["profile"]["role"])
    output = dict(output)
    examples = job.context.get("materials", {}).get("examples", [])
    if (
        not user.is_active
        or current["fingerprint"] != job.input["profile"]["fingerprint"]
        or not examples
    ):
        output["publication"] = "superseded_or_unavailable"
    else:
        selected_ids = validate({"selected_ids": output["selected_ids"]}, examples)
        selected = [next(m for m in examples if m["id"] == i) for i in selected_ids]
        lessons = await available_lessons(session, job.student_id, current["role"])
        suggestions = []
        for m in selected:
            match = next(
                (
                    lesson
                    for lesson in lessons
                    if lesson.learning.get("kind") == m["lesson_kind"]
                    and (
                        m["strategy"] != "less_help"
                        or lesson.learning.get("assistance", {}).get("max_level")
                        in {"none", "goal"}
                    )
                    and (
                        lesson.learning.get("kind") not in {"skill_practice", "review"}
                        or m["skill"] in lesson.learning.get("target_skills", [])
                    )
                ),
                None,
            )
            suggestions.append(
                {
                    "skill": m["skill"],
                    "label": current["skills"][m["skill"]]["label"],
                    "lesson_id": str(match.id) if match else None,
                    "lesson_title": match.title if match else None,
                }
            )
        message = TeachingMessage(
            source="learning_advice",
            ai_job_id=job.id,
            teacher_id=None,
            text=render(current, selected),
            details={
                "version": PROMPT_VERSION,
                "role": current["role"],
                "mode": output["mode"],
                "sources": current["sources"],
                "skills": current["skills"],
                "suggestions": suggestions,
                "obsolete": False,
            },
        )
        session.add(message)
        await session.flush()
        session.add(MessageRecipient(message_id=message.id, student_id=job.student_id))
        output.update(publication="sent", message_id=str(message.id))
    job.output, job.status, job.completed_at = output, JobStatus.SUCCEEDED, datetime.now(UTC)
    job.worker_id = job.lease_expires_at = None
    await session.commit()
    return True
