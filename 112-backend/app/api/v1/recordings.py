from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse

from app.api.dependencies import SessionDep, TeacherDep
from app.services.telephony import media, recordings

router = APIRouter(prefix="/telephony/recordings", tags=["recording library"])
Purpose = Literal["caller", "greeting", "acknowledgment"]


@router.get("")
async def list_recordings(
    session: SessionDep,
    teacher: TeacherDep,
    query: Annotated[str, Query(max_length=255)] = "",
    purpose: Purpose | None = None,
    offset: Annotated[int, Query(ge=0, le=1000000)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
):
    return await recordings.list_recordings(
        session, teacher.id, query=query.strip(), purpose=purpose, offset=offset, limit=limit
    )


@router.post("", status_code=201)
async def upload(
    request: Request,
    session: SessionDep,
    teacher: TeacherDep,
    title: Annotated[str, Query(min_length=1, max_length=255)],
    purpose: Purpose,
):
    if not title.strip():
        raise HTTPException(422, "Укажите название записи")
    return await recordings.create_recording(
        session, teacher.id, title.strip(), purpose, await media.read_upload(request)
    )


@router.get("/{recording_id}")
async def detail(recording_id: UUID, session: SessionDep, teacher: TeacherDep):
    row, asset = await recordings.owned_recording(session, recording_id, teacher.id)
    return recordings.read_recording(row, asset)


@router.get("/{recording_id}/wav")
async def preview(recording_id: UUID, session: SessionDep, teacher: TeacherDep):
    _, asset = await recordings.owned_recording(session, recording_id, teacher.id)
    if (
        asset.status != "ready"
        or not asset.file_key
        or not media.audio_path(asset.file_key).is_file()
    ):
        raise HTTPException(409, "Запись ещё не готова")
    return FileResponse(
        media.audio_path(asset.file_key),
        media_type="audio/wav",
        headers={"Cache-Control": "no-store"},
    )
