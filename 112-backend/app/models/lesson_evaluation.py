from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import CreatedAt, UUIDPrimaryKey


class LessonEvaluation(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "lesson_evaluations"
    __table_args__ = (
        UniqueConstraint("lesson_id", "student_id", "revision"),
        UniqueConstraint(
            "lesson_id", "student_id", "request_id", name="uq_lesson_evaluations_request"
        ),
        UniqueConstraint("id", "lesson_id", "student_id"),
        ForeignKeyConstraint(
            ["supersedes_id", "lesson_id", "student_id"],
            [
                "lesson_evaluations.id",
                "lesson_evaluations.lesson_id",
                "lesson_evaluations.student_id",
            ],
            ondelete="RESTRICT",
        ),
        CheckConstraint("revision > 0", name="positive_revision"),
        CheckConstraint("score >= 0 AND max_score > 0 AND score <= max_score", name="score_range"),
        CheckConstraint("length(btrim(comment)) > 0", name="comment_required"),
        CheckConstraint("supersedes_id IS NULL OR supersedes_id != id", name="not_own_predecessor"),
        CheckConstraint("method IN ('rules', 'teacher')", name="method"),
        CheckConstraint(
            "(method = 'teacher' AND reviewer_id IS NOT NULL) OR "
            "(method = 'rules' AND reviewer_id IS NULL)",
            name="reviewer_method",
        ),
    )

    lesson_id: Mapped[UUID] = mapped_column(ForeignKey("lessons.id", ondelete="RESTRICT"))
    student_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    reviewer_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    request_id: Mapped[UUID] = mapped_column()
    revision: Mapped[int] = mapped_column(Integer)
    supersedes_id: Mapped[UUID | None] = mapped_column(index=True)
    score: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    max_score: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    comment: Mapped[str] = mapped_column(Text)
    method: Mapped[str] = mapped_column(String(20), default="teacher", server_default="teacher")
    assessment_details: Mapped[dict | None] = mapped_column(JSONB(none_as_null=True))
