"""Bounded page contracts; no hidden scenario answers in student projections."""

from datetime import datetime, timedelta
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator

from app.schemas.authoring import CardListItem
from app.schemas.learning import LearningPolicy
from app.schemas.student import RecipientRead


class Page[T](BaseModel):
    items: list[T]
    total: int
    limit: int
    offset: int


class CardLibraryItem(CardListItem):
    generation_example: bool = False
    generated_by_ai: bool = False
    incident_name: str
    classifier_label: str
    address_text: str
    recipients: list[RecipientRead]
    scenario_count: int


class UserItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    username: str
    first_name: str
    last_name: str
    middle_name: str | None
    email: str | None
    is_active: bool
    is_teacher: bool
    is_admin: bool
    must_change_password: bool
    last_login_at: datetime | None
    groups: list[str] = []


class GroupItem(BaseModel):
    id: UUID
    name: str
    student_count: int


class LessonRow(BaseModel):
    time_limit_seconds: int | None = None
    execution_started_at: datetime | None = None
    execution_ended_at: datetime | None = None
    paused_at: datetime | None = None
    deadline_at: datetime | None = None
    learning: LearningPolicy
    lesson_id: UUID
    title: str
    student_id: UUID
    student_name: str
    scenario_version_id: UUID
    scenario_title: str
    role: str
    group_name: str | None
    started_at: datetime | None
    ended_at: datetime | None
    completed_at: datetime | None = None
    available_from: datetime | None = None
    available_until: datetime | None = None
    status: str
    work_status: str
    card_count: int
    completed_count: int
    score: Decimal | None
    max_score: Decimal | None
    evaluation_revision: int | None
    evaluation_method: str | None

    @model_validator(mode="after")
    def deadline(self):
        limits = [self.available_until] if self.available_until else []
        if self.time_limit_seconds and self.execution_started_at:
            limits.append(self.execution_started_at + timedelta(seconds=self.time_limit_seconds))
        self.deadline_at = min(limits) if limits else None
        return self


class LessonPage(Page[LessonRow]):
    assigned_count: int
    in_progress_count: int
    submitted_count: int
    graded_count: int


class ScenarioItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    scenario_id: UUID
    version: int
    title: str
    category: str
    difficulty: str | None
    duration_minutes: int
    norm_seconds: int
    role: str
    status: str
    classifier_version_id: UUID
    service_profile_id: UUID | None
    created_at: datetime
    card_count: int


class AnalyticsRow(BaseModel):
    scenario_version_id: UUID
    title: str
    total: int
    submitted: int
    graded: int
    average_score_percent: float | None


class AnalyticsRead(BaseModel):
    total: int
    submitted: int
    graded: int
    average_score_percent: float | None
    scenarios: Page[AnalyticsRow]
