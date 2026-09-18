from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import UUIDPrimaryKey, enum_column
from app.models.enums import CallStatus


class TrainingCall(UUIDPrimaryKey, Base):
    __tablename__ = "training_calls"
    __table_args__ = (
        ForeignKeyConstraint(
            ["response_id", "attempt_id"],
            ["service_responses.id", "service_responses.attempt_id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["contact_id", "target_service_id"],
            ["training_contacts.id", "training_contacts.target_service_id"],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("attempt_id", "command_id"),
        CheckConstraint(
            "connected_at IS NULL OR connected_at >= started_at", name="connection_time_order"
        ),
        CheckConstraint(
            "ended_at IS NULL OR (ended_at >= started_at AND "
            "(connected_at IS NULL OR ended_at >= connected_at))",
            name="end_time_order",
        ),
        CheckConstraint(
            "endpoint_key ~ '^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$'", name="local_endpoint"
        ),
    )

    attempt_id: Mapped[UUID] = mapped_column(ForeignKey("attempts.id", ondelete="RESTRICT"))
    response_id: Mapped[UUID] = mapped_column(index=True)
    command_id: Mapped[UUID] = mapped_column()
    initiated_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    contact_id: Mapped[UUID] = mapped_column(index=True)
    target_service_id: Mapped[UUID] = mapped_column(
        ForeignKey("services.id", ondelete="RESTRICT"), index=True
    )
    contact_name: Mapped[str] = mapped_column(String(255))
    target_service_name: Mapped[str] = mapped_column(String(255))
    endpoint_key: Mapped[str] = mapped_column(String(64))
    status: Mapped[CallStatus] = mapped_column(
        enum_column(CallStatus, "call_status"), default=CallStatus.DIALING
    )
    provider_call_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    result: Mapped[str | None] = mapped_column(Text)
    recording_key: Mapped[str | None] = mapped_column(Text)
