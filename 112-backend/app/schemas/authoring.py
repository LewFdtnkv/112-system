from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.models.enums import LessonStatus, PublicationStatus, TrainingMode, TrainingRole
from app.schemas.group import Title

NonblankText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10000)
]


class CardData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    caller_name: str | None = Field(default=None, max_length=255)
    caller_phone: str | None = Field(default=None, max_length=100)
    caller_details: dict[str, JsonValue] | None = None
    address_text: NonblankText
    address_details: dict[str, JsonValue] | None = None
    description: NonblankText
    victim_details: str | None = Field(default=None, max_length=10000)
    features: dict[str, JsonValue] | None = None
    additional_fields: dict[str, JsonValue] = Field(default_factory=dict)


class CardCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title
    classifier_version_id: UUID
    classifier_entry_id: UUID
    caller_message: NonblankText | None = None
    instructions: str = Field(default="", max_length=10000)
    data: CardData
    recipient_service_ids: list[UUID] = Field(min_length=1, max_length=100)

    @field_validator("recipient_service_ids")
    @classmethod
    def unique_recipients(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("Recipients must not repeat")
        return value


class CardRead(CardCreate):
    id: UUID
    created_by_id: UUID
    created_at: datetime


class CardListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    classifier_version_id: UUID
    classifier_entry_id: UUID
    created_at: datetime


class ScenarioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title
    role: TrainingRole
    card_ids: list[UUID] = Field(min_length=1, max_length=100)
    service_profile_id: UUID | None = None
    instructions: str = Field(default="", max_length=10000)

    @model_validator(mode="after")
    def role_profile(self):
        if self.role == TrainingRole.DDS and self.service_profile_id is None:
            raise ValueError("DDS scenarios require a service profile")
        return self


class ScenarioCardRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    card_template_id: UUID
    position: int
    snapshot: dict[str, JsonValue]


class ScenarioRead(BaseModel):
    id: UUID  # This is the version ID used by LessonStart.scenario_version_id.
    scenario_id: UUID
    version: int
    title: str
    role: TrainingRole
    status: PublicationStatus
    classifier_version_id: UUID
    service_profile_id: UUID | None
    instructions: str
    approved_by_id: UUID | None
    approved_at: datetime | None
    created_at: datetime
    cards: list[ScenarioCardRead]


class ScenarioListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    scenario_id: UUID
    version: int
    title: str
    role: TrainingRole
    status: PublicationStatus
    classifier_version_id: UUID
    service_profile_id: UUID | None
    created_at: datetime


class LessonStart(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: UUID
    group_id: UUID
    student_id: UUID | None = None
    scenario_version_id: UUID
    title: Title | None = None
    mode: TrainingMode = TrainingMode.PRACTICE
    time_limit_seconds: int | None = Field(default=None, ge=1, le=86400)
    hint_delay_seconds: int | None = Field(default=None, ge=1, le=86400)


class LessonRead(BaseModel):
    id: UUID
    title: str
    teacher_id: UUID
    group_id: UUID | None
    scenario_version_id: UUID | None
    status: LessonStatus
    started_at: datetime | None
    ended_at: datetime | None
    student_count: int
    assignment_count: int


class AssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    lesson_id: UUID
    student_id: UUID
    scenario_version_id: UUID
    scenario_card_id: UUID | None
    position: int
    mode: TrainingMode
    time_limit_seconds: int | None
    hint_delay_seconds: int | None
