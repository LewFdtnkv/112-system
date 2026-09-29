"""A usable phone exercise, a browser station and real Piper synthesis requests."""

import secrets
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.models import CallCue, Lesson, ScenarioCard, TelephonyStation
from app.schemas.speech import SpeechCreate
from app.services.speech.authoring import create as create_speech
from app.services.telephony.media import asset_for, complete
from app.services.telephony.voice_pack import greeting_bytes


async def populate_media(gateway, state, student_id, training, source):
    session = gateway.session
    prefix = state.data["prefix"]
    station = await session.scalar(
        select(TelephonyStation).where(TelephonyStation.student_id == UUID(student_id))
    )
    if station is None:
        station = TelephonyStation(
            name=f"{prefix}: гарнитура ученика",
            mode="browser",
            provider="local",
            endpoint=f"{prefix}-student-browser",
            student_id=UUID(student_id),
            sip_password=secrets.token_urlsafe(32),
            enabled=True,
            provisioned=False,
        )
        session.add(station)
        await session.commit()
    # Provisioning belongs to telephony-worker; never claim an ARI connection in seed.
    result = {"station_id": str(station.id), "audio_ids": [], "recording_ids": []}
    phone_id = training["dds"]["lessons"].get("phone")
    if phone_id:
        lesson = await session.get(Lesson, UUID(phone_id))
        text, data = greeting_bytes()
        asset = await asset_for(session, text, "crew-voice-pack", "crew-dialogue-v1")
        if asset.status == "queued" and asset.file_key is None:
            complete(asset, data)
        sources = await session.scalars(
            select(ScenarioCard).where(
                ScenarioCard.scenario_version_id == lesson.scenario_version_id
            )
        )
        for card in sources:
            cue = await session.scalar(
                select(CallCue).where(
                    CallCue.scenario_card_id == card.id, CallCue.contact_key == "fire-chief"
                )
            )
            if cue is None:
                session.add(
                    CallCue(
                        scenario_card_id=card.id,
                        contact_key="fire-chief",
                        contact_name="Руководитель учебного расчёта",
                        audio_id=asset.id,
                    )
                )
        await session.commit()
        result["audio_ids"].append(str(asset.id))

    for voice in ("denis", "dmitri", "irina", "ruslan"):
        records = await create_speech(
            session,
            gateway.teacher.id,
            SpeechCreate(
                request_id=uuid5(NAMESPACE_URL, f"full-demo-v2/{gateway.teacher.id}/crew/{voice}"),
                title=f"{prefix}: руководитель бригады — {voice}",
                kind="crew",
                voice=voice,
                greeting="Здравствуйте. Руководитель бригады слушает.",
                acknowledgment="Принято. Выезжаем по указанному адресу.",
            ),
        )
        result["recording_ids"].extend(str(record["id"]) for record in records)
    records = await create_speech(
        session,
        gateway.teacher.id,
        SpeechCreate(
            request_id=uuid5(NAMESPACE_URL, f"full-demo-v2/{gateway.teacher.id}/caller"),
            title=f"{prefix}: сообщение заявителя",
            kind="caller",
            voice="irina",
            text=source.caller_message,
        ),
    )
    result["recording_ids"].extend(str(record["id"]) for record in records)
    return result
