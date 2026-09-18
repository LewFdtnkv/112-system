from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, JsonValue

from app.models.enums import AttemptStatus, CardStatus, LessonStatus, TrainingRole


class DraftData(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    caller_name: str | None = Field(default=None, max_length=255)
    caller_phone: str | None = Field(default=None, max_length=100)
    caller_details: dict[str, JsonValue] | None = None
    address_text: str | None = Field(default=None, max_length=10000)
    address_details: dict[str, JsonValue] | None = None
    description: str | None = Field(default=None, max_length=10000)
    victim_details: str | None = Field(default=None, max_length=10000)
    features: dict[str, JsonValue] | None = None
    additional_fields: dict[str, JsonValue] = Field(default_factory=dict)


class DraftSave(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: int = Field(ge=1)
    classifier_entry_id: UUID | None = None
    data: DraftData


class CardSubmit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: int = Field(ge=1)


class StudentCardRead(BaseModel):
    id: UUID
    revision: int
    status: CardStatus
    classifier_version_id: UUID
    classifier_entry_id: UUID | None
    data: DraftData
    opened_at: datetime | None
    saved_at: datetime | None
    notification_completed_at: datetime | None


class RecipientRead(BaseModel):
    service_id: UUID
    name: str


class StudentAttemptRead(BaseModel):
    id: UUID
    assignment_id: UUID
    status: AttemptStatus
    started_at: datetime
    ended_at: datetime | None
    instructions: str
    caller_message: str | None
    time_limit_seconds: int | None
    card: StudentCardRead
    notified_services: list[RecipientRead]


class StudentAssignmentRead(BaseModel):
    id: UUID
    position: int
    title: str
    role: TrainingRole
    available: bool
    attempt_id: UUID | None
    status: Literal["pending", "in_progress", "completed", "interrupted"]


class StudentLessonRead(BaseModel):
    id: UUID
    title: str
    status: LessonStatus
    started_at: datetime | None
    ended_at: datetime | None
    work_status: Literal["assigned", "in_progress", "submitted"]
    assignments: list[StudentAssignmentRead]
