from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class MemoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    criterion_code: str = Field(min_length=1, max_length=100)
    verdict: Literal["correct", "partial", "incorrect", "uncertain"]
    reason: str = Field(min_length=15, max_length=700)

    @field_validator("reason")
    @classmethod
    def substantive(cls, value):
        if len(value.strip()) < 15:
            raise ValueError("Объясните причину исправления (не менее 15 символов)")
        return value.strip()


class MemoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    criterion_code: str
    verdict: str
    reason: str
    active: bool
    embedded_at: datetime | None
    created_at: datetime


class MemoryPreferenceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool


class MemoryLibraryItem(MemoryRead):
    kind: str
    role: str
    source: Literal["shared", "teacher"]
    condition: str
    answer: str
    enabled: bool
    removed: bool


class MemoryLibraryPage(BaseModel):
    items: list[MemoryLibraryItem]
    total: int
    limit: int
    offset: int
