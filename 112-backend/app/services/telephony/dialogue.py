"""Crew conversation driven only by trusted ARI playback and receive-audio events."""

from datetime import UTC, datetime
from uuid import UUID

import httpx
from sqlalchemy import select

from app.db.session import session_factory
from app.models import TelephonyStation, TrainingCall
from app.services.telephony.calls import ACTIVE, record_event

MIN_SPEECH_MS = 600
SILENCE_MS = 1500
LISTEN_TIMEOUT_SECONDS = 90


def phase(call, value, **facts):
    call.dialogue = {
        **call.dialogue,
        "phase": value,
        "phase_at": datetime.now(UTC).isoformat(),
        **facts,
    }


async def play(ari, call, part):
    await ari.request(
        "POST",
        f"channels/{call.provider_call_id}/play/{call.id}:{part}",
        params={"media": f"sound:/srv/training/{call.dialogue[part]}"},
    )


async def begin(ari, call):
    # State committed by caller before I/O. A reconnect never repeats a greeting.
    await play(ari, call, "greeting")


async def handle(ari, event):
    kind = event.get("type")
    part = None
    if kind in {"PlaybackStarted", "PlaybackFinished"}:
        try:
            raw, part = event["playback"]["id"].split(":")
            call_id = UUID(raw)
        except (ValueError, KeyError):
            return False
        if part not in {"greeting", "acknowledgment"}:
            return False
        query = select(TrainingCall).where(TrainingCall.id == call_id)
    elif kind in {"ChannelTalkingStarted", "ChannelTalkingFinished"}:
        query = select(TrainingCall).where(
            TrainingCall.provider_call_id == event.get("channel", {}).get("id")
        )
    else:
        return False
    action = None
    async with session_factory() as session:
        call = await session.scalar(query)
        if not call or call.provider != "local" or not call.dialogue:
            return False
        await session.scalar(
            select(TelephonyStation).where(TelephonyStation.id == call.station_id).with_for_update()
        )
        await session.refresh(call)
        if call.status not in ACTIVE or call.cancel_requested:
            return True
        state = call.dialogue["phase"]
        now = datetime.now(UTC)
        if kind == "PlaybackFinished":
            # Stopped/failed playback is not evidence that the student heard the reply.
            expected = {"greeting": "greeting", "acknowledgment": "acknowledging"}[part]
            if state != expected:
                return True
            if event["playback"].get("state") != "done":
                phase(call, "failed", reason="playback_failed")
                action = "hangup"
            elif part == "greeting" and state == "greeting":
                phase(call, "listening")
                await record_event(session, call, f"greeting:{call.id}", "dialogue.greeting", now)
                action = "listen"
            elif part == "acknowledgment" and state == "acknowledging":
                phase(call, "acknowledged")
                call.result = "Сообщение передано, руководитель ответил «Принято»"
                await record_event(
                    session,
                    call,
                    f"ack:{call.id}",
                    "dialogue.acknowledged",
                    now,
                    payload={
                        "crew_code": call.dialogue["crew_code"],
                        "speech_ms": call.dialogue["speech_ms"],
                        "voice": call.dialogue["voice"],
                    },
                )
                action = "hangup"
        elif kind == "ChannelTalkingStarted" and state == "listening":
            if not call.dialogue.get("speech_started_at"):
                call.dialogue = {**call.dialogue, "speech_started_at": now.isoformat()}
        elif kind == "ChannelTalkingFinished" and state == "listening":
            started = call.dialogue.get("speech_started_at")
            # Asterisk already subtracts the final silence threshold from duration.
            duration = max(0, int(event.get("duration", 0)))
            if started and duration >= MIN_SPEECH_MS:
                phase(call, "acknowledging", speech_ms=duration)
                await record_event(
                    session,
                    call,
                    f"speech:{call.id}",
                    "dialogue.speech",
                    now,
                    payload={"speech_ms": duration, "crew_code": call.dialogue["crew_code"]},
                )
                action = "acknowledge"
            else:
                call.dialogue = {**call.dialogue, "speech_started_at": None}
        await session.commit()
        try:
            if action == "listen":
                await ari.request(
                    "POST",
                    f"channels/{call.provider_call_id}/variable",
                    params={"variable": "TALK_DETECT(set)", "value": f"{SILENCE_MS},256"},
                )
            elif action == "acknowledge":
                await ari.request(
                    "POST",
                    f"channels/{call.provider_call_id}/variable",
                    params={"variable": "TALK_DETECT(remove)", "value": ""},
                )
                await play(ari, call, "acknowledgment")
            elif action == "hangup":
                await ari.hangup(call.provider_call_id)
        except httpx.HTTPError:
            # Poll reconciliation closes this call. Never claim success or replay a phrase.
            if action != "hangup":
                await session.refresh(call)
                phase(call, "failed", reason="pbx_error")
                call.result = "Оповещение не подтверждено: ошибка телефонного соединения"
                await session.commit()
        return True


def timed_out(call, now):
    if not call.dialogue or call.dialogue["phase"] in {"pending", "acknowledged", "failed"}:
        return False
    started = datetime.fromisoformat(call.dialogue["phase_at"])
    limit = LISTEN_TIMEOUT_SECONDS if call.dialogue["phase"] == "listening" else 30
    return (now - started).total_seconds() > limit
