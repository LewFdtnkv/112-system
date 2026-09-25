import hashlib
import io
import json
import os
import wave
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, Request
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert

from app.core.config import settings
from app.models import CallCue, ScenarioCard, SpeechAsset, TrainingContact
from app.services.telephony.voice_pack import greeting_bytes

MAX_BYTES = 10_000_000


def directory():
    path = Path(settings.telephony_media_directory)
    path.mkdir(parents=True, exist_ok=True)
    return path


def audio_path(key):
    if len(key) != 64 or any(c not in "0123456789abcdef" for c in key):
        raise ValueError("Invalid audio key")
    return directory() / f"{key}.wav"


async def asset_for(session, text, voice=None, version=None):
    voice = voice or settings.speech_voice
    version = version or settings.speech_generator_version
    fingerprint = hashlib.sha256(
        json.dumps([text, voice, version], ensure_ascii=False).encode()
    ).hexdigest()
    await session.execute(
        insert(SpeechAsset)
        .values(
            id=uuid4(),
            fingerprint=fingerprint,
            text=text,
            voice=voice,
            generator_version=version,
            status="queued",
            attempts=0,
        )
        .on_conflict_do_nothing(index_elements=["fingerprint"])
    )
    return await session.scalar(select(SpeechAsset).where(SpeechAsset.fingerprint == fingerprint))


async def prepare_scenario(session, scenario):
    cards = list(
        await session.scalars(
            select(ScenarioCard)
            .where(ScenarioCard.scenario_version_id == scenario.id)
            .order_by(ScenarioCard.position)
        )
    )
    contacts = (
        list(
            await session.scalars(
                select(TrainingContact).where(
                    TrainingContact.profile_id == scenario.service_profile_id
                )
            )
        )
        if scenario.service_profile_id
        else []
    )
    for card in cards:
        # Only student-visible messages; never feed hidden answers into call audio.
        message = card.snapshot.get("caller_message") or scenario.caller_message or ""
        targets = [("caller", "Заявитель", message)]
        if scenario.role == "dds":
            message = "\n".join(
                step["message"]
                for step in scenario.completion_rules.get("dds", {}).get("steps", [])
            )
            targets = [(c.code, c.name, message) for c in contacts]
        for key, name, text in targets:
            if not text.strip():
                continue
            if scenario.role == "dds" and scenario.completion_rules.get("dds", {}).get(
                "crew_calls_required"
            ):
                greeting, data = greeting_bytes()
                asset = await asset_for(session, greeting, "crew-voice-pack", "crew-dialogue-v1")
                complete(asset, data)
            else:
                asset = await asset_for(session, text)
            await session.execute(
                insert(CallCue)
                .values(
                    id=uuid4(),
                    scenario_card_id=card.id,
                    contact_key=key,
                    contact_name=name,
                    audio_id=asset.id,
                )
                .on_conflict_do_nothing(index_elements=["scenario_card_id", "contact_key"])
            )


async def read_upload(request: Request):
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_BYTES:
            raise HTTPException(413, "WAV must not exceed 10 MB")
    return bytes(data)


def store_wav(data):
    try:
        with wave.open(io.BytesIO(data)) as wav:
            if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype()) != (
                1,
                2,
                8000,
                "NONE",
            ):
                raise ValueError()
            duration = wav.getnframes() / 8000
            frames = wav.readframes(wav.getnframes())
            if not 0.1 <= duration <= 600 or len(frames) != wav.getnframes() * 2:
                raise ValueError()
    except (wave.Error, EOFError, ValueError):
        raise HTTPException(
            422, "Required: PCM WAV, mono, 8000 Hz, 16 bit, 0.1–600 seconds"
        ) from None
    # Strip arbitrary metadata and guarantee Asterisk-compatible RIFF/PCM.
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setparams((1, 2, 8000, 0, "NONE", "not compressed"))
        wav.writeframes(frames)
    normalized = buffer.getvalue()
    key = hashlib.sha256(normalized).hexdigest()
    path = audio_path(key)
    temporary = path.with_suffix(f".{uuid4().hex}.part")
    try:
        temporary.write_bytes(normalized)
        os.chmod(temporary, 0o644)  # Local Asterisk volume is mounted read-only.
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)
    return key, duration


def complete(asset, data):
    key, duration = store_wav(data)
    asset.file_key = key
    asset.duration_seconds = duration
    asset.status = "ready"
    asset.error = None
    asset.lease_token = None
    asset.leased_until = None


async def claim(session):
    now = datetime.now(UTC)
    asset = await session.scalar(
        select(SpeechAsset)
        .where(
            or_(
                SpeechAsset.status == "queued",
                (SpeechAsset.status == "preparing") & (SpeechAsset.leased_until < now),
            ),
            SpeechAsset.attempts < 3,
            select(CallCue.id).where(CallCue.audio_id == SpeechAsset.id).exists(),
        )
        .order_by(SpeechAsset.created_at)
        .with_for_update(skip_locked=True)
        .limit(1)
    )
    if asset:
        asset.status = "preparing"
        asset.lease_token = uuid4()
        asset.leased_until = now + timedelta(minutes=10)
        asset.attempts += 1
    # Exhausted leases must not remain "preparing" forever.
    from sqlalchemy import update

    await session.execute(
        update(SpeechAsset)
        .where(
            SpeechAsset.status == "preparing",
            SpeechAsset.attempts >= 3,
            SpeechAsset.leased_until < now,
        )
        .values(status="failed", error="Generator lease expired", lease_token=None)
    )
    await session.commit()
    return asset
