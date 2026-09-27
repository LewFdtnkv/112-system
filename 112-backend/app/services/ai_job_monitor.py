"""Read-only administrator projections; heavy payloads are fetched only on selection."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import String, and_, cast, func, or_, select
from sqlalchemy.orm import aliased

from app.models import AIJob, User
from app.models.enums import JobStatus
from app.schemas.ai_jobs import AIJobDetail, AIJobItem, AIJobPage, AIJobSummary

creator = aliased(User)
student = aliased(User)


def projection():
    return (
        select(
            AIJob.id,
            AIJob.purpose,
            AIJob.status,
            AIJob.created_by_id,
            creator.username.label("created_by_username"),
            AIJob.student_id,
            student.username.label("student_username"),
            AIJob.model_version,
            AIJob.retry_count,
            AIJob.created_at,
            AIJob.available_at,
            AIJob.completed_at,
            AIJob.lease_expires_at,
            and_(
                AIJob.status == JobStatus.RUNNING,
                func.coalesce(AIJob.lease_expires_at <= func.now(), False),
            ).label("lease_expired"),
            AIJob.output["inference"]["source"].astext.label("generation_method"),
            func.left(AIJob.error, 240).label("error_summary"),
        )
        .outerjoin(creator, AIJob.created_by_id == creator.id)
        .outerjoin(student, AIJob.student_id == student.id)
    )


async def list_jobs(session, *, status, purpose, q, limit, offset):
    conditions = []
    if status is not None:
        conditions.append(AIJob.status == status)
    if purpose is not None:
        conditions.append(AIJob.purpose == purpose)
    if q.strip():
        conditions.append(
            or_(
                cast(AIJob.id, String).icontains(q.strip(), autoescape=True),
                AIJob.model_version.icontains(q.strip(), autoescape=True),
                creator.username.icontains(q.strip(), autoescape=True),
                student.username.icontains(q.strip(), autoescape=True),
            )
        )
    filtered = and_(*conditions) if conditions else True
    counts = (
        (
            await session.execute(
                select(
                    *(func.count().filter(AIJob.status == s).label(s.value) for s in JobStatus),
                    func.count().filter(filtered).label("total"),
                    func.now().label("as_of"),
                )
                .select_from(AIJob)
                .outerjoin(creator, AIJob.created_by_id == creator.id)
                .outerjoin(student, AIJob.student_id == student.id)
            )
        )
        .mappings()
        .one()
    )
    total = counts["total"]
    offset = min(offset, max(0, ((total - 1) // limit) * limit))
    rows = (
        await session.execute(
            projection()
            .where(filtered)
            .order_by(AIJob.created_at.desc(), AIJob.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).mappings()
    return AIJobPage(
        items=[AIJobItem.model_validate(r) for r in rows],
        total=total,
        offset=offset,
        limit=limit,
        summary=AIJobSummary.model_validate(counts),
        as_of=counts["as_of"],
    )


async def get_job(session, job_id: UUID):
    row = (
        (
            await session.execute(
                projection()
                .add_columns(
                    AIJob.prompt_version,
                    AIJob.idempotency_key,
                    AIJob.card_template_id,
                    AIJob.target_card_id,
                    AIJob.parent_job_id,
                    AIJob.scenario_version_id,
                    AIJob.attempt_id,
                    AIJob.input,
                    AIJob.context,
                    AIJob.output,
                    AIJob.error,
                )
                .where(AIJob.id == job_id)
            )
        )
        .mappings()
        .one_or_none()
    )
    if row is None:
        raise HTTPException(404, "ИИ-задача не найдена")
    return AIJobDetail.model_validate(row)
