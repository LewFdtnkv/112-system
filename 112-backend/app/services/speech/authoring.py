from uuid import NAMESPACE_URL, uuid5

from fastapi import HTTPException
from sqlalchemy import func, select

from app.models import Recording, SpeechAsset, User
from app.services.speech.catalog import VERSION, VOICES, version
from app.services.telephony import media, recordings


async def lock_and_check_limit(session, teacher_id, count):
    # Serialize submissions/retries by this teacher, including idempotent requests.
    await session.scalar(select(User).where(User.id == teacher_id).with_for_update())
    pending = await session.scalar(
        select(func.count())
        .select_from(Recording)
        .join(SpeechAsset)
        .where(
            Recording.created_by_id == teacher_id, SpeechAsset.status.in_(["queued", "preparing"])
        )
    )
    if pending + count > 20:
        raise HTTPException(
            429, "Дождитесь подготовки записей: одновременно можно заказать до 20 реплик"
        )


async def create(session, teacher_id, payload):
    parts = (
        [("caller", payload.text)]
        if payload.kind == "caller"
        else [("greeting", payload.greeting), ("acknowledgment", payload.acknowledgment)]
    )
    ids = [
        uuid5(NAMESPACE_URL, f"tts:{teacher_id}:{payload.request_id}:{index}")
        for index, _ in enumerate(parts)
    ]
    await session.scalar(select(User).where(User.id == teacher_id).with_for_update())
    existing = list(await session.scalars(select(Recording).where(Recording.id.in_(ids))))
    if existing and (
        len(existing) != len(parts) or existing[0].purpose not in {p for p, _ in parts}
    ):
        raise HTTPException(409, "Запрос уже использован для другой записи")
    if not existing:
        await lock_and_check_limit(session, teacher_id, len(parts))
    result = []
    for recording_id, (purpose, text) in zip(ids, parts, strict=True):
        suffix = {"caller": "", "greeting": " · приветствие", "acknowledgment": " · подтверждение"}[
            purpose
        ]
        title = payload.title + suffix
        asset = await media.asset_for(session, text, payload.voice, version(purpose))
        row = next((r for r in existing if r.id == recording_id), None)
        if row and (row.audio_id != asset.id or row.title != title):
            raise HTTPException(409, "Запрос уже использован для другой записи")
        if not row:
            row = Recording(
                id=recording_id,
                created_by_id=teacher_id,
                title=title,
                purpose=purpose,
                audio_id=asset.id,
            )
            session.add(row)
        result.append((row, asset))
    await session.commit()
    return [recordings.read_recording(r, a) for r, a in result]


async def retry(session, recording_id, teacher_id):
    await lock_and_check_limit(session, teacher_id, 1)
    row, asset = await recordings.owned_recording(session, recording_id, teacher_id)
    asset = await session.scalar(
        select(SpeechAsset).where(SpeechAsset.id == asset.id).with_for_update()
    )
    if asset.voice not in VOICES or not asset.generator_version.startswith(VERSION + ":"):
        raise HTTPException(409, "Эту запись нельзя озвучить заново")
    if asset.status == "failed":
        asset.status, asset.attempts, asset.error = "queued", 0, None
        asset.lease_token, asset.leased_until = None, None
    await session.commit()
    return recordings.read_recording(row, asset)
