from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import CreatedAt, UUIDPrimaryKey, enum_column
from app.models.enums import AIPurpose, EvaluationMethod, EvaluationStatus, JobStatus


class AIJob(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "ai_jobs"
    __table_args__ = (
        UniqueConstraint("id", "attempt_id"),
        CheckConstraint("retry_count >= 0", name="nonnegative_retries"),
        CheckConstraint(
            "purpose != 'evaluation' OR attempt_id IS NOT NULL", name="evaluation_target"
        ),
        CheckConstraint(
            "status != 'running' OR (worker_id IS NOT NULL AND lease_expires_at IS NOT NULL)",
            name="running_lease",
        ),
        Index("ix_ai_jobs_poll", "status", "available_at"),
    )

    purpose: Mapped[AIPurpose] = mapped_column(enum_column(AIPurpose, "ai_purpose"))
    created_by_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    card_template_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("card_templates.id", ondelete="RESTRICT"), unique=True
    )
    scenario_version_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("scenario_versions.id", ondelete="RESTRICT"), index=True
    )
    attempt_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("attempts.id", ondelete="RESTRICT"), index=True
    )
    idempotency_key: Mapped[UUID] = mapped_column(unique=True)
    status: Mapped[JobStatus] = mapped_column(
        enum_column(JobStatus, "ai_job_status"), default=JobStatus.QUEUED
    )
    retry_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    available_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    worker_id: Mapped[str | None] = mapped_column(String(100))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    model_version: Mapped[str | None] = mapped_column(String(255))
    prompt_version: Mapped[str] = mapped_column(String(100))
    input: Mapped[dict[str, Any]] = mapped_column(JSONB)
    context: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    output: Mapped[dict[str, Any] | None] = mapped_column(JSONB(none_as_null=True))
    error: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Evaluation(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "evaluations"
    __table_args__ = (
        UniqueConstraint("attempt_id", "revision"),
        UniqueConstraint("id", "attempt_id"),
        ForeignKeyConstraint(
            ["supersedes_id", "attempt_id"],
            ["evaluations.id", "evaluations.attempt_id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["ai_job_id", "attempt_id"], ["ai_jobs.id", "ai_jobs.attempt_id"], ondelete="RESTRICT"
        ),
        CheckConstraint("revision > 0", name="positive_revision"),
        CheckConstraint("supersedes_id IS NULL OR supersedes_id != id", name="not_own_predecessor"),
        CheckConstraint(
            "(score IS NULL OR score >= 0) AND (max_score IS NULL OR max_score > 0) AND "
            "(score IS NULL OR (max_score IS NOT NULL AND score <= max_score))",
            name="score_range",
        ),
        CheckConstraint(
            "method != 'teacher' OR (reviewer_id IS NOT NULL AND "
            "review_reason IS NOT NULL AND length(btrim(review_reason)) > 0)",
            name="teacher_reason",
        ),
        CheckConstraint("method != 'ai' OR ai_job_id IS NOT NULL", name="ai_provenance"),
    )

    attempt_id: Mapped[UUID] = mapped_column(ForeignKey("attempts.id", ondelete="RESTRICT"))
    revision: Mapped[int] = mapped_column(Integer)
    method: Mapped[EvaluationMethod] = mapped_column(
        enum_column(EvaluationMethod, "evaluation_method")
    )
    status: Mapped[EvaluationStatus] = mapped_column(
        enum_column(EvaluationStatus, "evaluation_status"), default=EvaluationStatus.PENDING
    )
    supersedes_id: Mapped[UUID | None] = mapped_column(index=True)
    ai_job_id: Mapped[UUID | None] = mapped_column(index=True)
    reviewer_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    review_reason: Mapped[str | None] = mapped_column(Text)
    score: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    max_score: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    summary: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    context_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default="{}"
    )


class CriterionResult(UUIDPrimaryKey, Base):
    __tablename__ = "criterion_results"
    __table_args__ = (
        ForeignKeyConstraint(
            ["evaluation_id", "attempt_id"],
            ["evaluations.id", "evaluations.attempt_id"],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("evaluation_id", "code"),
        UniqueConstraint("id", "attempt_id"),
        CheckConstraint(
            "(score IS NULL OR score >= 0) AND max_score > 0 AND "
            "(score IS NULL OR score <= max_score)",
            name="score_range",
        ),
    )

    evaluation_id: Mapped[UUID] = mapped_column()
    attempt_id: Mapped[UUID] = mapped_column(
        ForeignKey("attempts.id", ondelete="RESTRICT"), index=True
    )
    code: Mapped[str] = mapped_column(String(100))
    criterion_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB)
    score: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    max_score: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    explanation: Mapped[str] = mapped_column(Text)


class CriterionEvidence(Base):
    __tablename__ = "criterion_evidence"
    __table_args__ = (
        ForeignKeyConstraint(
            ["criterion_result_id", "attempt_id"],
            ["criterion_results.id", "criterion_results.attempt_id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["attempt_event_id", "attempt_id"],
            ["attempt_events.id", "attempt_events.attempt_id"],
            ondelete="RESTRICT",
        ),
    )

    criterion_result_id: Mapped[UUID] = mapped_column(primary_key=True)
    attempt_event_id: Mapped[UUID] = mapped_column(primary_key=True, index=True)
    attempt_id: Mapped[UUID] = mapped_column(
        ForeignKey("attempts.id", ondelete="RESTRICT"), index=True
    )
