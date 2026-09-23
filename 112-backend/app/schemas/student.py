from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, JsonValue, field_validator

from app.models.enums import AttemptStatus, CardStatus, LessonStatus, TrainingRole
from app.schemas.card_flags import validate_count, validate_flags
from app.schemas.catalog import ClassifierEntryRead
from app.schemas.learning import LearningPolicy, LearningResult
from app.schemas.location import validate_location


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

    _validate_location = field_validator("additional_fields")(validate_location)
    _validate_flags = field_validator("additional_fields")(validate_flags)
    _validate_count = field_validator("features")(validate_count)


class DraftSave(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: int = Field(ge=1)
    classifier_entry_id: UUID | None = None
    data: DraftData
    recipient_service_ids: list[UUID] | None = Field(default=None, max_length=100)

    @field_validator("recipient_service_ids")
    @classmethod
    def unique_services(cls, value):
        if value is not None and len(value) != len(set(value)):
            raise ValueError("Services must not repeat")
        return value


class CardSubmit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: int = Field(ge=1)


class StudentCardRead(BaseModel):
    recipient_service_ids: list[UUID] | None = None
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
    short_name: str | None = None
    service_id: UUID
    name: str


class StudentAttemptRead(BaseModel):
    exercise_scope: list[str] | None = None
    learning: LearningPolicy = Field(default_factory=LearningPolicy)
    role: TrainingRole = TrainingRole.OPERATOR_112
    dds: dict[str, JsonValue] | None = None
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
    classifier_entry: ClassifierEntryRead | None = None
    recipient_services: list[RecipientRead] = Field(default_factory=list)
    recipient_error: str | None = None
    norm_seconds: int = 30


class JournalCardRead(BaseModel):
    id: UUID
    started_at: datetime
    status: CardStatus
    address_text: str | None
    description: str | None
    caller_name: str | None
    caller_phone: str | None
    classifier_entry_id: UUID | None
    category_name: str | None


class StudentAssignmentRead(BaseModel):
    id: UUID
    position: int
    title: str
    role: TrainingRole
    available: bool
    attempt_id: UUID | None
    scheduled_at: datetime | None = None
    received_at: datetime | None = None
    first_opened_at: datetime | None = None
    first_response_at: datetime | None = None
    response_norm_seconds: int | None = None
    deadline_at: datetime | None = None
    card: JournalCardRead | None = None
    status: Literal["pending", "in_progress", "completed", "interrupted"]


class StudentLessonRead(BaseModel):
    delivery: Literal["sequential", "dds-stream-v1"] = "sequential"
    execution_started_at: datetime | None = None
    server_time: datetime | None = None
    learning: LearningPolicy = Field(default_factory=LearningPolicy)
    learning_result: LearningResult | None = None
    id: UUID
    title: str
    status: LessonStatus
    started_at: datetime | None
    ended_at: datetime | None
    work_status: Literal["assigned", "in_progress", "submitted"]
    available_from: datetime | None = None
    available_until: datetime | None = None
    assignments: list[StudentAssignmentRead]
