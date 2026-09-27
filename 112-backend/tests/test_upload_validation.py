"""Exercise actual upload routes with forged types, broken files and chunked bodies."""

import io
import struct
from uuid import UUID

import pytest
from PIL import Image
from sqlalchemy import func, select
from test_student_workflow import exercise as exercise
from test_teacher_api import teaching as teaching
from test_telephony import phone as phone
from test_telephony import wav_bytes

from app.core.uploads import MAX_UPLOAD_BYTES, read_upload
from app.models import CallCue, ClassifierVersion, SpeechAsset

pytestmark = pytest.mark.anyio


def png_bytes():
    out = io.BytesIO()
    Image.new("RGB", (16, 16), "blue").save(out, "PNG")
    return out.getvalue()


async def chunks(data):
    for start in range(0, len(data), 65536):
        yield data[start : start + 65536]


async def test_stream_limit_accepts_boundary_and_stops_without_reading_rest():
    from fastapi import HTTPException

    assert len(await read_upload(chunks(b"x" * MAX_UPLOAD_BYTES))) == MAX_UPLOAD_BYTES

    async def oversized():
        yield b"x" * MAX_UPLOAD_BYTES
        yield b"x"
        pytest.fail("Must stop consuming upload immediately after crossing the limit")

    with pytest.raises(HTTPException) as error:
        await read_upload(oversized())
    assert error.value.status_code == 413


@pytest.mark.parametrize("admin", [False, True])
async def test_photo_rejects_forged_corrupt_and_oversized_files_without_replacing_photo(
    teaching, db_client, admin
):
    user_id = teaching.accounts["student"].id
    path = f"/api/v1/admin/users/{user_id}/photo" if admin else "/api/v1/users/me/photo"
    headers = teaching.headers["admin" if admin else "student"] | {
        "Content-Type": "image/png",
        "Content-Disposition": 'attachment; filename="photo.png"',
    }
    assert (await db_client.put(path, headers=headers, content=png_bytes())).status_code == 204
    get_path = f"/api/v1/users/{user_id}/photo"
    saved = (await db_client.get(get_path, headers=headers)).content
    gif = io.BytesIO()
    Image.new("RGB", (2, 2)).save(gif, "GIF")
    huge = io.BytesIO()
    Image.new("1", (5000, 4000)).save(huge, "PNG")
    jpeg = io.BytesIO()
    Image.new("RGB", (16, 16)).save(jpeg, "JPEG")
    bad_crc = bytearray(png_bytes())
    chunk_type = bad_crc.index(b"IDAT")
    chunk_length = int.from_bytes(bad_crc[chunk_type - 4 : chunk_type], "big")
    bad_crc[chunk_type + 4 + chunk_length] ^= 1
    cases = [
        ("empty", b"", 422),
        ("text-as-png", b"not a picture", 422),
        ("svg-as-png", b"<svg><script>alert(1)</script></svg>", 422),
        ("gif-as-png", gif.getvalue(), 422),
        ("truncated-png", png_bytes()[:-12], 422),
        ("truncated-png-checksum", png_bytes()[:-1], 422),
        ("bad-iend", png_bytes()[:-5] + b"xxxxx", 422),
        ("bad-idat-crc", bytes(bad_crc), 422),
        ("truncated-jpeg", jpeg.getvalue()[:-20], 422),
        ("too-many-pixels", huge.getvalue(), 422),
        ("oversized-chunked", b"x" * (MAX_UPLOAD_BYTES + 1), 413),
    ]
    for label, body, status in cases:
        response = await db_client.put(path, headers=headers, content=chunks(body))
        assert response.status_code == status, (label, response.text)
        assert response.json()["message"], label
        assert (await db_client.get(get_path, headers=headers)).content == saved, label


async def test_catalog_invalid_and_oversized_upload_does_not_create_version(
    teaching, db_client, db_session
):
    headers = teaching.headers["admin"] | {"Content-Type": "application/json"}
    count = await db_session.scalar(select(func.count()).select_from(ClassifierVersion))
    for body, status in [
        (b"<html>not JSON</html>", 422),
        (b"\xff\xfe", 422),
        (b"[]", 422),
        (b'{"label":', 422),
        (b"[" * 500 + b"]" * 500, 422),
        (b" " * (MAX_UPLOAD_BYTES + 1), 413),
    ]:
        response = await db_client.post(
            "/api/v1/admin/classifiers/import", headers=headers, content=chunks(body)
        )
        assert response.status_code == status, response.text
        assert response.json().get("message") or response.json().get("field_errors")
    assert await db_session.scalar(select(func.count()).select_from(ClassifierVersion)) == count


def bad_wavs():
    # The forged JUNK length previously escaped wave.open as RuntimeError (HTTP 500).
    broken_chunk = b"RIFF" + struct.pack("<I", 14) + b"WAVEJUNK" + struct.pack("<I", 99999) + b"xx"
    odd = bytearray(wav_bytes() + b"x")
    struct.pack_into("<I", odd, 4, len(odd) - 8)
    struct.pack_into("<I", odd, 40, 16001)
    return [b"", b"not WAV", png_bytes(), wav_bytes()[:-1], broken_chunk, bytes(odd)]


async def test_wav_upload_errors_preserve_recording(phone, db_client, db_session):
    path = f"/api/v1/telephony/cues/{phone.cue['id']}/wav"
    headers = phone.e.t.headers["teacher"] | {"Content-Type": "audio/wav"}
    assert (await db_client.put(path, headers=headers, content=wav_bytes())).status_code == 200
    cue = await db_session.get(CallCue, UUID(phone.cue["id"]))
    original_id = cue.audio_id
    original = (await db_client.get(path, headers=headers)).content
    for body in bad_wavs():
        response = await db_client.put(path, headers=headers, content=body)
        assert response.status_code == 422, response.text
        assert response.json()["message"]
    response = await db_client.put(
        path, headers=headers, content=chunks(b"x" * (MAX_UPLOAD_BYTES + 1))
    )
    assert response.status_code == 413
    await db_session.refresh(cue)
    assert cue.audio_id == original_id
    assert (await db_client.get(path, headers=headers)).content == original


async def test_generated_audio_has_same_validation_and_can_retry(phone, db_client, db_session):
    headers = {"X-Generator-Token": "generator-test-token", "Content-Type": "audio/wav"}
    job = (await db_client.post("/api/v1/telephony-adapter/speech/claim", headers=headers)).json()
    path = f"/api/v1/telephony-adapter/speech/{job['id']}/wav?lease_token={job['lease_token']}"
    for body, status in [(bad_wavs()[4], 422), (b"x" * (MAX_UPLOAD_BYTES + 1), 413)]:
        response = await db_client.put(path, headers=headers, content=chunks(body))
        assert response.status_code == status, response.text
        asset = await db_session.get(SpeechAsset, UUID(job["id"]))
        assert asset.status == "preparing" and asset.file_key is None
    assert (await db_client.put(path, headers=headers, content=wav_bytes())).status_code == 200
