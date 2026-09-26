"""Personal lesson lifecycle, shared by operator 112 and DDS."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LessonExecution(Base):
    __tablename__ = "lesson_executions"

    lesson_id: Mapped[UUID] = mapped_column(
        ForeignKey("lessons.id", ondelete="RESTRICT"), primary_key=True
    )
    student_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active_attempt_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("attempts.id", ondelete="RESTRICT")
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    session_id: Mapped[UUID | None] = mapped_column()
