"""Shared HTTP query constraints; no endpoint registration here."""

from typing import Annotated

from fastapi import Query

Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]
Search = Annotated[str, Query(max_length=200)]
