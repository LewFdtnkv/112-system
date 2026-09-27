"""Download pinned public models at image build time; runtime is fully offline."""

import hashlib
import sys
import urllib.request
from pathlib import Path

REVISION = "c10ece1aade47bb51c153c893d14e5bf8e5b7117"
FILES = {
    "denis": {
        "onnx": "15fab56e11a097858ee115545d0f697fc2a316c41a291a5362349fb870411b0a",
        "json": "831c860dac0b5073eaa81610a0a638ec23d90a6cf8e5f871b4485c2cec3767c8",
        "MODEL_CARD": "8b5d685dd80f8ad3f8dbbe1c56b16bb0809f00c144af3642dbcf3b707eb89c12",
    },
    "dmitri": {
        "onnx": "f073356ebc4bd0f80c5af58df2953a5988bd5bdab1eb38635ce960b071fbefcb",
        "json": "667ef3117bc642c2892dff7690d8bdc8ca4228aeaa783b2dc1416df632855e0d",
        "MODEL_CARD": "6d59c756776d57860232cea6484e1b2ea1fc1c8d2c3446ef246f706fd9875821",
    },
}


def download(root):
    root.mkdir(parents=True, exist_ok=True)
    for name, files in FILES.items():
        for kind, digest in files.items():
            remote = (
                "MODEL_CARD"
                if kind == "MODEL_CARD"
                else f"ru_RU-{name}-medium.onnx" + (".json" if kind == "json" else "")
            )
            url = f"https://huggingface.co/rhasspy/piper-voices/resolve/{REVISION}/ru/ru_RU/{name}/medium/{remote}"
            path = root / (f"{name}_MODEL_CARD.txt" if kind == "MODEL_CARD" else f"{name}.{kind}")
            with urllib.request.urlopen(url, timeout=120) as response:
                data = response.read(70 * 1024 * 1024)
            if hashlib.sha256(data).hexdigest() != digest:
                raise ValueError(f"Voice checksum mismatch: {name}/{kind}")
            path.write_bytes(data)


if __name__ == "__main__":
    download(Path(sys.argv[1]))
