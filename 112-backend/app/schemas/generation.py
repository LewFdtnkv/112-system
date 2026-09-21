import re
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.schemas.catalog_document import FeatureAnswer

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class GenerationParameters(BaseModel):
    """None always means resolve a concrete value before enqueueing."""

    model_config = ConfigDict(extra="forbid")

    classifier_version_id: UUID | None = None
    classifier_entry_id: UUID | None = None
    service_ids: list[UUID] | None = Field(default=None, max_length=24)
    gender: Literal["male", "female"] | None = None
    age: int | None = Field(default=None, ge=8, le=95)
    caller_name: ShortText | None = None
    locality: ShortText | None = None
    street: ShortText | None = None
    house: ShortText | None = None
    object: ShortText | None = None
    time_of_day: Literal["morning", "day", "evening", "night"] | None = None
    caller_state: Literal["calm", "worried", "panicked"] | None = None
    detail_level: Literal["brief", "normal", "detailed"] | None = None
    feature_answers: dict[str, FeatureAnswer] = Field(default_factory=dict, max_length=30)

    @model_validator(mode="after")
    def consistent(self):
        if self.classifier_entry_id and not self.classifier_version_id:
            raise ValueError("Для конкретного типа выберите версию ЕКП")
        if self.feature_answers and not self.classifier_entry_id:
            raise ValueError("Для признаков выберите конкретный тип происшествия")
        if self.service_ids is not None and len(set(self.service_ids)) != len(self.service_ids):
            raise ValueError("Службы не должны повторяться")
        return self


class GenerationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    count: int = Field(default=1, ge=1, le=10)
    parameters: GenerationParameters = Field(default_factory=GenerationParameters)


class GeneratedText(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=3, max_length=120)
    caller_message: str = Field(min_length=30, max_length=2500)
    description: str = Field(min_length=10, max_length=1500)

    @model_validator(mode="after")
    def russian_text(self):
        for value in (self.title, self.caller_message, self.description):
            if not re.search(r"[А-Яа-яЁё]", value) or re.search(
                r"[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]", value
            ):
                raise ValueError("Модель должна ответить на русском языке")
        return self


class GenerationRead(BaseModel):
    id: UUID
    status: Literal["queued", "running", "succeeded", "failed"]
    created_at: datetime
    completed_at: datetime | None
    card_template_id: UUID | None
    title: str
    incident_name: str
    address_text: str
    services: list[str]
    error: str | None
    attempts: int
    facts: dict
