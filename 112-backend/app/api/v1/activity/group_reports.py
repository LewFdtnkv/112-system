from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Query

from app.api.dependencies import SessionDep, TeacherDep
from app.services import group_reports

router = APIRouter(tags=["activity"])
Days = Annotated[int, Query(ge=1, le=365)]
Role = Literal["operator_112", "dds"]


@router.get("/teaching/groups/{group_id}/analysis")
async def read(
    group_id: UUID, session: SessionDep, teacher: TeacherDep, role: Role = "dds", days: Days = 30
):
    report = await group_reports.data(session, teacher.id, group_id, role, days)
    job = await group_reports.latest(session, teacher.id, group_id, role, days)
    return {
        **report,
        "job": {
            "id": str(job.id),
            "status": job.status,
            "error": job.error,
            "obsolete": job.input["fingerprint"] != report["fingerprint"],
            "mode": (job.output or {}).get("mode"),
            "recommendations": (job.output or {}).get("recommendations", []),
        }
        if job
        else None,
    }


@router.post("/teaching/groups/{group_id}/analysis", status_code=202)
async def create(
    group_id: UUID, session: SessionDep, teacher: TeacherDep, role: Role = "dds", days: Days = 30
):
    job = await group_reports.enqueue(session, teacher.id, group_id, role, days)
    return {"id": str(job.id), "status": job.status}
