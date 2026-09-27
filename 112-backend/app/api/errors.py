"""Public error presentation: stable codes/field paths, no client-side domain parsing."""

import json
import re
from pathlib import Path
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

_CATALOG = json.loads(Path(__file__).with_name("error_catalog.json").read_text())
_FIELDS = _CATALOG["fields"]
_MESSAGES = _CATALOG["messages"]
_VALIDATION_MESSAGES = {
    "missing": "Заполните это поле.",
    "string_too_short": "Значение слишком короткое. Дополните поле.",
    "string_too_long": "Сократите значение поля.",
    "string_pattern_mismatch": "Проверьте формат значения.",
    "int_parsing": "Введите целое число.",
    "int_type": "Введите целое число.",
    "finite_number": "Введите конечное число.",
    "greater_than_equal": "Значение меньше допустимого.",
    "greater_than": "Значение должно быть больше допустимой границы.",
    "less_than_equal": "Значение больше допустимого.",
    "too_short": "Добавьте хотя бы один элемент.",
    "uuid_parsing": "Выберите значение из списка.",
}
_TRUSTED = {"generation_constraint", "card_constraint", "form_constraint"}


def _message(detail: str) -> str | None:
    for prefix, text in (
        ("Answer required feature: ", "Заполните обязательный признак: "),
        ("Invalid answer for feature: ", "Проверьте значение признака: "),
    ):
        if detail.startswith(prefix):
            return text + detail[len(prefix) :]
    return _MESSAGES.get(detail)


def public_error(detail: Any) -> dict:
    """Keep diagnostic detail for API clients; expose only trusted UI messages."""
    result: dict = {"detail": detail}
    issues = []
    if isinstance(detail, str):
        if known := _FIELDS.get(detail):
            code = re.sub(r"[^a-z0-9]+", "_", detail.lower()).strip("_")
            issues.append({"path": known[0], "message": known[1], "code": code})
        if message := _message(detail):
            result["message"] = message
    else:
        rows = (
            detail
            if isinstance(detail, list)
            else detail.get("errors", [])
            if isinstance(detail, dict)
            else []
        )
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("loc"), (list, tuple)):
                continue
            path = [str(p) for p in row["loc"] if p != "body" and isinstance(p, (str, int))]
            kind, message = row.get("type", "validation"), row.get("msg", "")
            known = _FIELDS.get(message)
            if known:
                path.append(known[0])
            text = (
                message
                if kind in _TRUSTED
                else known[1]
                if known
                else _message(message)
                or _VALIDATION_MESSAGES.get(kind, "Проверьте значение этого поля.")
            )
            issues.append({"path": ".".join(path), "message": text, "code": kind})
    if issues:
        result["field_errors"] = issues
    return result


async def http_error_response(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code, content=public_error(exc.detail), headers=exc.headers
    )
