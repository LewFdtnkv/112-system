"""Inputs freeze the exercise structure before a small model writes its wording."""

from typing import Literal
from uuid import UUID

from pydantic import Field

from app.schemas.catalog_document import StrictModel
from app.schemas.dds_exercise import CrewCode, CrewStatus


class DDSGenerationCreate(StrictModel):
    request_id: UUID
    revision: int = Field(ge=1, le=2147483647, strict=True)
    service_profile_id: UUID
    crew_codes: list[CrewCode] | None = Field(default=None, min_length=1, max_length=2)
    initial_status: (
        Literal["unassigned", "assigned", "accepted", "responding", "arrived", "in_progress"] | None
    ) = None
    target_status: CrewStatus | None = None
    reason: str | None = Field(default=None, max_length=2000)
    crew_calls_required: bool = False
    replace_existing: bool = False


class Wording(StrictModel):
    key: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=3, max_length=600)


class DDSNarration(StrictModel):
    entries: list[Wording] = Field(min_length=1, max_length=20)


class DDSReview(StrictModel):
    checked_keys: list[str]
    contradictions: list[str]
    unsupported: list[str]
    missing: list[str]
