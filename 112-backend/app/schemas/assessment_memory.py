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


MEMORY_CRITERIA = {
    "description": ("112 — Смысл сообщения", "text"),
    "address_text": ("112 — Адрес целиком", "text"),
    "address_details.description": ("112 — Описание места", "text"),
    "additional_fields.operatorAction": ("112 — Комментарий оператора", "text"),
    "additional_fields.details.classificationDescription": ("112 — Уточнение типа", "text"),
    "additional_services": ("112 — Дополнительные службы", "services"),
    "dds.comments": ("ДДС — Комментарии бригад", "dds"),
}


class MemoryExampleCreate(MemoryCreate):
    condition: str = Field(min_length=15, max_length=3000)
    answer: str = Field(max_length=2000)

    @field_validator("criterion_code")
    @classmethod
    def supported_criterion(cls, value):
        if value not in MEMORY_CRITERIA:
            raise ValueError("Выберите критерий смысловой проверки")
        return value

    @field_validator("condition", "answer", mode="before")
    @classmethod
    def trim_text(cls, value):
        return value.strip() if isinstance(value, str) else value


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
