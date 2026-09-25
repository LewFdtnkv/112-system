from uuid import UUID

from fastapi import APIRouter, Response

from app.api.dependencies import AdminDep, SessionDep
from app.api.pagination import Limit, Offset, Search
from app.models.enums import AIPurpose, JobStatus
from app.schemas.ai_jobs import AIJobDetail, AIJobPage
from app.services import ai_job_monitor

router = APIRouter(prefix="/admin/ai-jobs", tags=["administration"])


@router.get("", response_model=AIJobPage)
async def list_jobs(
    session: SessionDep,
    admin: AdminDep,
    response: Response,
    status: JobStatus | None = None,
    purpose: AIPurpose | None = None,
    q: Search = "",
    limit: Limit = 20,
    offset: Offset = 0,
):
    response.headers["Cache-Control"] = "no-store"
    return await ai_job_monitor.list_jobs(
        session, status=status, purpose=purpose, q=q, limit=limit, offset=offset
    )


@router.get("/{job_id}", response_model=AIJobDetail)
async def get_job(job_id: UUID, session: SessionDep, admin: AdminDep, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return await ai_job_monitor.get_job(session, job_id)
