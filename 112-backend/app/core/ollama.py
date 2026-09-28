"""Bounded JSON transport for local Ollama; domain prompts and retries stay with callers."""

import json
import urllib.request
from typing import Any

from app.core.config import settings


def chat(body: dict[str, Any], *, timeout: float, max_response_bytes: int) -> dict[str, Any]:
    request = urllib.request.Request(
        settings.llm_base_url.rstrip("/") + "/api/chat",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    # Local inference must not go through a machine's HTTP proxy.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=timeout) as response:
        payload = response.read(max_response_bytes + 1)
    if len(payload) > max_response_bytes:
        raise ValueError("Oversized model response")
    result = json.loads(payload)
    if not isinstance(result, dict):
        raise ValueError("Invalid model response envelope")
    return result


def require_complete(result: dict[str, Any]) -> None:
    if not result.get("done") or result.get("done_reason") == "length":
        raise ValueError("Incomplete model response")
