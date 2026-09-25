"""Shared HTTP query constraints; no endpoint registration here."""

from typing import Annotated

from fastapi import Query

from app.schemas.numbers import INT32_MAX, INT64_MAX

Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0, le=INT64_MAX)]
Search = Annotated[str, Query(max_length=200)]

EventSequence = Annotated[int, Query(ge=0, le=INT32_MAX)]
