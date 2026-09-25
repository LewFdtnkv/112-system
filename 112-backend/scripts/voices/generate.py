"""Offline build tool; install piper-tts==1.8.0 and scipy in a disposable container."""

import argparse
import hashlib
import json
import math
import wave
from pathlib import Path

import numpy as np
from piper import PiperVoice
from scipy.signal import resample_poly

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--models", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
out, source = args.output, args.models
out.mkdir(parents=True, exist_ok=True)
variants = []
phrases = [
    ("Здравствуйте. Слушаю вас.", "Принято."),
    ("Алло, здравствуйте. Говорите.", "Принято, спасибо."),
    ("Здравствуйте, бригада на связи.", "Информацию принял."),
]
for voice_name in ("denis", "dmitri"):
    model = source / f"{voice_name}.onnx"
    voice = PiperVoice.load(str(model), config_path=str(source / f"{voice_name}.json"))
    for i, (greeting, acknowledgment) in enumerate(phrases):
        variant = {
            "id": f"{voice_name}-{i + 1}",
            "voice": voice_name,
            "model_sha256": hashlib.sha256(model.read_bytes()).hexdigest(),
        }
        for kind, text in [("greeting", greeting), ("acknowledgment", acknowledgment)]:
            chunks = list(voice.synthesize(text))
            samples = np.concatenate([c.audio_float_array for c in chunks])
            rate = chunks[0].sample_rate
            # Headroom, no clipping, small leading/trailing margins.
            samples = samples * (0.82 / max(float(np.max(np.abs(samples))), 0.01))
            samples = np.pad(samples, (round(rate * 0.12), round(rate * 0.18)))
            stem = f"{voice_name}-{i + 1}-{kind}"
            for target in (8000, 16000):
                divisor = math.gcd(rate, target)
                pcm = (
                    (
                        np.clip(resample_poly(samples, target // divisor, rate // divisor), -1, 1)
                        * 32767
                    )
                    .astype("<i2")
                    .tobytes()
                )
                if target == 16000:
                    (out / f"{stem}.sln16").write_bytes(pcm)
                else:
                    with wave.open(str(out / f"{stem}.wav"), "wb") as wav:
                        wav.setparams((1, 2, target, 0, "NONE", "not compressed"))
                        wav.writeframes(pcm)
            variant[kind] = {
                "text": text,
                "stem": stem,
                "sha256": hashlib.sha256((out / f"{stem}.wav").read_bytes()).hexdigest(),
                "wideband_sha256": hashlib.sha256((out / f"{stem}.sln16").read_bytes()).hexdigest(),
            }
        variants.append(variant)
(out / "manifest.json").write_text(
    json.dumps({"version": "crew-dialogue-v1", "variants": variants}, ensure_ascii=False, indent=2)
    + "\n"
)
print("Generated", len(variants), "voice variants")
