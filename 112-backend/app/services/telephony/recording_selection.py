"""Resolve immutable card recording IDs into the audio assets frozen for each contact."""

from uuid import UUID

from sqlalchemy import select

from app.models import Recording
from app.schemas.card_audio import CardAudio


async def frozen_variants(session, audio, *, role):
    value = CardAudio.model_validate(audio or {})
    ids = {str(i) for i in value.caller_ids} | {
        str(i) for p in value.crew_variants for i in (p.greeting_id, p.acknowledgment_id)
    }
    if not ids:
        return []
    assets = {
        str(r.id): r.audio_id
        for r in await session.scalars(
            select(Recording).where(Recording.id.in_([UUID(i) for i in ids]))
        )
    }
    if role == "dds":
        return [
            {
                "audio_id": str(assets[str(p.greeting_id)]),
                "acknowledgment_id": str(assets[str(p.acknowledgment_id)]),
            }
            for p in value.crew_variants
        ]
    return [{"audio_id": str(assets[str(i)])} for i in value.caller_ids]
