from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.models.enums import LessonStatus, PublicationStatus, TrainingMode, TrainingRole
from app.schemas.assessment import AssessmentPolicy
from app.schemas.card_flags import validate_count, validate_flags
from app.schemas.catalog import ClassifierEntryRead
from app.schemas.dds import DDSPolicy
from app.schemas.group import Title
from app.schemas.learning import LearningPolicy
from app.schemas.location import validate_location
from app.schemas.student import RecipientRead

NonblankText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10000)
]


class CardData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    caller_name: str | None = Field(default=None, max_length=255)
    caller_phone: str | None = Field(default=None, max_length=100)
    caller_details: dict[str, JsonValue] | None = None
    address_text: str = Field(default="", max_length=10000)
    address_details: dict[str, JsonValue] | None = None
    description: NonblankText
    victim_details: str | None = Field(default=None, max_length=10000)
    features: dict[str, JsonValue] | None = None
    additional_fields: dict[str, JsonValue] = Field(default_factory=dict)

    _validate_location = field_validator("additional_fields")(validate_location)
    _validate_flags = field_validator("additional_fields")(validate_flags)
    _validate_count = field_validator("features")(validate_count)


class CardDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title
    classifier_version_id: UUID
    classifier_entry_id: UUID | None = None
    caller_message: NonblankText | None = None
    instructions: str = Field(default="", max_length=10000)
    data: CardData
    recipient_service_ids: list[UUID] = Field(default_factory=list, max_length=100)

    @field_validator("recipient_service_ids")
    @classmethod
    def unique_recipients(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("Recipients must not repeat")
        return value


class CardCreate(CardDefinition):
    use_recommended_recipients: bool = True


class CardUpdate(CardCreate):
    revision: int = Field(ge=1)


class CardRead(CardDefinition):
    generated_by_ai: bool = False
    can_edit: bool
    scenario_count: int
    revision: int
    updated_at: datetime
    classifier_label: str
    classifier_entry: ClassifierEntryRead | None = None
    recipients: list[RecipientRead] = Field(default_factory=list)
    id: UUID
    created_by_id: UUID
    created_at: datetime


class CardListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    classifier_version_id: UUID
    classifier_entry_id: UUID | None = None
    created_at: datetime
    revision: int
    updated_at: datetime


class ScenarioMetadata(BaseModel):
    category: str = Field(default="", max_length=255)
    difficulty: Literal["basic", "intermediate", "advanced"] = "basic"
    duration_minutes: int = Field(default=15, ge=1, le=120)
    norm_seconds: int = Field(default=30, ge=5, le=600)

    @field_validator("difficulty", mode="before")
    @classmethod
    def old_difficulty(cls, value):
        return value or "basic"


class ScenarioCreate(ScenarioMetadata):
    model_config = ConfigDict(extra="forbid")

    title: Title
    role: TrainingRole
    status: Literal["draft", "published"] = "published"
    card_ids: list[UUID] = Field(min_length=1, max_length=100)
    service_profile_id: UUID | None = None
    instructions: str = Field(default="", max_length=10000)
    assessment_policy: AssessmentPolicy = Field(default_factory=AssessmentPolicy)
    dds_policy: DDSPolicy | None = None

    @model_validator(mode="after")
    def role_profile(self):
        if self.role == TrainingRole.DDS and self.service_profile_id is None:
            raise ValueError("DDS scenarios require a service profile")
        if self.role == TrainingRole.DDS and self.dds_policy is None:
            raise ValueError("DDS scenarios require exercise steps")
        return self


class ScenarioCardRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    card_template_id: UUID
    position: int
    snapshot: dict[str, JsonValue]


class ScenarioRead(ScenarioMetadata):
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
    assessment_policy: AssessmentPolicy
    dds_policy: DDSPolicy | None = None


class ScenarioListItem(ScenarioMetadata):
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
    group_id: UUID | None = None
    group_ids: list[UUID] = Field(default_factory=list, max_length=100)
    student_ids: list[UUID] = Field(default_factory=list, max_length=1000)
    available_from: AwareDatetime | None = None
    available_until: AwareDatetime | None = None
    student_id: UUID | None = None
    scenario_version_id: UUID
    title: Title | None = None
    learning: LearningPolicy = Field(default_factory=LearningPolicy)
    time_limit_seconds: int | None = Field(default=None, ge=1, le=86400)

    @model_validator(mode="after")
    def targets_and_window(self):
        if self.group_id is None and not self.group_ids and not self.student_ids:
            raise ValueError("Choose groups or students")
        if self.group_id is not None and (self.group_ids or self.student_ids):
            raise ValueError("Do not mix legacy and multiple targets")
        if self.student_id is not None and self.group_id is None:
            raise ValueError("Individual legacy target requires a group")
        if (
            self.available_from
            and self.available_until
            and self.available_until <= self.available_from
        ):
            raise ValueError("End must be after start")
        return self


class LessonRead(BaseModel):
    learning: LearningPolicy = Field(default_factory=LearningPolicy)
    id: UUID
    title: str
    teacher_id: UUID
    group_id: UUID | None
    scenario_version_id: UUID | None
    status: LessonStatus
    started_at: datetime | None
    ended_at: datetime | None
    student_count: int
    available_from: datetime | None = None
    available_until: datetime | None = None
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
