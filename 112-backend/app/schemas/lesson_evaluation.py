from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator

from app.schemas.authoring import NonblankText
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
    reviewer_id: UUID
    revision: int
    supersedes_id: UUID | None
    score: Decimal
    max_score: Decimal
    comment: str
    created_at: datetime


class AssignmentReview(BaseModel):
    assignment_id: UUID
    position: int
    source_snapshot: dict[str, JsonValue] | None
    attempt: StudentAttemptRead | None


class LessonWorkReview(BaseModel):
    lesson_id: UUID
    student_id: UUID
    submitted: bool
    assignments: list[AssignmentReview]
    evaluations: list[LessonGradeRead]
