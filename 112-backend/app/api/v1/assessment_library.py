from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Query

from app.api.dependencies import SessionDep, TeacherDep
from app.schemas.assessment_memory import (
    MemoryLibraryItem,
    MemoryLibraryPage,
    MemoryPreferenceUpdate,
)
from app.services.assessment_memory import catalog

router = APIRouter(prefix="/assessment-memory", tags=["assessment memory"])


@router.get("", response_model=MemoryLibraryPage)
async def listing(
    session: SessionDep,
    teacher: TeacherDep,
    q: str = Query(default="", max_length=200),
    kind: Literal["text", "services", "dds"] | None = None,
    state: Literal["all", "enabled", "disabled"] = "all",
    include_removed: bool = False,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    return await catalog.listing(
        session, teacher.id, q, kind, state, include_removed, limit, offset
    )


@router.patch("/{example_id}", response_model=MemoryLibraryItem)
async def update(
    example_id: UUID, payload: MemoryPreferenceUpdate, session: SessionDep, teacher: TeacherDep
):
    return await catalog.update(session, teacher.id, example_id, enabled=payload.enabled)


@router.delete("/{example_id}", response_model=MemoryLibraryItem)
async def remove(example_id: UUID, session: SessionDep, teacher: TeacherDep):
    return await catalog.update(session, teacher.id, example_id, removed=True)
