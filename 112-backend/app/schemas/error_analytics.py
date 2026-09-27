from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.views import Page


class Measure(BaseModel):
    checked: int
    errors: int
    error_percent: float


class ErrorField(Measure):
    key: str
    label: str
    role: Literal["operator_112", "dds"]


class Example(BaseModel):
    lesson_id: UUID
    student_id: UUID
    student: str
    position: int


class ErrorCard(Measure):
    key: str
    title: str
    role: Literal["operator_112", "dds"]
    students: int
    skills: dict[str, Measure]
    fields: list[ErrorField]
    examples: list[Example]


class ErrorSummary(Measure):
    students: int
    teacher_reviewed: int
    pending_ai: int
    incomplete_ai: int
    ungraded: int


class Skill(BaseModel):
    key: str
    label: str


class ErrorAnalyticsRead(BaseModel):
    summary: ErrorSummary
    skills: list[Skill]
    fields: list[ErrorField]
    cards: Page[ErrorCard]
