from pydantic import BaseModel

from app.schemas.user import UserRead
from app.schemas.views import LessonRow, Page


class PerformanceSummary(BaseModel):
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
