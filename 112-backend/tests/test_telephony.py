import io
import wave
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from pydantic import SecretStr
from sqlalchemy import func, select
from test_student_workflow import exercise as exercise
from test_teacher_api import teaching as teaching

from app.core.config import settings
from app.models import AttemptEvent, SpeechAsset, TelephonyStation, TrainingCall
from app.services.telephony import media

pytestmark = pytest.mark.anyio


def wav_bytes():
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setparams((1, 2, 8000, 0, "NONE", "not compressed"))
        wav.writeframes(b"\0\0" * 8000)
    return buffer.getvalue()


@pytest.fixture
async def phone(exercise, monkeypatch, tmp_path):
    e = exercise
    monkeypatch.setattr(settings, "telephony_enabled", True)
    monkeypatch.setattr(settings, "telephony_media_directory", str(tmp_path))
    monkeypatch.setattr(settings, "telephony_adapter_token", SecretStr("adapter-test-token"))
    monkeypatch.setattr(settings, "speech_generator_token", SecretStr("generator-test-token"))
    attempt = await e.start()
    station = await e.request(
        "POST",
        "telephony/stations",
        {
            "name": "АРМ 1",
            "mode": "external",
            "provider": "test-pbx",
            "endpoint": "1001",
            "student_id": str(e.t.accounts["student"].id),
        },
        actor="admin",
        status=201,
    )
    path = f"telephony/attempts/{attempt['id']}"
    await e.request("POST", f"{path}/bind")
    state = await e.request("GET", path)
    cue = state["cues"][0]
    command = {"command_id": str(uuid4()), "cue_id": cue["id"]}
    from types import SimpleNamespace

    return SimpleNamespace(**locals())


async def test_binding_privacy_and_call_idempotency(phone, db_session):
    p, e = phone, phone.e
    assert "password" not in str(p.state) and "HIDDEN_TEACHER_ANSWER" not in str(p.state)
    await e.request("GET", p.path, actor="student2", status=404)
    await e.request("POST", p.path + "/bind", actor="teacher", status=403)
    await e.request("GET", f"telephony/stations/{p.station['id']}/credentials", status=403)
    first = await e.request("POST", p.path + "/calls", p.command, status=201)
    assert first == await e.request(
        "POST", p.path + "/calls", p.command, status=201
    )  # external no audio
    await e.request("POST", p.path + "/calls", p.command | {"command_id": str(uuid4())}, status=409)
    await e.request(
        "PATCH",
        f"telephony/stations/{p.station['id']}",
        {"student_id": None},
        actor="admin",
        status=409,
    )
    assert await db_session.scalar(select(func.count()).select_from(TrainingCall)) == 1


async def test_pbx_events_are_authenticated_deduplicated_and_order_independent(
    phone, db_client, db_session
):
    p, e = phone, phone.e
    call = await e.request("POST", p.path + "/calls", p.command, status=201)
    now = datetime.now(UTC)
    base = {
        "endpoint": "1001",
        "provider_call_id": "linked-1",
        "call_id": call["id"],
        "direction": "outgoing",
    }

    async def send(kind, offset, token=True, endpoint="1001", code=200):
        data = base | {
            "endpoint": endpoint,
            "event_id": kind,
            "kind": kind,
            "occurred_at": (now + timedelta(seconds=offset)).isoformat(),
        }
        response = await db_client.post(
            "/api/v1/telephony-adapter/pbx/test-pbx/events",
            json=data,
            headers={"X-Adapter-Token": "adapter-test-token"} if token else e.t.headers["student"],
        )
        assert response.status_code == code, response.text
        return response.json()

    await send("connected", 1, token=False, code=401)
    await send("connected", 1, endpoint="other", code=404)
    assert (await send("ended", 4))["status"] == "ended"
    assert (await send("connected", 1))["status"] == "ended"
    assert (await send("dialing", 0))["status"] == "ended"
    await send("connected", 1)
    assert (
        await db_session.scalar(
            select(func.count())
            .select_from(AttemptEvent)
            .where(AttemptEvent.kind == "call.connected")
        )
        == 1
    )
    stored = await db_session.get(TrainingCall, UUID(call["id"]))
    assert stored.connected_at == now + timedelta(seconds=1)
    assert stored.ended_at == now + timedelta(seconds=4)


async def test_unsolicited_physical_call_requires_binding_and_contact(phone, db_client):
    p = phone
    body = {
        "event_id": "new",
        "endpoint": "1001",
        "provider_call_id": "physical-1",
        "attempt_id": p.attempt["id"],
        "contact_key": "caller",
        "kind": "connected",
        "occurred_at": datetime.now(UTC).isoformat(),
    }
    response = await db_client.post(
        "/api/v1/telephony-adapter/pbx/test-pbx/events",
        json=body,
        headers={"X-Adapter-Token": "adapter-test-token"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["attempt_id"] == p.attempt["id"]
    assert response.json()["status"] == "connected"


async def test_local_call_requires_ready_media_and_fences_generator(phone, db_client, db_session):
    p, e = phone, phone.e
    station = await db_session.get(TelephonyStation, UUID(p.station["id"]))
    station.mode, station.provider, station.provisioned = "browser", "local", True
    await db_session.commit()
    await e.request("POST", p.path + "/calls", p.command, status=409)
    headers = {"X-Generator-Token": "generator-test-token"}
    job = (await db_client.post("/api/v1/telephony-adapter/speech/claim", headers=headers)).json()
    assert job["text"] and "HIDDEN_TEACHER_ANSWER" not in job["text"]
    bad = await db_client.put(
        f"/api/v1/telephony-adapter/speech/{job['id']}/wav",
        params={"lease_token": str(uuid4())},
        content=wav_bytes(),
        headers=headers,
    )
    assert bad.status_code == 409
    good = await db_client.put(
        f"/api/v1/telephony-adapter/speech/{job['id']}/wav",
        params={"lease_token": job["lease_token"]},
        content=wav_bytes(),
        headers=headers,
    )
    assert good.status_code == 200, good.text
    asset = await db_session.get(SpeechAsset, UUID(job["id"]))
    assert asset.duration_seconds == 1 and media.audio_path(asset.file_key).is_file()
    call = await e.request("POST", p.path + "/calls", p.command, status=201)
    assert call["status"] == "dialing"
    assert (await e.request("POST", p.path + "/calls", p.command, status=201))["id"] == call["id"]
    await e.request(
        "POST",
        p.path + "/calls",
        p.command | {"direction": "incoming", "transport": "callback"},
        status=409,
    )


async def test_invalid_audio_and_teacher_ownership(phone, db_client):
    p, e = phone, phone.e
    path = f"/api/v1/telephony/cues/{p.cue['id']}/wav"
    for actor, body, status in [
        ("student", wav_bytes(), 403),
        ("other", wav_bytes(), 404),
        ("teacher", b"bad", 422),
        ("teacher", wav_bytes(), 200),
    ]:
        response = await db_client.put(path, content=body, headers=e.t.headers[actor])
        assert response.status_code == status, response.text
    preview = await db_client.get(path, headers=e.t.headers["teacher"])
    assert preview.content.startswith(b"RIFF")
    await e.request("POST", p.path + "/calls", p.command, status=201)


async def test_no_calls_after_completion(phone):
    p, e = phone, phone.e
    filled = await e.fill(p.attempt)
    await e.request(
        "POST",
        f"student/attempts/{p.attempt['id']}/submit",
        {"revision": filled["card"]["revision"]},
    )
    await e.request("POST", p.path + "/calls", p.command, status=409)


async def test_stale_binding_and_wrong_provider_call_cannot_reassign_events(phone, db_client):
    p = phone
    base = {
        "endpoint": "1001",
        "provider_call_id": "stale",
        "event_id": "stale",
        "attempt_id": str(uuid4()),
        "contact_key": "caller",
        "kind": "dialing",
        "occurred_at": datetime.now(UTC).isoformat(),
    }
    path = "/api/v1/telephony-adapter/pbx/test-pbx/events"
    headers = {"X-Adapter-Token": "adapter-test-token"}
    response = await db_client.post(path, json=base, headers=headers)
    assert response.status_code == 409
    call = await p.e.request("POST", p.path + "/calls", p.command, status=201)
    good = base | {"call_id": call["id"], "attempt_id": p.attempt["id"]}
    assert (await db_client.post(path, json=good, headers=headers)).status_code == 200
    conflict = good | {"call_id": str(uuid4()), "event_id": "conflict"}
    assert (await db_client.post(path, json=conflict, headers=headers)).status_code == 409


async def test_generator_lease_renewal_and_reclaim_fence(phone, db_client, db_session):
    headers = {"X-Generator-Token": "generator-test-token"}
    path = "/api/v1/telephony-adapter/speech"
    job = (await db_client.post(path + "/claim", headers=headers)).json()
    asset = await db_session.get(SpeechAsset, UUID(job["id"]))
    renewal = await db_client.post(
        f"{path}/{job['id']}/renew", params={"lease_token": job["lease_token"]}, headers=headers
    )
    assert renewal.status_code == 200
    assert asset.leased_until > datetime.now(UTC) + timedelta(minutes=9)
    asset.leased_until = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()
    second = (await db_client.post(path + "/claim", headers=headers)).json()
    assert second["id"] == job["id"] and second["lease_token"] != job["lease_token"]
    stale = await db_client.put(
        f"{path}/{job['id']}/wav",
        params={"lease_token": job["lease_token"]},
        content=wav_bytes(),
        headers=headers,
    )
    assert stale.status_code == 409


async def test_uploaded_audio_is_immutable_for_existing_call(phone, db_client, db_session):
    p, e = phone, phone.e
    path = f"/api/v1/telephony/cues/{p.cue['id']}/wav"
    await db_client.put(path, content=wav_bytes(), headers=e.t.headers["teacher"])
    call = await e.request("POST", p.path + "/calls", p.command, status=201)
    stored = await db_session.get(TrainingCall, UUID(call["id"]))
    original_asset = stored.audio_id
    await e.request(
        "PUT",
        f"telephony/cues/{p.cue['id']}",
        {"text": "Новая реплика", "voice": "ru-default", "generator_version": "v2"},
        actor="teacher",
    )
    replay = await e.request("POST", p.path + "/calls", p.command, status=201)
    assert replay["id"] == call["id"]
    await db_session.refresh(stored)
    assert stored.audio_id == original_asset


async def test_ari_answer_playback_and_reconnect_do_not_repeat_audio(
    phone, db_client, db_session, monkeypatch
):
    from contextlib import asynccontextmanager

    from app.models import TelephonyEvent
    from app.services.telephony import worker

    p, e = phone, phone.e
    station = await db_session.get(TelephonyStation, UUID(p.station["id"]))
    station.mode, station.provider, station.provisioned = "phone", "local", True
    await db_session.commit()
    await db_client.put(
        f"/api/v1/telephony/cues/{p.cue['id']}/wav",
        content=wav_bytes(),
        headers=e.t.headers["teacher"],
    )
    call = await e.request("POST", p.path + "/calls", p.command, status=201)

    @asynccontextmanager
    async def factory():
        yield db_session

    monkeypatch.setattr(worker, "session_factory", factory)

    class PBX:
        def __init__(self):
            self.requests = []

        async def request(self, method, path, **kwargs):
            self.requests.append(path)

        async def hangup(self, channel):
            self.requests.append("hangup:" + channel)

    pbx = PBX()
    event = {
        "type": "StasisStart",
        "channel": {"id": "trusted-channel", "state": "Ring"},
        "args": ["1001"],
    }
    await worker.on_event(pbx, event)
    await worker.connected(pbx, UUID(call["id"]), "trusted-channel")
    assert len([p for p in pbx.requests if "/play/" in p]) == 1
    for kind in ("PlaybackStarted", "PlaybackFinished", "PlaybackFinished"):
        await worker.on_event(pbx, {"type": kind, "playback": {"id": call["id"], "state": "done"}})
    events = list(
        await db_session.scalars(
            select(TelephonyEvent).where(TelephonyEvent.call_id == UUID(call["id"]))
        )
    )
    assert [e.kind for e in events].count("audio.finished") == 1
    await worker.on_event(
        pbx, {"type": "ChannelDestroyed", "channel": {"id": "trusted-channel"}, "cause": 16}
    )
    stored = await db_session.get(TrainingCall, UUID(call["id"]))
    assert stored.status == "ended" and stored.connected_at and stored.ended_at
    # Unauthorised physical dial after the previous call is rejected, not adopted.
    await worker.on_event(
        pbx, {"type": "StasisStart", "channel": {"id": "other"}, "args": ["1001"]}
    )
    assert pbx.requests[-1] == "hangup:other"


async def test_deactivated_student_cannot_dial_from_registered_phone(phone, db_client, db_session):
    from app.models import Attempt
    from app.services.telephony.calls import binding_is_active

    student = phone.e.t.accounts["student"]
    student.is_active = False
    await db_session.commit()
    station = await db_session.get(TelephonyStation, UUID(phone.station["id"]))
    attempt = await db_session.get(Attempt, UUID(phone.attempt["id"]))
    assert not await binding_is_active(db_session, station, attempt)


async def test_external_selection_can_be_cancelled_without_inventing_pbx_events(phone, db_session):
    p = phone
    call = await p.e.request("POST", p.path + "/calls", p.command, status=201)
    assert not call["provider_confirmed"]
    cancelled = await p.e.request("POST", p.path + f"/calls/{call['id']}/cancel")
    assert cancelled["status"] == "no_answer" and cancelled["cancel_requested"]
    assert cancelled["connected_at"] is None
    new_call = await p.e.request(
        "POST", p.path + "/calls", p.command | {"command_id": str(uuid4())}, status=201
    )
    assert new_call["id"] != call["id"]
