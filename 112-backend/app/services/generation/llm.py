import json
import urllib.error
import urllib.request

from app.core.config import settings
from app.services.generation.narration import Wording, fallback, prompt, render


def compose(job):
    plan = job.input["narrative"]
    if plan["mode"] == "template":
        return fallback(job.input), {"source": "template", "selection": plan["default_wording"]}
    metadata = {"model": job.model_version, "seed": job.input["seed"]}
    try:
        request = urllib.request.Request(
            settings.llm_base_url.rstrip("/") + "/api/chat",
            data=json.dumps(
                {
                    "model": job.model_version,
                    "stream": False,
                    "think": False,
                    "keep_alive": "60s",
                    "format": Wording.model_json_schema(),
                    "messages": [{"role": "user", "content": prompt(plan, job.input["facts"])}],
                    "options": {
                        "num_ctx": 2048,
                        "num_predict": 128,
                        "temperature": 0.2,
                        "seed": job.input["seed"],
                    },
                }
            ).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(request, timeout=min(settings.llm_timeout_seconds, 90)) as response:
            raw = response.read(16385)
        if len(raw) > 16384:
            raise ValueError("Oversized response")
        result = json.loads(raw)
        if not result.get("done") or result.get("done_reason") == "length":
            raise ValueError("Incomplete result")
        selected = Wording.model_validate_json(result["message"]["content"]).model_dump()
        metadata.update(
            {
                key: result.get(key)
                for key in (
                    "total_duration",
                    "load_duration",
                    "prompt_eval_count",
                    "eval_count",
                )
            }
        )
        return render(job.input, selected), {
            **metadata,
            "source": "assisted",
            "selection": selected,
        }
    except (OSError, ValueError, KeyError, TypeError) as exc:
        return fallback(job.input), {
            **metadata,
            "source": "template-fallback",
            "error_type": type(exc).__name__,
            "selection": plan["default_wording"],
            "quality_note": (
                "ИИ недоступен или ответ не прошёл проверку. Использован текст заготовки."
            ),
        }
