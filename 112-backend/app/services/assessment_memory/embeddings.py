"""Local Ollama embeddings, with model identity and no silent truncation."""

import json
import math
import urllib.request

from app.core.config import settings

DIMENSIONS = 1024
RETRIEVAL_VERSION = "qwen-retrieval-v1"
INSTRUCTION = (
    "Instruct: Retrieve worked assessment examples explaining semantic equivalence, "
    "omissions, contradictions or insufficient evidence for this student answer.\nQuery: "
)


def request(path, payload=None):
    req = urllib.request.Request(
        settings.llm_base_url.rstrip("/") + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json"},
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req, timeout=settings.embedding_timeout_seconds) as response:
        data = response.read(2_000_001)
    if len(data) > 2_000_000:
        raise ValueError("Oversized embedding response")
    return json.loads(data)


def identity():
    model = next(
        (m for m in request("/api/tags")["models"] if m["name"] == settings.embedding_model), None
    )
    if not model or not model.get("digest"):
        raise ValueError("Embedding model is not installed")
    return f"{settings.embedding_model}@{model['digest']}:{RETRIEVAL_VERSION}"


def embed(texts, *, query=False):
    if not texts or len(texts) > 32 or any(not text.strip() or len(text) > 6000 for text in texts):
        raise ValueError("Invalid embedding batch")
    model_id = identity()
    result = request(
        "/api/embed",
        {
            "model": settings.embedding_model,
            "input": [INSTRUCTION + text if query else text for text in texts],
            "truncate": False,
            "keep_alive": 0,
            "options": {"num_ctx": 2048, "num_thread": settings.llm_threads},
        },
    )
    vectors = result.get("embeddings", [])
    if len(vectors) != len(texts) or any(
        len(v) != DIMENSIONS or not all(math.isfinite(x) for x in v) or sum(x * x for x in v) < 0.01
        for v in vectors
    ):
        raise ValueError("Invalid embedding dimensions or values")
    if model_id != identity():
        raise ValueError("Embedding model changed during inference")
    return vectors, model_id
