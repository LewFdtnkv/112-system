"""A bounded permission to create one personal lesson from a study recommendation."""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import CreatedAt, UUIDPrimaryKey


class LearningReferral(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "learning_referrals"
    __table_args__ = (UniqueConstraint("message_id", "skill"),)

    message_id: Mapped[UUID] = mapped_column(
        ForeignKey("teaching_messages.id", ondelete="CASCADE"), index=True
    )
    student_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    scenario_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("scenario_versions.id", ondelete="RESTRICT")
    )
    teacher_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    skill: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(255))
    learning: Mapped[dict[str, Any]] = mapped_column(JSONB)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    lesson_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("lessons.id", ondelete="RESTRICT"), unique=True
    )
