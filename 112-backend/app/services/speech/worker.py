"""Durable PostgreSQL queue with leases; synthesis never holds a DB transaction."""

import asyncio
import json
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory

from sqlalchemy import select

from app.db.session import session_factory
from app.models import SpeechAsset
from app.services.speech.catalog import PURPOSES, version
from app.services.telephony import media

logger = logging.getLogger(__name__)


async def synthesize(job, destination):
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "app.services.speech.synthesize",
        str(destination),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, error = await asyncio.wait_for(
            process.communicate(json.dumps(job).encode()), timeout=180
        )
    except BaseException:
        if process.returncode is None:
            process.kill()
        await process.wait()
        raise
    if process.returncode:
        if process.returncode == 2 and b"too_long" in error:
            raise ValueError(
                f"Сократите текст: запись должна длиться не более {job['max_seconds']} секунд."
            )
        raise RuntimeError("Speech process failed")


async def finish(session, asset_id, token, *, destination=None, error=None, permanent=False):
    asset = await session.scalar(
        select(SpeechAsset).where(SpeechAsset.id == asset_id).with_for_update()
    )
    if (
        not asset
        or asset.status != "preparing"
        or asset.lease_token != token
        or asset.leased_until <= datetime.now(UTC)
    ):
        return False
    if error:
        asset.status = "failed" if permanent or asset.attempts >= 3 else "queued"
        asset.error = error
        asset.lease_token, asset.leased_until = None, None
    else:
        media.complete(asset, (destination / "speech.wav").read_bytes())
        # Publish both encodings before committing readiness. Same content key lets
        # Asterisk negotiate G.722 or narrowband without resynthesis during a call.
        target = media.audio_path(asset.file_key).with_suffix(".sln16")
        source = destination / "speech.sln16"
        source.chmod(0o644)
        source.replace(target)
    await session.commit()
    return True


async def process_one():
    async with session_factory() as session:
        asset = await media.claim(session, versions=[version(p) for p in PURPOSES])
        if not asset:
            return False
        asset_id, token = asset.id, asset.lease_token
        job = {
            "text": asset.text,
            "voice": asset.voice,
            "max_seconds": 65 if asset.generator_version == version("caller") else 20,
        }
    work = media.directory() / ".work"
    work.mkdir(exist_ok=True)
    with TemporaryDirectory(prefix="speech-", dir=work) as directory:
        destination = Path(directory)
        try:
            await synthesize(job, destination)
            async with session_factory() as session:
                published = await finish(session, asset_id, token, destination=destination)
            logger.info("Speech %s: %s", "ready" if published else "lease superseded", asset_id)
        except Exception as exc:
            permanent = isinstance(exc, ValueError)
            logger.warning("Speech failed: %s (%s)", asset_id, type(exc).__name__)
            async with session_factory() as session:
                await finish(
                    session,
                    asset_id,
                    token,
                    error=str(exc)
                    if permanent
                    else "Не удалось подготовить запись. Попробуйте повторить озвучку.",
                    permanent=permanent,
                )
    return True


async def main():
    while True:
        try:
            if await process_one():
                continue
        except Exception:
            logger.exception("Speech queue unavailable")
        await asyncio.sleep(2)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
