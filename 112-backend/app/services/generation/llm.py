"""Write actual prose, check it independently, retry once, otherwise disclose fallback."""

import json
import time
import urllib.request

from app.core.config import settings
from app.services.generation.examples import builtins
from app.services.generation.narration import fallback
from app.services.generation.prose import (
    VERSION,
    Narration,
    Review,
    assemble,
    exact_service_source,
    fingerprint,
    generation_prompt,
    review_prompt,
    source,
    validate_message,
    validate_review,
)


def request(model, prompt, schema, *, seed, temperature, timeout):
    if len(prompt) > 10000:
        raise ValueError("Too many facts for the small model context")
    instructions, _, data = prompt.partition("\n")
    req = urllib.request.Request(
        settings.llm_base_url.rstrip("/") + "/api/chat",
        data=json.dumps(
            {
                "model": model,
                "stream": False,
                "think": False,
                "keep_alive": "5m",
                "format": schema.model_json_schema(),
                "messages": [
                    {"role": "system", "content": instructions},
                    {"role": "user", "content": data},
                ],
                "options": {
                    "num_ctx": 4096,
                    "num_predict": 400 if schema is Review else 650,
                    "num_thread": settings.llm_threads,
                    "temperature": temperature,
                    "top_p": 0.8,
                    "seed": seed,
                },
            }
        ).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req, timeout=max(1, timeout)) as response:
        raw = response.read(65537)
    if len(raw) > 65536:
        raise ValueError("Oversized response")
    result = json.loads(raw)
    if not result.get("done") or result.get("done_reason") == "length":
        raise ValueError("Incomplete result")
    value = schema.model_validate_json(result["message"]["content"])
    metrics = {
        key: result.get(key)
        for key in (
            "total_duration",
            "load_duration",
            "prompt_eval_count",
            "eval_count",
        )
    }
    return value, metrics


def compose(job):
    plan = job.input["narrative"]
    if plan["mode"] == "template":
        return fallback(job.input), {"source": "template", "selection": plan["default_wording"]}
    examples = getattr(job, "context", {}).get("generation_examples", builtins(job.input))
    metadata = {
        "model": job.model_version,
        "seed": job.input["seed"],
        "num_thread": settings.llm_threads,
        "prose_version": VERSION,
        "examples": examples,
        "retrieval": "incident-channel-features",
        "attempts": [],
    }
    deadline = time.monotonic() + settings.llm_timeout_seconds
    feedback = None
    for attempt in range(2):
        report = {"attempt": attempt + 1}
        metadata["attempts"].append(report)
        try:
            if deadline - time.monotonic() < 2:
                raise TimeoutError("Generation deadline reached")
            draft, report["writer"] = request(
                job.model_version,
                generation_prompt(job.input, [e["message"] for e in examples], feedback),
                Narration,
                seed=job.input["seed"] + attempt,
                temperature=0.45,
                timeout=deadline - time.monotonic(),
            )
            report["draft"] = draft.message
            validate_message(job.input, draft.message)
            if exact_service_source(job.input, draft.message):
                review = Review(
                    covered=list(range(len(source(job.input)[1]))),
                    unsupported=[],
                    contradictions=[],
                )
                report["review_source"] = "exact-source"
            else:
                if deadline - time.monotonic() < 2:
                    raise TimeoutError("No time left for independent review")
                review, report["critic"] = request(
                    job.model_version,
                    review_prompt(job.input, draft.message),
                    Review,
                    seed=job.input["seed"],
                    temperature=0,
                    timeout=deadline - time.monotonic(),
                )
                report["review_source"] = "model"
            report["review"] = review.model_dump()
            validate_review(job.input, draft.message, review)
            text = assemble(job.input, draft.message)
            return text, {
                **metadata,
                "source": "assisted",
                "draft": draft.message,
                "review": review.model_dump(),
                "review_source": report["review_source"],
                "input_hash": fingerprint(job.input),
                "quality_note": (
                    "Текст ИИ точно совпал с подготовленным служебным сообщением; "
                    "совпадение проверено автоматически. "
                    if report["review_source"] == "exact-source"
                    else "ИИ написал сообщение и проверил его по исходным фактам. "
                )
                + "Перед занятием требуется проверка преподавателя.",
            }
        except (OSError, ValueError, KeyError, TypeError) as exc:
            report["error_type"] = type(exc).__name__
            # Do not expose network details; semantic feedback is bounded and local to this job.
            feedback = str(exc)[:1000] if isinstance(exc, ValueError) else "Модель недоступна"
            report["rejection"] = feedback
            if isinstance(exc, OSError):
                break
    return fallback(job.input), {
        **metadata,
        "source": "template-fallback",
        "selection": plan["default_wording"],
        "quality_note": "Свободный текст ИИ не прошёл проверку или модель недоступна. "
        "Использована заготовка; проверьте и при необходимости отредактируйте её.",
    }
