"""Owned, immutable recordings; usage is derived from cards and frozen scenarios."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, or_, select

from app.models import (
    CallCue,
    CardTemplate,
    Recording,
    Scenario,
    ScenarioCard,
    ScenarioVersion,
    SpeechAsset,
)
from app.schemas.card_audio import CardAudio
from app.services.telephony import media


def ids_in(audio):
    value = audio or {}
    return set(value.get("caller_ids", [])) | {
        recording_id for pair in value.get("crew_variants", []) for recording_id in pair.values()
    }


def read_recording(row, asset, usages=None):
    return dict(
        id=row.id,
        title=row.title,
        purpose=row.purpose,
        created_at=row.created_at,
        status=asset.status,
        duration_seconds=asset.duration_seconds,
        text=asset.text if asset.voice != "uploaded" else None,
        voice=asset.voice if asset.voice != "uploaded" else None,
        error=asset.error,
        usages=usages or [],
    )


async def owned_recording(session, recording_id, teacher_id):
    row = await session.scalar(
        select(Recording).where(Recording.id == recording_id, Recording.created_by_id == teacher_id)
    )
    if not row:
        raise HTTPException(404, "Запись не найдена")
    return row, await session.get(SpeechAsset, row.audio_id)


async def create_recording(session, teacher_id, title, purpose, data):
    key, _ = media.store_wav(data, max_duration=600 if purpose == "caller" else 20)
    asset = await media.asset_for(session, title, "uploaded", f"upload:{key}")
    media.complete(asset, data)
    row = Recording(created_by_id=teacher_id, title=title, purpose=purpose, audio_id=asset.id)
    session.add(row)
    await session.commit()
    return read_recording(row, asset)


async def validate_selection(session, teacher_id, audio: CardAudio):
    expected = {str(i): "caller" for i in audio.caller_ids}
    for pair in audio.crew_variants:
        for field, purpose in (
            (pair.greeting_id, "greeting"),
            (pair.acknowledgment_id, "acknowledgment"),
        ):
            if str(field) in expected and expected[str(field)] != purpose:
                raise HTTPException(422, "Выберите записи подходящего назначения")
            expected[str(field)] = purpose
    if not expected:
        return
    rows = (
        await session.execute(
            select(Recording, SpeechAsset)
            .join(SpeechAsset, Recording.audio_id == SpeechAsset.id)
            .where(
                Recording.id.in_([UUID(i) for i in expected]), Recording.created_by_id == teacher_id
            )
        )
    ).all()
    if len(rows) != len(expected) or any(
        r.purpose != expected[str(r.id)]
        or a.status != "ready"
        or not a.file_key
        or not media.audio_path(a.file_key).is_file()
        for r, a in rows
    ):
        raise HTTPException(
            422,
            [
                {
                    "loc": ["body", "audio"],
                    "type": "form_constraint",
                    "msg": "Одна из записей недоступна или имеет другое назначение",
                }
            ],
        )


def references(column, ids):
    return or_(
        *(
            condition
            for i in ids
            for condition in (
                column["caller_ids"].contains([i]),
                column["crew_variants"].contains([{"greeting_id": i}]),
                column["crew_variants"].contains([{"acknowledgment_id": i}]),
            )
        )
    )


async def list_recordings(session, teacher_id, *, query="", purpose=None, offset=0, limit=30):
    filters = [Recording.created_by_id == teacher_id]
    if purpose:
        filters.append(Recording.purpose == purpose)
    if query:
        filters.append(Recording.title.icontains(query, autoescape=True))
    total = await session.scalar(select(func.count()).select_from(Recording).where(*filters))
    rows = (
        await session.execute(
            select(Recording, SpeechAsset)
            .join(SpeechAsset, Recording.audio_id == SpeechAsset.id)
            .where(*filters)
            .order_by(Recording.created_at.desc(), Recording.id)
            .offset(offset)
            .limit(limit)
        )
    ).all()
    ids = [str(r.id) for r, _ in rows]
    usage = {i: {} for i in ids}
    if ids:
        cards = await session.scalars(
            select(CardTemplate).where(
                CardTemplate.created_by_id == teacher_id, references(CardTemplate.audio, ids)
            )
        )
        for card in cards:
            for i in ids_in(card.audio) & usage.keys():
                usage[i][f"card:{card.id}"] = dict(kind="card", id=card.id, title=card.title)
        scenarios = (
            await session.execute(
                select(ScenarioCard, ScenarioVersion)
                .join(ScenarioVersion, ScenarioCard.scenario_version_id == ScenarioVersion.id)
                .join(Scenario, ScenarioVersion.scenario_id == Scenario.id)
                .where(
                    Scenario.created_by_id == teacher_id,
                    references(ScenarioCard.snapshot["audio"], ids),
                )
            )
        ).all()
        for card, scenario in scenarios:
            for i in ids_in(card.snapshot.get("audio")) & usage.keys():
                usage[i][f"scenario:{scenario.id}"] = dict(
                    kind="scenario", id=scenario.id, title=scenario.title
                )
        # Include legacy cue uploads, which predate card-level selection.
        legacy = (
            await session.execute(
                select(Recording.id, ScenarioVersion)
                .join(CallCue, CallCue.audio_id == Recording.audio_id)
                .join(ScenarioCard, ScenarioCard.id == CallCue.scenario_card_id)
                .join(ScenarioVersion, ScenarioVersion.id == ScenarioCard.scenario_version_id)
                .join(Scenario, Scenario.id == ScenarioVersion.scenario_id)
                .where(
                    Recording.id.in_([r.id for r, _ in rows]), Scenario.created_by_id == teacher_id
                )
            )
        ).all()
        for recording_id, scenario in legacy:
            usage[str(recording_id)][f"scenario:{scenario.id}"] = dict(
                kind="scenario", id=scenario.id, title=scenario.title
            )
    return {
        "items": [read_recording(r, a, list(usage[str(r.id)].values())) for r, a in rows],
        "total": total,
    }
