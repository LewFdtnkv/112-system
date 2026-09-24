"""Published worked examples; withdrawal never deletes historical evidence."""

from datetime import datetime
from uuid import UUID

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import CreatedAt, UUIDPrimaryKey


class AssessmentExample(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "assessment_examples"
    __table_args__ = (
        CheckConstraint("kind IN ('text', 'services', 'dds')", name="kind"),
        CheckConstraint("role IN ('operator_112', 'dds')", name="role"),
        CheckConstraint(
            "verdict IN ('correct', 'partial', 'incorrect', 'uncertain')", name="verdict"
        ),
        Index("ix_assessment_examples_scope", "active", "kind", "role", "criterion_code"),
    )

    source_key: Mapped[str] = mapped_column(String(200), unique=True)
    created_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    source_job_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("ai_jobs.id", ondelete="RESTRICT")
    )
    kind: Mapped[str] = mapped_column(String(20))
    role: Mapped[str] = mapped_column(String(20))
    criterion_code: Mapped[str] = mapped_column(String(100))
    policy_version: Mapped[str] = mapped_column(String(50), default="semantic-v1")
    situation: Mapped[str] = mapped_column(Text)
    reference: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    verdict: Mapped[str] = mapped_column(String(20))
    reason: Mapped[str] = mapped_column(Text)
    search_text: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1024))
    embedding_model: Mapped[str | None] = mapped_column(String(255))
    embedded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AssessmentMemoryPreference(Base):
    __tablename__ = "assessment_memory_preferences"
    teacher_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True
    )
    example_id: Mapped[UUID] = mapped_column(
        ForeignKey("assessment_examples.id", ondelete="RESTRICT"), primary_key=True
    )
    disabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    removed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
