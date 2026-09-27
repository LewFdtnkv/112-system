"""Isolated bounded synthesis process. Heavy dependencies are only in the speech image."""

import io
import json
import math
import sys
import wave
from pathlib import Path

from app.core.config import settings
from app.core.uploads import MAX_UPLOAD_BYTES
from app.services.speech.catalog import VOICES


def render(text, voice_name, destination, max_seconds):
    import numpy as np
    import onnxruntime
    from piper import PiperVoice
    from piper.config import PiperConfig
    from scipy.signal import resample_poly

    if voice_name not in VOICES:
        raise ValueError("Unknown voice")
    root = Path(settings.speech_models_directory)
    # One CPU thread; don't let ONNX allocate a thread for every host CPU.
    options = onnxruntime.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    voice = PiperVoice(
        config=PiperConfig.from_dict(json.loads((root / f"{voice_name}.json").read_text())),
        session=onnxruntime.InferenceSession(
            str(root / f"{voice_name}.onnx"),
            sess_options=options,
            providers=["CPUExecutionProvider"],
        ),
    )
    chunks, total = [], 0
    rate = voice.config.sample_rate
    for chunk in voice.synthesize(text):
        total += len(chunk.audio_float_array)
        if total / rate + 0.3 > max_seconds:
            raise ValueError("too_long")
        chunks.append(chunk.audio_float_array)
    if not chunks:
        raise ValueError("empty_audio")
    samples = np.concatenate(chunks)
    peak = float(np.max(np.abs(samples)))
    if peak < 0.0001:
        raise ValueError("empty_audio")
    samples = np.pad(samples * (0.82 / peak), (round(rate * 0.12), round(rate * 0.18)))
    for target in (8000, 16000):
        divisor = math.gcd(rate, target)
        pcm = (
            (np.clip(resample_poly(samples, target // divisor, rate // divisor), -1, 1) * 32767)
            .astype("<i2")
            .tobytes()
        )
        if target == 16000:
            (destination / "speech.sln16").write_bytes(pcm)
        else:
            buffer = io.BytesIO()
            with wave.open(buffer, "wb") as wav:
                wav.setparams((1, 2, 8000, 0, "NONE", "not compressed"))
                wav.writeframes(pcm)
            if len(buffer.getvalue()) > MAX_UPLOAD_BYTES:
                raise ValueError("too_long")
            (destination / "speech.wav").write_bytes(buffer.getvalue())


if __name__ == "__main__":
    job = json.load(sys.stdin)
    try:
        render(job["text"], job["voice"], Path(sys.argv[1]), job["max_seconds"])
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(2)
