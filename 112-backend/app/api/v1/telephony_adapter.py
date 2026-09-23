import secrets
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select

from app.api.dependencies import SessionDep
from app.core.config import settings
from app.models import SpeechAsset
from app.schemas.telephony import AdapterEvent, AudioFailure, CallRead
from app.services.telephony import calls, media

router = APIRouter(prefix="/telephony-adapter", tags=["trusted telephony adapters"])


def check_token(secret, supplied):
    if (
        not secret
        or not supplied
        or not secrets.compare_digest(secret.get_secret_value(), supplied)
    ):
        raise HTTPException(401, "Adapter authentication required")


async def pbx_token(x_adapter_token: Annotated[str | None, Header()] = None):
    check_token(settings.telephony_adapter_token, x_adapter_token)


async def generator_token(x_generator_token: Annotated[str | None, Header()] = None):
    check_token(settings.speech_generator_token, x_generator_token)


@router.post("/pbx/{provider}/events", response_model=CallRead, dependencies=[Depends(pbx_token)])
async def event(provider: str, payload: AdapterEvent, session: SessionDep):
    return await calls.external_event(session, provider, payload)


@router.post("/speech/claim", dependencies=[Depends(generator_token)])
async def claim(session: SessionDep):
    asset = await media.claim(session)
    if not asset:
        return None
    return {
        "id": asset.id,
        "lease_token": asset.lease_token,
        "leased_until": asset.leased_until,
        "text": asset.text,
        "voice": asset.voice,
        "generator_version": asset.generator_version,
        "output": {"format": "wav", "sample_rate": 8000, "channels": 1, "sample_width": 2},
    }


async def leased_asset(session, asset_id, token):
    asset = await session.scalar(
        select(SpeechAsset).where(SpeechAsset.id == asset_id).with_for_update()
    )
    if (
        not asset
        or asset.status != "preparing"
        or asset.lease_token != token
        or not asset.leased_until
        or asset.leased_until <= datetime.now(UTC)
    ):
        raise HTTPException(409, "Generation lease expired or superseded")
    return asset


@router.put("/speech/{asset_id}/wav", dependencies=[Depends(generator_token)])
async def generated(asset_id: UUID, lease_token: UUID, request: Request, session: SessionDep):
    data = await media.read_upload(request)
    asset = await leased_asset(session, asset_id, lease_token)
    media.complete(asset, data)
    await session.commit()
    return {"status": "ready"}


@router.post("/speech/{asset_id}/failed", dependencies=[Depends(generator_token)])
async def failed(asset_id: UUID, payload: AudioFailure, session: SessionDep):
    asset = await leased_asset(session, asset_id, payload.lease_token)
    asset.status = "queued" if asset.attempts < 3 else "failed"
    asset.error, asset.lease_token, asset.leased_until = payload.error, None, None
    await session.commit()
    return {"status": asset.status}


@router.get("/pbx/{provider}/stations/{endpoint}", dependencies=[Depends(pbx_token)])
async def context(provider: str, endpoint: str, session: SessionDep):
    from app.models import Attempt, TelephonyStation

    station = await session.scalar(
        select(TelephonyStation).where(
            TelephonyStation.provider == provider,
            TelephonyStation.endpoint == endpoint,
            TelephonyStation.mode == "external",
            TelephonyStation.enabled.is_(True),
        )
    )
    if not station or not station.attempt_id:
        raise HTTPException(404, "No workstation binding")
    attempt = await session.get(Attempt, station.attempt_id)
    if not await calls.binding_is_active(session, station, attempt):
        raise HTTPException(409, "Attempt has ended")
    active = await calls.active_call(session, station.id)
    return {
        "attempt_id": attempt.id,
        "student_id": attempt.student_id,
        "pending_call": CallRead.model_validate(active, from_attributes=True) if active else None,
        "contacts": [
            {"key": c.contact_key, "name": c.contact_name, "audio_ready": a.status == "ready"}
            for c, a in await calls.available_cues(session, attempt)
        ],
    }


@router.get("/pbx/{provider}/calls/{call_id}/wav", dependencies=[Depends(pbx_token)])
async def call_audio(provider: str, call_id: UUID, session: SessionDep):
    from fastapi.responses import FileResponse

    from app.models import TrainingCall

    call = await session.get(TrainingCall, call_id)
    if not call or call.provider != provider or provider == "local" or not call.audio_id:
        raise HTTPException(404, "No prepared call audio")
    asset = await session.get(SpeechAsset, call.audio_id)
    return FileResponse(media.audio_path(asset.file_key), media_type="audio/wav")


@router.post("/speech/{asset_id}/renew", dependencies=[Depends(generator_token)])
async def renew(asset_id: UUID, lease_token: UUID, session: SessionDep):
    from datetime import timedelta

    asset = await leased_asset(session, asset_id, lease_token)
    asset.leased_until = datetime.now(UTC) + timedelta(minutes=10)
    await session.commit()
    return {"leased_until": asset.leased_until}
