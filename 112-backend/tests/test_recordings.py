import io
import wave
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from test_catalog_dds import api as api
from test_catalog_dds import dds as dds
from test_crew_dialogue import crew_phone as crew_phone
from test_teacher_api import teaching as teaching

from app.core.config import settings
from app.models import CallCue, CardTemplate, ScenarioVersion, SpeechAsset
from app.services.telephony import media, recordings
from app.services.telephony.recording_selection import frozen_variants

pytestmark = pytest.mark.anyio


def audio_bytes(seconds=1, sample=0):
    stream = io.BytesIO()
    with wave.open(stream, "wb") as wav:
        wav.setparams((1, 2, 8000, 0, "NONE", "not compressed"))
        wav.writeframes(sample.to_bytes(2, "little") * (8000 * seconds))
    return stream.getvalue()


@pytest.fixture
async def library(teaching, db_client, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "telephony_media_directory", str(tmp_path))

    async def upload(
        title="Первый голос", purpose="caller", data=None, actor="teacher", expected=201
    ):
        response = await db_client.post(
            "/api/v1/telephony/recordings",
            params={"title": title, "purpose": purpose},
            content=data if data is not None else audio_bytes(),
            headers=teaching.headers[actor],
        )
        assert response.status_code == expected, response.text
        return response.json()

    return upload


async def test_library_access_upload_validation_and_preview(library, teaching, db_client):
    recording = await library()
    path = f"/api/v1/telephony/recordings/{recording['id']}"
    for actor, status in (("teacher", 200), ("other", 404), ("student", 403), ("admin", 403)):
        for suffix in ("", "/wav"):
            response = await db_client.get(path + suffix, headers=teaching.headers[actor])
            assert response.status_code == status
    await library(data=b"fake WAV", expected=422)
    await library(data=b"x" * (1024 * 1024 + 1), expected=413)
    await library(title="  ", expected=422)
    await library(purpose="greeting", data=audio_bytes(21), expected=422)
    await library(actor="student", expected=403)
    own = await db_client.get("/api/v1/telephony/recordings", headers=teaching.headers["teacher"])
    assert own.json()["total"] == 1
    other = await db_client.get("/api/v1/telephony/recordings", headers=teaching.headers["other"])
    assert other.json()["total"] == 0


async def test_card_audio_permissions_purpose_and_usage(library, teaching, db_client):
    t = teaching
    first = await library()
    wrong = await library(purpose="greeting")
    foreign = await library(actor="other")
    for recording in (wrong, foreign, {"id": str(uuid4())}):
        await t.post(
            "cards", t.card_payload | {"audio": {"caller_ids": [recording["id"]]}}, expected=422
        )
    await t.post(
        "cards",
        t.card_payload | {"audio": {"caller_ids": [first["id"], first["id"]]}},
        expected=422,
    )
    card = await t.post("cards", t.card_payload | {"audio": {"caller_ids": [first["id"]]}})
    assert card["audio"]["caller_ids"] == [first["id"]]
    scenario = await t.post(
        "scenarios",
        {"title": "Записанный звонок", "role": "operator_112", "card_ids": [card["id"]]},
    )
    result = await db_client.get(
        "/api/v1/telephony/recordings",
        params={"purpose": "caller", "query": "Первый"},
        headers=t.headers["teacher"],
    )
    usages = result.json()["items"][0]["usages"]
    assert {(u["kind"], u["id"]) for u in usages} == {
        ("card", card["id"]),
        ("scenario", scenario["id"]),
    }
    assert scenario["cards"][0]["snapshot"]["audio"]["caller_ids"] == card["audio"]["caller_ids"]


async def test_scenario_variants_are_frozen(library, teaching, db_session):
    t = teaching
    first = await library()
    second = await library(title="Другой голос", data=audio_bytes(sample=10))
    card = await t.post(
        "cards", t.card_payload | {"audio": {"caller_ids": [first["id"], second["id"]]}}
    )
    scenario = await t.post(
        "scenarios", {"title": "Голоса", "role": "operator_112", "card_ids": [card["id"]]}
    )
    # Changing even the source directly cannot alter the scenario snapshot.
    source = await db_session.get(CardTemplate, UUID(card["id"]))
    source.audio = {}
    version = await db_session.get(ScenarioVersion, UUID(scenario["id"]))
    await media.prepare_scenario(db_session, version)
    await media.prepare_scenario(db_session, version)
    cues = list(await db_session.scalars(select(CallCue)))
    assert len(cues) == 1 and len(cues[0].audio_variants) == 2
    ids = {v["audio_id"] for v in cues[0].audio_variants}
    assert str(cues[0].audio_id) in ids
    for audio_id in ids:
        assert (await db_session.get(SpeechAsset, UUID(audio_id))).status == "ready"


async def test_dds_card_local_calls_prepare_default_audio(teaching, db_session, library):
    from app.models import TrainingContact

    t = teaching
    contact = TrainingContact(
        profile_id=t.profile.id,
        code="chief",
        name="Руководитель",
        endpoint_key="chief",
        target_service_id=t.service.id,
    )
    db_session.add(contact)
    await db_session.flush()
    t.profile.rules = {
        "crews": [{"code": "main", "name": "Бригада", "is_active": True, "contact_code": "chief"}]
    }
    exercise = {
        "service_profile_id": str(t.profile.id),
        "crew_calls_required": True,
        "required_crews": [{"crew_code": "main", "status": "assigned"}],
        "messages": [
            {"crew_code": "main", "message": "Назначьте бригаду и позвоните руководителю"}
        ],
    }
    card = await t.post("cards", t.card_payload | {"dds_exercise": exercise})
    scenario = await t.post(
        "scenarios",
        {
            "title": "Звонок бригаде",
            "role": "dds",
            "service_profile_id": str(t.profile.id),
            "card_ids": [card["id"]],
        },
    )
    version = await db_session.get(ScenarioVersion, UUID(scenario["id"]))
    assert not version.completion_rules
    await media.prepare_scenario(db_session, version)
    cue = await db_session.scalar(select(CallCue))
    assert cue.contact_key == "chief"
    assert (await db_session.get(SpeechAsset, cue.audio_id)).status == "ready"


async def test_custom_crew_pair_preserves_both_assets(library, teaching, db_session):
    greeting = await library(purpose="greeting")
    acknowledgment = await library(
        purpose="acknowledgment", title="Принято", data=audio_bytes(sample=10)
    )
    from app.schemas.card_audio import CardAudio

    audio = CardAudio(
        crew_variants=[{"greeting_id": greeting["id"], "acknowledgment_id": acknowledgment["id"]}]
    )
    await recordings.validate_selection(db_session, teaching.accounts["teacher"].id, audio)
    variants = await frozen_variants(db_session, audio.model_dump(mode="json"), role="dds")
    assert len(variants) == 1
    assert variants[0]["audio_id"] != variants[0]["acknowledgment_id"]


async def test_crew_call_uses_custom_pair_and_keeps_choice_on_retry(crew_phone, db_session):
    from app.models import Recording
    from app.models.enums import CallStatus

    p = crew_phone
    created = []
    for index in range(4):
        item = await recordings.create_recording(
            db_session,
            p.d.t.accounts["teacher"].id,
            f"Реплика {index}",
            "greeting" if index % 2 == 0 else "acknowledgment",
            audio_bytes(sample=index),
        )
        created.append(await db_session.get(Recording, item["id"]))
    cue = await db_session.get(CallCue, UUID(p.command["cue_id"]))
    cue.audio_variants = [
        {"audio_id": str(created[i].audio_id), "acknowledgment_id": str(created[i + 1].audio_id)}
        for i in (0, 2)
    ]
    await db_session.commit()
    first = await p.start()
    choice = next(v for v in cue.audio_variants if v["audio_id"] == str(first.audio_id))
    assert (
        first.dialogue["greeting"] == (await db_session.get(SpeechAsset, first.audio_id)).file_key
    )
    assert (
        first.dialogue["acknowledgment"]
        == (await db_session.get(SpeechAsset, UUID(choice["acknowledgment_id"]))).file_key
    )
    first.status = CallStatus.ENDED
    await db_session.commit()
    second = await p.start()
    assert second.audio_id == first.audio_id
    assert second.dialogue["acknowledgment"] == first.dialogue["acknowledgment"]
    assert second.id != first.id
