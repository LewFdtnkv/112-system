"""Small pre-rendered voice pack. No synthesis or model loading during a call."""

import hashlib
import json
import secrets
from pathlib import Path

from app.core.config import settings

ROOT = Path(__file__).resolve().parents[2] / "data" / "crew_voices"


def variants():
    return json.loads((ROOT / "manifest.json").read_text())["variants"]


def materialize(clip):
    content = (ROOT / f"{clip['stem']}.sln16").read_bytes()
    key = hashlib.sha256(content).hexdigest()
    if key != clip["wideband_sha256"]:
        raise ValueError("Crew voice pack checksum mismatch")
    target = Path(settings.telephony_media_directory) / f"{key}.sln16"
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        from uuid import uuid4

        temporary = target.with_suffix(f".{uuid4().hex}.part")
        try:
            temporary.write_bytes(content)
            temporary.chmod(0o644)
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    return key


def choose_dialogue():
    variant = secrets.choice(variants())
    return {
        "version": "crew-dialogue-v1",
        "phase": "pending",
        "voice": variant["id"],
        "greeting": materialize(variant["greeting"]),
        "acknowledgment": materialize(variant["acknowledgment"]),
    }


def greeting_bytes():
    clip = variants()[0]["greeting"]
    data = (ROOT / f"{clip['stem']}.wav").read_bytes()
    if hashlib.sha256(data).hexdigest() != clip["sha256"]:
        raise ValueError("Crew voice pack checksum mismatch")
    return clip["text"], data
