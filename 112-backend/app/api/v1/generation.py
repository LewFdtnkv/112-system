from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import and_, func, select
from sqlalchemy.orm import aliased

from app.api.dependencies import SessionDep, TeacherDep
from app.api.pagination import Limit, Offset
from app.models import AIJob, User
from app.models.enums import AIPurpose, JobStatus
from app.schemas.generation import GenerationCreate, GenerationRead
from app.schemas.views import Page
from app.services.card_generation import CHOICES, PROMPT_VERSION, enqueue, read_job
from app.services.generation.catalogs import PATRONYMIC_PROBABILITY, address_catalog

router = APIRouter(prefix="/card-generations", tags=["card generation"])


@router.get("/options")
async def options(teacher: TeacherDep):
    from app.services.generation.library import library

    version, templates = library()
    return {
        **CHOICES,
        "patronymic_probability": PATRONYMIC_PROBABILITY,
        "addresses": address_catalog()["addresses"],
        "address_source": {k: address_catalog()[k] for k in ("source", "source_url", "license")},
        "max_count": 10,
        "max_victims_count": max(row.victims_limit for row in templates),
        "template_count": len(templates),
        "template_version": version,
        "supported_types": sorted({name for row in templates for name in row.types}),
    }


@router.post("", response_model=list[GenerationRead], status_code=202)
async def create(payload: GenerationCreate, session: SessionDep, teacher: TeacherDep):
    return await enqueue(session, teacher.id, payload)


@router.get("", response_model=Page[GenerationRead])
async def list_jobs(
    session: SessionDep,
    teacher: TeacherDep,
    limit: Limit = 20,
    offset: Offset = 0,
    pending_only: bool = False,
):
    query = select(AIJob).where(
        AIJob.created_by_id == teacher.id,
        AIJob.purpose.in_([AIPurpose.GENERATION, AIPurpose.DDS_GENERATION]),
    )
    if pending_only:
        later = aliased(AIJob)
        resolved = (
            select(later.id)
            .where(
                later.created_by_id == AIJob.created_by_id,
                later.target_card_id == AIJob.target_card_id,
                later.purpose == AIPurpose.DDS_GENERATION,
                later.status == JobStatus.SUCCEEDED,
                later.created_at > AIJob.created_at,
            )
            .exists()
        )
        # Keep the audit history, but hide DDS failures resolved by a later success.
        query = query.where(
            AIJob.status != JobStatus.SUCCEEDED,
            ~and_(
                AIJob.purpose == AIPurpose.DDS_GENERATION,
                AIJob.status == JobStatus.FAILED,
                resolved,
            ),
        )
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    offset = min(offset, max(0, ((total - 1) // limit) * limit))
    jobs = await session.scalars(
        query.order_by(AIJob.created_at.desc(), AIJob.id).limit(limit).offset(offset)
    )
    return Page(items=[read_job(j) for j in jobs], total=total, limit=limit, offset=offset)


@router.post("/{job_id}/retry", response_model=GenerationRead)
async def retry(job_id: UUID, session: SessionDep, teacher: TeacherDep):
    await session.scalar(select(User).where(User.id == teacher.id).with_for_update())
    job = await session.scalar(
        select(AIJob)
        .where(
            AIJob.id == job_id,
            AIJob.created_by_id == teacher.id,
            AIJob.purpose.in_([AIPurpose.GENERATION, AIPurpose.DDS_GENERATION]),
        )
        .with_for_update()
    )
    if job is None:
        raise HTTPException(404, "Генерация не найдена")
    if job.purpose == AIPurpose.DDS_GENERATION:
        raise HTTPException(
            409, "Откройте карточку и запустите новую генерацию ДДС по актуальным данным."
        )
    if job.prompt_version != PROMPT_VERSION:
        raise HTTPException(409, "Формат генерации обновлён. Создайте новый пакет карточек.")
    if job.status != JobStatus.FAILED:
        raise HTTPException(409, "Повтор доступен только для неудачной генерации")
    pending = await session.scalar(
        select(func.count())
        .select_from(AIJob)
        .where(
            AIJob.created_by_id == teacher.id,
            AIJob.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]),
        )
    )
    if pending >= 30:
        raise HTTPException(409, "Дождитесь завершения предыдущих генераций")
    job.status, job.retry_count, job.error = JobStatus.QUEUED, 0, None
    job.worker_id = job.lease_expires_at = job.completed_at = None
    job.available_at = func.now()
    await session.commit()
    return read_job(job)
