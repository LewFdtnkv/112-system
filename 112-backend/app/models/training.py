from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import CreatedAt, UUIDPrimaryKey, enum_column
from app.models.enums import AttemptStatus, EventActor, LessonStatus, TrainingMode


class TrainingGroup(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "training_groups"

    name: Mapped[str] = mapped_column(String(255))
    teacher_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )


class GroupMembership(CreatedAt, Base):
    __tablename__ = "group_memberships"

    group_id: Mapped[UUID] = mapped_column(
        ForeignKey("training_groups.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )


class Lesson(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "lessons"
    __table_args__ = (
        UniqueConstraint("teacher_id", "start_request_id"),
        CheckConstraint(
            "ended_at IS NULL OR (started_at IS NOT NULL AND ended_at >= started_at)",
            name="time_order",
        ),
    )

    title: Mapped[str] = mapped_column(String(255))
    teacher_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    group_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("training_groups.id", ondelete="RESTRICT"), index=True
    )
    status: Mapped[LessonStatus] = mapped_column(
        enum_column(LessonStatus, "lesson_status"), default=LessonStatus.PLANNED
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    scenario_version_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("scenario_versions.id", ondelete="RESTRICT"), index=True
    )
    start_request_id: Mapped[UUID | None] = mapped_column()
    start_fingerprint: Mapped[str | None] = mapped_column(String(64))


class Assignment(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "assignments"
    __table_args__ = (
        ForeignKeyConstraint(
            ["scenario_card_id", "scenario_version_id"],
            ["scenario_cards.id", "scenario_cards.scenario_version_id"],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("id", "student_id", "scenario_version_id"),
        UniqueConstraint("lesson_id", "student_id", "position"),
        CheckConstraint("position > 0", name="positive_position"),
        CheckConstraint("time_limit_seconds IS NULL OR time_limit_seconds > 0", name="time_limit"),
        CheckConstraint("hint_delay_seconds IS NULL OR hint_delay_seconds > 0", name="hint_delay"),
    )

    lesson_id: Mapped[UUID] = mapped_column(
        ForeignKey("lessons.id", ondelete="RESTRICT"), index=True
    )
    student_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    scenario_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("scenario_versions.id", ondelete="RESTRICT"), index=True
    )
    mode: Mapped[TrainingMode] = mapped_column(enum_column(TrainingMode, "assignment_mode"))
    position: Mapped[int] = mapped_column(Integer)
    # Nullable only for pre-authoring assignments created with the original single-card model.
    scenario_card_id: Mapped[UUID | None] = mapped_column(index=True)
    time_limit_seconds: Mapped[int | None] = mapped_column(Integer)
    hint_delay_seconds: Mapped[int | None] = mapped_column(Integer)
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")


class Attempt(UUIDPrimaryKey, Base):
    __tablename__ = "attempts"
    __table_args__ = (
        ForeignKeyConstraint(
            ["assignment_id", "student_id", "scenario_version_id"],
            ["assignments.id", "assignments.student_id", "assignments.scenario_version_id"],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("assignment_id", "number"),
        CheckConstraint("number > 0", name="positive_number"),
        CheckConstraint("ended_at IS NULL OR ended_at >= started_at", name="time_order"),
        CheckConstraint(
            "(status = 'in_progress' AND ended_at IS NULL) OR "
            "(status != 'in_progress' AND ended_at IS NOT NULL)",
            name="end_state",
        ),
        Index("ix_attempts_student_started", "student_id", "started_at"),
    )

    assignment_id: Mapped[UUID] = mapped_column()
    student_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    scenario_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("scenario_versions.id", ondelete="RESTRICT"), index=True
    )
    number: Mapped[int] = mapped_column(Integer)
    mode: Mapped[TrainingMode] = mapped_column(enum_column(TrainingMode, "attempt_mode"))
    # Copy assignment timing/hint settings when starting. Later edits affect new attempts only.
    settings_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB)
    status: Mapped[AttemptStatus] = mapped_column(
        enum_column(AttemptStatus, "attempt_status"), default=AttemptStatus.IN_PROGRESS
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_reason: Mapped[str | None] = mapped_column(Text)


class AttemptEvent(UUIDPrimaryKey, Base):
    __tablename__ = "attempt_events"
    __table_args__ = (
        UniqueConstraint("attempt_id", "sequence", name="uq_attempt_events_attempt_id_sequence"),
        UniqueConstraint(
            "attempt_id", "command_id", name="uq_attempt_events_attempt_id_command_id"
        ),
        UniqueConstraint("id", "attempt_id"),
        CheckConstraint("sequence > 0", name="positive_sequence"),
        CheckConstraint(
            "(actor IN ('student', 'teacher') AND actor_id IS NOT NULL) OR "
            "(actor IN ('system', 'simulation') AND actor_id IS NULL)",
            name="actor_identity",
        ),
    )

    attempt_id: Mapped[UUID] = mapped_column(ForeignKey("attempts.id", ondelete="RESTRICT"))
    sequence: Mapped[int] = mapped_column(Integer)
    command_id: Mapped[UUID | None] = mapped_column()
    kind: Mapped[str] = mapped_column(String(100))
    actor: Mapped[EventActor] = mapped_column(enum_column(EventActor, "event_actor"))
    actor_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    client_occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
