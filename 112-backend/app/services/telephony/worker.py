"""One elected ARI consumer. Persist commands before I/O; never redial after ambiguous failures."""

import asyncio
import contextlib
import json
import logging
from datetime import UTC, datetime
from urllib.parse import urlencode

import httpx
from sqlalchemy import select, text
from websockets.asyncio.client import connect

from app.core.config import settings
from app.db.session import engine, session_factory
from app.models import Attempt, SpeechAsset, TelephonyEvent, TelephonyStation, TrainingCall
from app.services.telephony.ari import ARI
from app.services.telephony.calls import ACTIVE, active_call, binding_is_active, record_event

logger = logging.getLogger(__name__)


async def lock_station(session, station_id):
    return await session.scalar(
        select(TelephonyStation).where(TelephonyStation.id == station_id).with_for_update()
    )


async def finish(ari, call_id, reason="failed"):
    async with session_factory() as session:
        call = await session.get(TrainingCall, call_id)
        await lock_station(session, call.station_id)
        await session.refresh(call)
        if call.status not in ACTIVE:
            return
        if call.provider_call_id:
            await ari.hangup(call.provider_call_id)
        now = datetime.now(UTC)
        await record_event(
            session, call, f"finish:{call.id}", reason, now, payload={"source": "controller"}
        )
        await session.commit()


async def connected(ari, call_id, channel_id):
    async with session_factory() as session:
        call = await session.get(TrainingCall, call_id)
        station = await lock_station(session, call.station_id)
        await session.refresh(call)
        attempt = await session.get(Attempt, call.attempt_id)
        if (
            call.status not in ACTIVE
            or call.cancel_requested
            or not await binding_is_active(session, station, attempt)
        ):
            await ari.hangup(channel_id)
            return
        connected_event = await session.scalar(
            select(TelephonyEvent).where(
                TelephonyEvent.call_id == call.id, TelephonyEvent.kind == "connected"
            )
        )
        if connected_event:
            return
        await record_event(session, call, f"connected:{channel_id}", "connected", datetime.now(UTC))
        asset = await session.get(SpeechAsset, call.audio_id)
        await session.commit()  # No replay of speech on reconnect / event redelivery.
        try:
            await ari.request(
                "POST",
                f"channels/{channel_id}/play/{call.id}",
                params={
                    "media": f"sound:/srv/training/{asset.file_key}",
                },
            )
        except httpx.HTTPError:
            await finish(ari, call_id)
            return


async def on_event(ari, event):
    kind = event.get("type")
    if kind in ("PlaybackStarted", "PlaybackFinished"):
        playback = event.get("playback", {})
        from uuid import UUID

        try:
            call_id = UUID(playback["id"])
        except (ValueError, KeyError):
            return
        async with session_factory() as session:
            call = await session.get(TrainingCall, call_id)
            if not call or call.provider != "local":
                return
            await lock_station(session, call.station_id)
            event_id = f"{kind}:{call.id}"
            if not await session.scalar(
                select(TelephonyEvent.id).where(
                    TelephonyEvent.provider == "local",
                    TelephonyEvent.event_id == event_id,
                )
            ):
                await record_event(
                    session,
                    call,
                    event_id,
                    "audio.started" if kind == "PlaybackStarted" else "audio.finished",
                    datetime.now(UTC),
                    payload={"playback_state": playback.get("state")},
                )
                await session.commit()
        return
    channel = event.get("channel", {})
    channel_id = channel.get("id")
    if not channel_id:
        return
    async with session_factory() as session:
        call = await session.scalar(
            select(TrainingCall).where(
                TrainingCall.provider == "local", TrainingCall.provider_call_id == channel_id
            )
        )
        if kind == "StasisStart" and not call:
            args = event.get("args", [])
            endpoint = args[0] if args else ""
            station = await session.scalar(
                select(TelephonyStation)
                .where(
                    TelephonyStation.provider == "local",
                    TelephonyStation.endpoint == endpoint,
                )
                .with_for_update()
            )
            call = await active_call(session, station.id) if station else None
            if (
                not station
                or not station.enabled
                or not call
                or call.transport != "manual"
                or call.provider_call_id
                or call.cancel_requested
            ):
                await ari.hangup(channel_id)
                return
            attempt = await session.get(Attempt, call.attempt_id)
            if not await binding_is_active(session, station, attempt):
                await ari.hangup(channel_id)
                return
            call.provider_call_id = channel_id
            call.dispatched_at = datetime.now(UTC)
            await session.commit()
        if not call:
            return
        call_id = call.id
    if kind == "StasisStart":
        if channel.get("state") != "Up":
            await ari.request("POST", f"channels/{channel_id}/answer")
        await connected(ari, call_id, channel_id)
    elif kind in ("StasisEnd", "ChannelDestroyed"):
        async with session_factory() as session:
            call = await session.get(TrainingCall, call_id)
            await lock_station(session, call.station_id)
            await session.refresh(call)
            if call.status not in ACTIVE:
                return
            cause = event.get("cause")
            status = (
                "ended"
                if call.connected_at
                else {17: "busy", 18: "no_answer", 19: "no_answer"}.get(cause, "no_answer")
            )
            await record_event(session, call, f"end:{channel_id}", status, datetime.now(UTC))
            await session.commit()


async def poll(ari, ready=None):
    if ready is not None:
        await ready.wait()
    provisioned = set()
    while True:
        async with session_factory() as session:
            stations = list(
                await session.scalars(
                    select(TelephonyStation).where(TelephonyStation.provider == "local")
                )
            )
            for station in stations:
                if station.id in provisioned and station.provisioned:
                    continue
                await lock_station(session, station.id)
                try:
                    await ari.provision(station)
                    station.provisioned, station.error = True, None
                    provisioned.add(station.id)
                except httpx.HTTPError:
                    station.provisioned, station.error = False, "Не удалось настроить Asterisk"
                await session.commit()
            ids = list(
                await session.scalars(
                    select(TrainingCall.id).where(
                        TrainingCall.provider == "local", TrainingCall.status.in_(ACTIVE)
                    )
                )
            )
        for call_id in ids:
            async with session_factory() as session:
                call = await session.get(TrainingCall, call_id)
                station = await lock_station(session, call.station_id)
                await session.refresh(call)
                if call.status not in ACTIVE:
                    continue
                attempt = await session.get(Attempt, call.attempt_id)
                now = datetime.now(UTC)
                age = (now - call.started_at).total_seconds()
                if (
                    call.cancel_requested
                    or not await binding_is_active(session, station, attempt)
                    or age > settings.telephony_max_call_seconds
                ):
                    reason = "ended" if call.connected_at else "no_answer"
                    await session.rollback()
                    await finish(ari, call_id, reason)
                    continue
                if call.provider_call_id:
                    channel = await ari.channel(call.provider_call_id)
                    if channel is None and (now - call.dispatched_at).total_seconds() > 10:
                        await session.rollback()
                        await finish(ari, call_id)
                    # On reconnect observe existing state, never originate twice.
                    elif (
                        channel
                        and channel.get("state") == "Up"
                        and channel.get("dialplan", {}).get("app_name") == "Stasis"
                    ):
                        await session.rollback()
                        await connected(ari, call_id, channel["id"])
                    continue
                if age > 60:
                    await session.rollback()
                    await finish(ari, call_id, "no_answer")
                    continue
                if call.transport != "callback":
                    continue
                call.dispatched_at = now
                call.provider_call_id = str(call.id)
                await session.commit()
                try:
                    await ari.request(
                        "POST",
                        f"channels/{call.id}",
                        params={
                            "endpoint": f"PJSIP/{station.endpoint}",
                            "app": "trainer",
                            "appArgs": "callback",
                            "callerId": "Учебный звонок <9000>",
                            "timeout": 45,
                        },
                    )
                except httpx.HTTPError:
                    # The request may have reached PBX. Reconciliation checks the stable channel ID.
                    logger.warning("Origination uncertain for call %s; reconciling", call.id)
        await asyncio.sleep(1)


async def events(ari, ready=None):
    ws = settings.ari_url.replace("http://", "ws://").replace("https://", "wss://").rstrip("/")
    params = urlencode({"app": "trainer", "subscribeAll": "true"})
    import base64

    auth = base64.b64encode(
        f"{settings.ari_username}:{settings.ari_password.get_secret_value()}".encode()
    ).decode()
    async with connect(
        f"{ws}/events?{params}", additional_headers={"Authorization": f"Basic {auth}"}
    ) as stream:
        if ready is not None:
            ready.set()
        async for message in stream:
            await on_event(ari, json.loads(message))


async def check_leader(connection):
    # Stop consuming if the database session owning the advisory lock is lost.
    while True:
        await connection.execute(text("SELECT 1"))
        await asyncio.sleep(3)


async def main():
    if not settings.telephony_enabled:
        raise RuntimeError("TELEPHONY_ENABLED must be true for telephony worker")
    ari = ARI()
    try:
        async with engine.connect() as leader:
            if not await leader.scalar(text("SELECT pg_try_advisory_lock(112, 9000)")):
                raise RuntimeError("Another telephony worker is already active")
            while True:
                ready = asyncio.Event()
                tasks = [
                    asyncio.create_task(events(ari, ready)),
                    asyncio.create_task(poll(ari, ready)),
                    asyncio.create_task(check_leader(leader)),
                ]
                try:
                    await asyncio.gather(*tasks)
                except Exception as exc:
                    if tasks[2].done() and tasks[2].exception() is not None:
                        raise RuntimeError("Telephony leadership connection lost") from None
                    # Do not log URLs / credentials from library exception strings.
                    logger.warning("ARI disconnected (%s); retrying", type(exc).__name__)
                finally:
                    for task in tasks:
                        task.cancel()
                    for task in tasks:
                        with contextlib.suppress(asyncio.CancelledError, Exception):
                            await task
                await asyncio.sleep(3)
    finally:
        await ari.client.aclose()
        await engine.dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    asyncio.run(main())
