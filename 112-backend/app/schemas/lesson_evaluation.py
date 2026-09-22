from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator

from app.schemas.assessment import AssessmentDetails
from app.schemas.authoring import NonblankText
from app.schemas.catalog import ClassifierEntryRead
from app.schemas.learning import LearningPolicy, LearningResult
from app.schemas.student import StudentAttemptRead


class LessonGradeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: UUID
    expected_revision: int = Field(default=0, ge=0)
    score: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    max_score: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    comment: NonblankText

    @model_validator(mode="after")
    def within_scale(self):
        if self.score > self.max_score:
            raise ValueError("Score must not exceed max_score")
        return self


class LessonGradeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    lesson_id: UUID
    student_id: UUID
    reviewer_id: UUID | None
    revision: int
    supersedes_id: UUID | None
    score: Decimal
    max_score: Decimal
    comment: str
    created_at: datetime
    method: Literal["rules", "teacher"]
    assessment_details: AssessmentDetails | None = None


class FieldCheck(BaseModel):
    field: str
    label: str
    expected: str
    actual: str
    status: Literal["matched", "missing", "different", "needs_review"]
    scored: bool


class AutomaticCheckSummary(BaseModel):
    method: str = "fields-v1"
    matched: int
    missing: int
    different: int
    needs_review: int
    earned_points: int
    possible_points: int
    score_percent: float | None


class AutomaticCheck(AutomaticCheckSummary):
    fields: list[FieldCheck]


class AssignmentReview(BaseModel):
    assignment_id: UUID
    position: int
    source_snapshot: dict[str, JsonValue] | None
    source_classifier_entry: ClassifierEntryRead | None = None
    attempt: StudentAttemptRead | None
    automatic_check: AutomaticCheck | None = None


class LessonWorkReview(BaseModel):
    learning: LearningPolicy = Field(default_factory=LearningPolicy)
    learning_result: LearningResult | None = None
    lesson_id: UUID
    student_id: UUID
    submitted: bool
    assignments: list[AssignmentReview]
    evaluations: list[LessonGradeRead]
    automatic_check: AutomaticCheckSummary
