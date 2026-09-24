"""Separate account administration, teaching messages and proctoring records."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import CreatedAt, UUIDPrimaryKey


class UserActivity(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "user_activities"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    actor_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(100))
    reason: Mapped[str] = mapped_column(Text, default="")
    details: Mapped[dict] = mapped_column(JSONB, default=dict)


class TeachingMessage(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "teaching_messages"

    __table_args__ = (
        CheckConstraint(
            "(source = 'teacher' AND teacher_id IS NOT NULL AND ai_job_id IS NULL) OR "
            "(source = 'learning_advice' AND teacher_id IS NULL AND ai_job_id IS NOT NULL)",
            name="sender",
        ),
    )
    source: Mapped[str] = mapped_column(String(30), default="teacher", server_default="teacher")
    ai_job_id: Mapped[UUID | None] = mapped_column(ForeignKey("ai_jobs.id"), unique=True)
    details: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    teacher_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    group_id: Mapped[UUID | None] = mapped_column(ForeignKey("training_groups.id"))
    text: Mapped[str] = mapped_column(Text)


class MessageRecipient(Base):
    __tablename__ = "message_recipients"

    message_id: Mapped[UUID] = mapped_column(ForeignKey("teaching_messages.id"), primary_key=True)
    student_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True, index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ProctoringEvent(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "proctoring_events"
    __table_args__ = (UniqueConstraint("attempt_id", "command_id"),)

    attempt_id: Mapped[UUID] = mapped_column(ForeignKey("attempts.id"), index=True)
    command_id: Mapped[UUID]
    kind: Mapped[str] = mapped_column(String(50))
    client_occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class UserPhoto(Base):
    __tablename__ = "user_photos"
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    content: Mapped[bytes] = mapped_column(LargeBinary)
