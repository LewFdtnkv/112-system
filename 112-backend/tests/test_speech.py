from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from test_recordings import audio_bytes
from test_recordings import library as library
from test_teacher_api import teaching as teaching

from app.models import Recording
from app.services.speech.catalog import version
from app.services.speech.worker import finish
from app.services.telephony import media

pytestmark = pytest.mark.anyio


def payload(**changes):
    return {
        "request_id": str(uuid4()),
        "title": "Голос диспетчера",
        "kind": "crew",
        "voice": "denis",
        "greeting": "Здравствуйте. Слушаю вас.",
        "acknowledgment": "Принято.",
    } | changes


async def create(client, teaching, body=None, actor="teacher", expected=202):
    response = await client.post(
        "/api/v1/telephony/recordings/synthesize",
        json=body or payload(),
        headers=teaching.headers[actor],
    )
    assert response.status_code == expected, response.text
    return response.json()


async def test_pair_is_atomic_idempotent_and_owned(library, teaching, db_client, db_session):
    body = payload()
    result = await create(db_client, teaching, body)
    assert len(result) == 2
    assert {r["purpose"] for r in result} == {"greeting", "acknowledgment"}
    assert all(r["status"] == "queued" and r["voice"] == "denis" for r in result)
    again = await create(db_client, teaching, body)
    assert [r["id"] for r in result] == [r["id"] for r in again]
    assert await db_session.scalar(select(func.count()).select_from(Recording)) == 2
    await create(db_client, teaching, body | {"voice": "dmitri"}, expected=409)
    for actor, status in (("other", 404), ("student", 403), ("admin", 403)):
        response = await db_client.get(
            f"/api/v1/telephony/recordings/{result[0]['id']}", headers=teaching.headers[actor]
        )
        assert response.status_code == status
    await create(db_client, teaching, actor="student", expected=403)
    foreign = await create(db_client, teaching, body, actor="other")
    assert foreign[0]["id"] != result[0]["id"]
    # Different owners can safely reuse identical immutable audio, not each other's records.
    assets = list(await db_session.scalars(select(Recording.audio_id)))
    assert len(set(assets)) == 2


@pytest.mark.parametrize(
    "patch",
    [
        {"voice": "../../model"},
        {"text": "Нельзя смешивать режимы"},
        {"title": "  "},
        {"greeting": " "},
        {"acknowledgment": ""},
        {"greeting": "я" * 201},
        {"extra": "ignored?"},
    ],
)
async def test_invalid_synthesis_does_not_queue(library, teaching, db_client, db_session, patch):
    await create(db_client, teaching, payload(**patch), expected=422)
    assert await db_session.scalar(select(func.count()).select_from(Recording)) == 0


async def test_ready_guard_queue_claim_and_fenced_completion(
    library, teaching, db_client, db_session, tmp_path
):
    body = {
        "request_id": str(uuid4()),
        "title": "Заявитель",
        "kind": "caller",
        "voice": "dmitri",
        "text": "На Лесной улице горит дом.",
    }
    result = (await create(db_client, teaching, body))[0]
    path = f"/api/v1/telephony/recordings/{result['id']}"
    response = await db_client.get(path + "/wav", headers=teaching.headers["teacher"])
    assert response.status_code == 409
    await teaching.post(
        "cards", teaching.card_payload | {"audio": {"caller_ids": [result["id"]]}}, expected=422
    )
    asset = await media.claim(db_session, versions=[version("caller")])
    assert asset and asset.status == "preparing" and asset.attempts == 1
    assert await media.claim(db_session, versions=[version("caller")]) is None
    assert not await finish(db_session, asset.id, uuid4(), error="stale")
    wav = audio_bytes(sample=500)
    (tmp_path / "speech.wav").write_bytes(wav)
    (tmp_path / "speech.sln16").write_bytes(b"\0\1" * 16000)
    assert await finish(db_session, asset.id, asset.lease_token, destination=tmp_path)
    response = await db_client.get(path + "/wav", headers=teaching.headers["teacher"])
    assert response.status_code == 200 and response.content == wav
    assert media.audio_path(asset.file_key).with_suffix(".sln16").is_file()
    await teaching.post("cards", teaching.card_payload | {"audio": {"caller_ids": [result["id"]]}})


async def test_retry_exhaustion_expired_lease_and_permanent_error(
    library, teaching, db_client, db_session
):
    results = await create(db_client, teaching)
    for attempt in range(3):
        asset = await media.claim(db_session, versions=[version("greeting")])
        assert asset.attempts == attempt + 1
        assert await finish(
            db_session, asset.id, asset.lease_token, error="Не удалось подготовить запись"
        )
    assert asset.status == "failed"
    assert await media.claim(db_session, versions=[version("greeting")]) is None
    path = f"/api/v1/telephony/recordings/{results[0]['id']}/retry"
    assert (await db_client.post(path, headers=teaching.headers["other"])).status_code == 404
    response = await db_client.post(path, headers=teaching.headers["teacher"])
    assert response.status_code == 200 and response.json()["status"] == "queued"
    asset = await media.claim(db_session, versions=[version("greeting")])
    old = asset.lease_token
    asset.leased_until = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()
    assert not await finish(db_session, asset.id, old, error="stale")
    reclaimed = await media.claim(db_session, versions=[version("greeting")])
    assert reclaimed.lease_token != old
    assert await finish(
        db_session, asset.id, reclaimed.lease_token, error="Сократите текст", permanent=True
    )
    assert asset.status == "failed" and asset.attempts == 2


async def test_queue_limit_and_voice_catalog(library, teaching, db_client):
    response = await db_client.get(
        "/api/v1/telephony/recordings/voices", headers=teaching.headers["teacher"]
    )
    assert {v["id"] for v in response.json()} == {"denis", "dmitri"}
    for _ in range(10):
        await create(db_client, teaching)
    await create(db_client, teaching, expected=429)
