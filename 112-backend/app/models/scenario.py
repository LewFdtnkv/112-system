from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import CreatedAt, UUIDPrimaryKey, enum_column
from app.models.enums import PublicationStatus, TrainingRole


class Scenario(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "scenarios"

    title: Mapped[str] = mapped_column(String(255))
    created_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))


class ScenarioVersion(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "scenario_versions"
    __table_args__ = (
        UniqueConstraint("scenario_id", "version"),
        CheckConstraint("version > 0", name="positive_version"),
        CheckConstraint("role != 'dds' OR service_profile_id IS NOT NULL", name="dds_profile"),
        CheckConstraint(
            "status = 'draft' OR (approved_by_id IS NOT NULL AND approved_at IS NOT NULL)",
            name="publication_approval",
        ),
    )

    scenario_id: Mapped[UUID] = mapped_column(ForeignKey("scenarios.id", ondelete="RESTRICT"))
    version: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(255))
    role: Mapped[TrainingRole] = mapped_column(enum_column(TrainingRole, "scenario_role"))
    status: Mapped[PublicationStatus] = mapped_column(
        enum_column(PublicationStatus, "scenario_publication"), default=PublicationStatus.DRAFT
    )
    classifier_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("classifier_versions.id", ondelete="RESTRICT"), index=True
    )
    service_profile_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("service_profiles.id", ondelete="RESTRICT"), index=True
    )
    difficulty: Mapped[str | None] = mapped_column(String(50))
    instructions: Mapped[str] = mapped_column(Text)
    caller_message: Mapped[str | None] = mapped_column(Text)
    caller_audio_key: Mapped[str | None] = mapped_column(Text)
    # Student-visible DDS input, distinct from the hidden correct answer.
    initial_card: Mapped[dict[str, Any] | None] = mapped_column(JSONB(none_as_null=True))
    scheduled_events: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default="[]"
    )
    hints: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default="[]")
    completion_rules: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default="{}"
    )
    provenance: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    approved_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AnswerKey(Base):
    __tablename__ = "answer_keys"

    scenario_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("scenario_versions.id", ondelete="RESTRICT"), primary_key=True
    )
    expected_card: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    expected_actions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default="[]"
    )
    rubric: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default="[]")
    explanation: Mapped[str] = mapped_column(Text, default="", server_default="")
