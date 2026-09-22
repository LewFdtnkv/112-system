from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.user import UserRead
from app.schemas.views import LessonRow, Page


class PerformanceTrack(BaseModel):
    track: Literal["training", "assessment"]
    graded_lessons: int
    overall_percent: float | None
    recent_percent: float | None
    recent_count: int
    recent_lessons: list[LessonRow]


class PerformanceSummary(BaseModel):
    tracks: list[PerformanceTrack] = Field(default_factory=list)
    total_lessons: int
    completed_lessons: int
    graded_lessons: int
    overall_percent: float | None
    recent_percent: float | None
    recent_count: int
    recent_limit: int = 5
    recent_lessons: list[LessonRow]


class StudentOverview(BaseModel):
    user: UserRead
    groups: list[str]
    performance: PerformanceSummary
    active_lessons: Page[LessonRow]
