"""Bounded HTTP audit without credentials, request bodies, query strings or SQL."""

import json
import logging
import os
from datetime import UTC, datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from time import perf_counter
from uuid import uuid4

LOG_DIRECTORY = Path(os.environ.get("SYSTEM_LOG_DIRECTORY", "var/log"))
logger = logging.getLogger("system112.requests")


def configure_request_log():
    LOG_DIRECTORY.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(
        LOG_DIRECTORY / "requests.log", maxBytes=5_000_000, backupCount=3, encoding="utf-8"
    )
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    return handler


async def record_request(request, call_next):
    start = perf_counter()
    request_id = str(uuid4())
    status, error = 500, None
    try:
        response = await call_next(request)
        status = response.status_code
        response.headers["X-Request-ID"] = request_id
        return response
    except Exception as exc:
        error = type(exc).__name__
        raise
    finally:
        route = request.scope.get("route")
        logger.info(
            json.dumps(
                {
                    "time": datetime.now(UTC).isoformat(),
                    "request_id": request_id,
                    "method": request.method,
                    "route": getattr(route, "path", "unmatched"),
                    "status": status,
                    "duration_ms": round((perf_counter() - start) * 1000),
                    "error_type": error,
                },
                ensure_ascii=False,
            )
        )
