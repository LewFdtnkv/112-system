from contextlib import asynccontextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from test_catalog_dds import api as api
from test_catalog_dds import dds as dds
from test_teacher_api import teaching as teaching

from app.core.config import settings
from app.models import AttemptEvent, TelephonyStation, TrainingCall
from app.services.telephony import dialogue, worker

pytestmark = pytest.mark.anyio


@pytest.fixture
async def crew_phone(dds, api, db_session, monkeypatch, tmp_path):
    d = dds
    monkeypatch.setattr(settings, "telephony_enabled", True)
    monkeypatch.setattr(settings, "telephony_media_directory", str(tmp_path))
    profile_data = {
        "service_id": str(d.t.service.id),
        "name": "Телефонная ДДС",
        "responsibility": "Учебная",
        "contacts": [
            {
                "code": "chief",
                "name": "Старший бригады",
                "target_service_id": str(d.t.service.id),
                "endpoint_key": "chief",
            }
        ],
        "crews": [{"code": "water", "name": "Бригада № 1", "contact_code": "chief"}],
    }
    profile = await api("POST", "admin/service-profiles", profile_data, status=201)
    await api("POST", f"admin/service-profiles/{profile['id']}/publish")
    policy = {
        "workflow": "crews-v1",
        "crew_calls_required": True,
        "steps": d.steps,
        "required_crews": [{"crew_code": "water", "status": "assigned"}],
    }
    scenario = await d.t.post(
        "scenarios", d.base | {"service_profile_id": profile["id"], "dds_policy": policy}
    )
    lesson = await d.t.post(
        "lessons/start",
        {
            "request_id": str(uuid4()),
            "group_id": d.group["id"],
            "scenario_version_id": scenario["id"],
        },
    )
    work = await api("GET", f"student/lessons/{lesson['id']}", actor="student")
    a = await api(
        "POST",
        f"student/assignments/{work['assignments'][0]['id']}/start",
        actor="student",
        status=201,
    )
    path = f"student/attempts/{a['id']}"

    async def assign(status="assigned"):
        nonlocal a
        a = await api(
            "POST",
            path + "/dds/crews",
            {
                "request_id": str(uuid4()),
                "revision": a["dds"]["revision"],
                "information_event_id": a["dds"]["information"]["id"],
                "crew_code": "water",
                "status": status,
            },
            actor="student",
        )
        return a

    await assign()
    station = await api(
        "POST",
        "telephony/stations",
        {
            "name": "Гарнитура",
            "mode": "browser",
            "endpoint": "crew100",
            "student_id": str(d.t.accounts["student"].id),
        },
        status=201,
    )
    row = await db_session.get(TelephonyStation, UUID(station["id"]))
    row.provisioned = True
    await db_session.commit()
    phone_path = f"telephony/attempts/{a['id']}"
    await api("POST", phone_path + "/bind", actor="student")
    state = await api("GET", phone_path, actor="student")
    command = {"command_id": str(uuid4()), "cue_id": state["cues"][0]["id"], "crew_code": "water"}
    ari = SimpleNamespace(request=AsyncMock(return_value={}), hangup=AsyncMock())

    @asynccontextmanager
    async def factory():
        yield db_session

    monkeypatch.setattr(dialogue, "session_factory", factory)
    monkeypatch.setattr(worker, "session_factory", factory)

    async def start():
        value = await api(
            "POST",
            phone_path + "/calls",
            command | {"command_id": str(uuid4())},
            actor="student",
            status=201,
        )
        call = await db_session.get(TrainingCall, UUID(value["id"]))
        call.provider_call_id = str(call.id)
        call.dispatched_at = datetime.now(UTC)
        await db_session.commit()
        await worker.connected(ari, call.id, call.provider_call_id)
        return call

    return SimpleNamespace(**locals())


async def playback(p, call, part, state="done"):
    await worker.on_event(
        p.ari, {"type": "PlaybackFinished", "playback": {"id": f"{call.id}:{part}", "state": state}}
    )


async def speech(p, call, duration=1800):
    for kind in ["ChannelTalkingStarted", "ChannelTalkingFinished"]:
        await worker.on_event(
            p.ari, {"type": kind, "channel": {"id": call.provider_call_id}, "duration": duration}
        )


async def end(p, call):
    await worker.on_event(p.ari, {"type": "StasisEnd", "channel": {"id": call.provider_call_id}})


async def test_manual_speech_acknowledgment_and_assessment(crew_phone, api, db_session):
    p = crew_phone
    for patch in (
        {"crew_code": None},
        {"crew_code": "foreign"},
        {"direction": "incoming", "transport": "callback"},
    ):
        await api("POST", p.phone_path + "/calls", p.command | patch, actor="student", status=422)
    call = await p.start()
    assert call.dialogue["phase"] == "greeting"
    await speech(p, call)  # Microphone activity while greeting plays is ignored.
    assert call.dialogue["phase"] == "greeting"
    await playback(p, call, "greeting")
    assert call.dialogue["phase"] == "listening"
    await speech(p, call, 100)  # Brief click is not a report.
    assert call.dialogue["phase"] == "listening"
    await speech(p, call)
    assert call.dialogue["phase"] == "acknowledging"
    read = await api("GET", p.path, actor="student")
    assert not read["dds"]["crew_calls"][0]["completed"]
    await playback(p, call, "acknowledgment")
    await playback(p, call, "acknowledgment")  # Duplicate ARI event.
    assert call.dialogue["phase"] == "acknowledged"
    await end(p, call)
    read = await api("GET", p.path, actor="student")
    assert read["dds"]["crew_calls"][0]["completed"]
    assert p.ari.hangup.await_count == 1
    from app.schemas.student import StudentAttemptRead
    from app.services.dds_assessment import check_dds

    check = check_dds(p.policy, StudentAttemptRead.model_validate(read))
    field = next(f for f in check.fields if f.field == "dds.notification.water")
    assert field.status == "matched"
    events = list(
        await db_session.scalars(
            select(AttemptEvent).where(AttemptEvent.kind == "call.dialogue.acknowledged")
        )
    )
    assert len(events) == 1 and events[0].payload["speech_ms"] == 1800
    await p.assign("cancelled")
    await p.assign()
    assert not (await api("GET", p.path, actor="student"))["dds"]["crew_calls"][0]["completed"]


@pytest.mark.parametrize("failure", ["silence", "early_hangup", "playback_failed"])
async def test_incomplete_dialogue_is_not_success(crew_phone, api, failure):
    p = crew_phone
    call = await p.start()
    await playback(p, call, "greeting")
    if failure != "silence":
        await speech(p, call)
    if failure == "playback_failed":
        await playback(p, call, "acknowledgment", "failed")
    await end(p, call)
    assert not (await api("GET", p.path, actor="student"))["dds"]["crew_calls"][0]["completed"]


async def test_status_only_practice_does_not_require_phone(crew_phone, api, db_session):
    from app.models import Attempt

    p = crew_phone
    attempt = await db_session.get(Attempt, UUID(p.a["id"]))
    attempt.settings_snapshot = attempt.settings_snapshot | {
        "learning": {"kind": "skill_practice", "target_skills": ["dds_response"]}
    }
    await db_session.commit()
    state = await api("GET", p.phone_path, actor="student")
    assert not state["crew_calls_required"] and state["crew_calls"] == []


async def test_client_cannot_publish_voice_evidence(crew_phone, db_client):
    p = crew_phone
    r = await db_client.post(
        "/api/v1/telephony-adapter/pbx/local/events",
        json={
            "event_id": "spoof",
            "endpoint": "crew100",
            "provider_call_id": "spoof",
            "kind": "dialogue.acknowledged",
            "occurred_at": datetime.now(UTC).isoformat(),
        },
        headers=p.d.t.headers["student"],
    )
    assert r.status_code == 401


def test_voice_pack_integrity_and_usable_signal():
    import hashlib
    import io
    import struct
    import wave

    from app.services.telephony.voice_pack import ROOT, variants

    pack = variants()
    assert len(pack) == 6 and len({v["voice"] for v in pack}) == 2
    for v in pack:
        for part in ("greeting", "acknowledgment"):
            clip = v[part]
            pcm = (ROOT / (clip["stem"] + ".sln16")).read_bytes()
            assert hashlib.sha256(pcm).hexdigest() == clip["wideband_sha256"]
            samples = struct.unpack("<" + "h" * (len(pcm) // 2), pcm)
            assert 0.3 < len(samples) / 16000 < 10
            assert max(abs(x) for x in samples) < 32767
            assert sum(x * x for x in samples) / len(samples) > 10000
            data = (ROOT / (clip["stem"] + ".wav")).read_bytes()
            assert hashlib.sha256(data).hexdigest() == clip["sha256"]
            with wave.open(io.BytesIO(data)) as wav:
                assert (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) == (8000, 1, 2)


async def test_unselected_answer_crews_are_not_exposed(crew_phone, api):
    p = crew_phone
    await p.assign("cancelled")
    read = await api("GET", p.path, actor="student")
    state = await api("GET", p.phone_path, actor="student")
    assert read["dds"]["crew_calls"] == [] and state["crew_calls"] == [] and state["cues"] == []
    from app.schemas.student import StudentAttemptRead
    from app.services.dds_assessment import check_dds

    check = check_dds(p.policy, StudentAttemptRead.model_validate(read))
    assert next(f for f in check.fields if f.field == "dds.notification.water").status == "missing"
