from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import SessionDep
from app.models import Workstation
from app.schemas.workstation import WorkstationCreate, WorkstationRead

router = APIRouter(prefix="/workstations", tags=["workstations"])


@router.post("", response_model=WorkstationRead, status_code=status.HTTP_201_CREATED)
async def create_workstation(payload: WorkstationCreate, session: SessionDep) -> Workstation:
    workstation = Workstation(**payload.model_dump())
    session.add(workstation)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        # PostgreSQL 23505 is a unique constraint violation, including concurrent requests.
        if getattr(exc.orig, "sqlstate", None) == "23505":
            raise HTTPException(status_code=409, detail="Workstation code already exists") from exc
        raise
    await session.refresh(workstation)
    return workstation


@router.get("", response_model=list[WorkstationRead])
async def list_workstations(
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[Workstation]:
    result = await session.scalars(
        select(Workstation)
        .order_by(Workstation.created_at, Workstation.id)
        .limit(limit)
        .offset(offset)
    )
    return list(result)


@router.get("/{workstation_id}", response_model=WorkstationRead)
async def get_workstation(workstation_id: UUID, session: SessionDep) -> Workstation:
    workstation = await session.get(Workstation, workstation_id)
    if workstation is None:
        raise HTTPException(status_code=404, detail="Workstation not found")
    return workstation
