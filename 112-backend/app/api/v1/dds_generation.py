from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.api.dependencies import SessionDep, TeacherDep
from app.models import AIJob
from app.models.enums import AIPurpose
from app.schemas.dds_generation import DDSGenerationCreate
from app.schemas.generation import GenerationRead
from app.services.authoring.cards import owned_card
from app.services.card_generation import read_job
from app.services.dds_generation.jobs import enqueue

router = APIRouter(prefix="/cards", tags=["DDS generation"])


@router.post("/{card_id}/dds-generations", response_model=GenerationRead, status_code=202)
async def create(
    card_id: UUID, payload: DDSGenerationCreate, session: SessionDep, teacher: TeacherDep
):
    return read_job(await enqueue(session, teacher.id, card_id, payload))


@router.get("/{card_id}/dds-generations", response_model=list[GenerationRead])
async def jobs(card_id: UUID, session: SessionDep, teacher: TeacherDep):
    await owned_card(session, card_id, teacher.id)
    rows = await session.scalars(
        select(AIJob)
        .where(
            AIJob.target_card_id == card_id,
            AIJob.created_by_id == teacher.id,
            AIJob.purpose == AIPurpose.DDS_GENERATION,
        )
        .order_by(AIJob.created_at.desc())
        .limit(10)
    )
    return [read_job(job) for job in rows]
