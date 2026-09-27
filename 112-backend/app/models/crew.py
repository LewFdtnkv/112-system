from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import UUIDPrimaryKey


class CrewAssignment(UUIDPrimaryKey, Base):
    __tablename__ = "crew_assignments"
    __table_args__ = (
        ForeignKeyConstraint(
            ["response_id", "attempt_id"],
            ["service_responses.id", "service_responses.attempt_id"],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("response_id", "crew_code"),
        CheckConstraint(
            "status NOT IN ('not_accepted','refused') OR length(btrim(comment)) > 0",
            name="refusal_reason",
        ),
        CheckConstraint("revision > 0", name="positive_revision"),
        CheckConstraint(
            "status IN ('assigned','accepted','not_accepted','responding','arrived',"
            "'in_progress','completed','refused','cancelled')",
            name="valid_status",
        ),
    )

    attempt_id: Mapped[UUID] = mapped_column(
        ForeignKey("attempts.id", ondelete="RESTRICT"), index=True
    )
    response_id: Mapped[UUID] = mapped_column(index=True)
    crew_code: Mapped[str] = mapped_column(String(100))
    snapshot: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(30), default="assigned")
    crew_number: Mapped[str | None] = mapped_column(String(100))
    comment: Mapped[str] = mapped_column(Text)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    __mapper_args__ = {"version_id_col": revision}
