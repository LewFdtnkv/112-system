"""Compare local models using a frozen v2 prompt; no database reads or writes.

Run in the API image, pointed at a separate Ollama instance. JSONL goes to stdout.
Semantic quality must be reviewed manually against the saved input facts.
"""

import argparse
import json
import time
import urllib.request
from pathlib import Path

from app.schemas.generation import GeneratedText


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--cases", nargs="+")
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--warmup", action="store_true")
    args = parser.parse_args()
    fixture = json.loads(
        (
            Path(__file__).resolve().parents[1]
            / "docs/generation-evaluation/model-comparison-inputs.json"
        ).read_text()
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def request(path, payload=None):
        req = urllib.request.Request(
            args.base_url.rstrip("/") + path,
            data=json.dumps(payload).encode() if payload is not None else None,
            headers={"Content-Type": "application/json"},
        )
        with opener.open(req, timeout=args.timeout) as response:
            return json.load(response)

    if args.warmup:
        request(
            "/api/generate",
            {
                "model": args.model,
                "keep_alive": "30m",
                "stream": False,
                "options": fixture["options"],
            },
        )
    for case in fixture["cases"]:
        if args.cases and case["id"] not in args.cases:
            continue
        result = {
            "case": case["id"],
            "coherent_input": case["coherent_input"],
            "model": args.model,
            "prompt_version": fixture["prompt_version"],
            "source_commit": fixture["source_commit"],
            "seed": case["seed"],
            "options": fixture["options"],
        }
        start = time.monotonic()
        try:
            raw = request(
                "/api/chat",
                {
                    "model": args.model,
                    "stream": False,
                    "think": False,
                    "keep_alive": "30m",
                    "format": GeneratedText.model_json_schema(),
                    "messages": [{"role": "user", "content": case["prompt"]}],
                    "options": fixture["options"] | {"seed": case["seed"]},
                },
            )
            result["seconds"] = round(time.monotonic() - start, 2)
            result["response"] = raw
            try:
                if not raw.get("done") or raw.get("done_reason") == "length":
                    raise ValueError("Incomplete response")
                result["output"] = GeneratedText.model_validate_json(
                    raw["message"]["content"]
                ).model_dump()
                result["schema_valid"] = True
            except (ValueError, KeyError) as exc:
                result.update(schema_valid=False, validation_error=str(exc))
            result["resident_models"] = request("/api/ps")
        except (OSError, ValueError) as exc:
            result.update(error=type(exc).__name__, message=str(exc))
        result.setdefault("seconds", round(time.monotonic() - start, 2))
        print(json.dumps(result, ensure_ascii=False), flush=True)
    request("/api/generate", {"model": args.model, "keep_alive": 0, "stream": False})


if __name__ == "__main__":
    main()
