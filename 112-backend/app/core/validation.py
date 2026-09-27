"""Actionable domain validation errors with an explicit form field location."""

from typing import NoReturn

from fastapi import HTTPException


def reject_field(path: str, message: str, *, status_code: int = 422) -> NoReturn:
    raise HTTPException(
        status_code,
        [{"loc": ["body", *path.split(".")], "type": "form_constraint", "msg": message}],
    )
