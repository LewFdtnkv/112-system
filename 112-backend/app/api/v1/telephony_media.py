from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.api.dependencies import SessionDep, TeacherDep
from app.models import CallCue, ScenarioCard, SpeechAsset
from app.schemas.telephony import AudioUpdate
from app.services.authoring.scenarios import owned_scenario
from app.services.telephony import media

router = APIRouter(prefix="/telephony", tags=["telephone audio"])


def asset_read(asset):
    return {
        key: getattr(asset, key)
        for key in (
            "id",
            "text",
            "voice",
            "generator_version",
            "status",
            "duration_seconds",
            "error",
        )
    }


async def owned_cue(session, cue_id, teacher_id):
    cue = await session.get(CallCue, cue_id)
    if not cue:
        raise HTTPException(404, "Сообщение не найдено")
    card = await session.get(ScenarioCard, cue.scenario_card_id)
    await owned_scenario(session, card.scenario_version_id, teacher_id)
    return cue


@router.get("/scenarios/{version_id}/media")
async def list_media(version_id: UUID, session: SessionDep, teacher: TeacherDep):
    scenario = await owned_scenario(session, version_id, teacher.id)
    await media.prepare_scenario(session, scenario)
    await session.commit()
    rows = (
        await session.execute(
            select(CallCue, SpeechAsset, ScenarioCard)
            .join(SpeechAsset, SpeechAsset.id == CallCue.audio_id)
            .join(ScenarioCard, ScenarioCard.id == CallCue.scenario_card_id)
            .where(ScenarioCard.scenario_version_id == version_id)
            .order_by(ScenarioCard.position, CallCue.contact_name)
        )
    ).all()
    return [
        {
            "id": c.id,
            "card_title": card.snapshot.get("title", f"Карточка {card.position}"),
            "contact_name": c.contact_name,
            "audio": asset_read(a),
        }
        for c, a, card in rows
    ]


@router.put("/cues/{cue_id}")
async def update_cue(cue_id: UUID, payload: AudioUpdate, session: SessionDep, teacher: TeacherDep):
    cue = await owned_cue(session, cue_id, teacher.id)
    asset = await media.asset_for(session, payload.text, payload.voice, payload.generator_version)
    cue.audio_id = asset.id
    cue.audio_variants = []
    if asset.status == "failed":
        asset.status, asset.attempts, asset.error = "queued", 0, None
    await session.commit()
    return asset_read(asset)


@router.put("/cues/{cue_id}/wav")
async def upload(cue_id: UUID, request: Request, session: SessionDep, teacher: TeacherDep):
    cue = await owned_cue(session, cue_id, teacher.id)
    data = await media.read_upload(request)
    # Upload is versioned by content, so replacing a cue never changes recordings of past calls.
    key, _ = media.store_wav(data)
    source = await session.get(SpeechAsset, cue.audio_id)
    asset = await media.asset_for(session, source.text, source.voice, f"upload:{key}")
    media.complete(asset, data)
    cue.audio_id = asset.id
    cue.audio_variants = []
    await session.commit()
    return asset_read(asset)


@router.get("/cues/{cue_id}/wav")
async def preview(cue_id: UUID, session: SessionDep, teacher: TeacherDep):
    cue = await owned_cue(session, cue_id, teacher.id)
    asset = await session.get(SpeechAsset, cue.audio_id)
    if asset.status != "ready" or not asset.file_key:
        raise HTTPException(409, "Запись ещё не готова")
    return FileResponse(
        media.audio_path(asset.file_key),
        media_type="audio/wav",
        headers={"Cache-Control": "no-store"},
    )
