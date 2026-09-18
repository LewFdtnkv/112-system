from datetime import datetime
from typing import Any
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
from app.models.common import CreatedAt, UUIDPrimaryKey, enum_column
from app.models.enums import CardOrigin, CardStatus, ResponseStatus


class IncidentCard(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "incident_cards"
    __table_args__ = (
        ForeignKeyConstraint(
            ["classifier_entry_id", "classifier_version_id"],
            ["classifier_entries.id", "classifier_entries.classifier_version_id"],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("id", "attempt_id"),
        CheckConstraint("revision > 0", name="positive_revision"),
        CheckConstraint(
            "saved_at IS NULL OR (opened_at IS NOT NULL AND saved_at >= opened_at)",
            name="creation_time_order",
        ),
        CheckConstraint(
            "notification_completed_at IS NULL OR "
            "(saved_at IS NOT NULL AND notification_completed_at >= saved_at)",
            name="notification_time_order",
        ),
        CheckConstraint("origin != 'copied' OR source_card_id IS NOT NULL", name="copy_source"),
        CheckConstraint("source_card_id IS NULL OR source_card_id != id", name="not_own_source"),
    )

    # Proposal: one exercise/attempt owns one card; subsequent cards are separate attempts.
    attempt_id: Mapped[UUID] = mapped_column(
        ForeignKey("attempts.id", ondelete="RESTRICT"), unique=True
    )
    origin: Mapped[CardOrigin] = mapped_column(enum_column(CardOrigin, "card_origin"))
    source_card_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("incident_cards.id", ondelete="RESTRICT"), index=True
    )
    created_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    display_number: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[CardStatus] = mapped_column(
        enum_column(CardStatus, "card_status"), default=CardStatus.DRAFT
    )
    classifier_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("classifier_versions.id", ondelete="RESTRICT"), index=True
    )
    classifier_entry_id: Mapped[UUID | None] = mapped_column(index=True)
    source: Mapped[str | None] = mapped_column(String(255))
    caller_name: Mapped[str | None] = mapped_column(String(255))
    caller_phone: Mapped[str | None] = mapped_column(String(100))
    caller_details: Mapped[dict[str, Any] | None] = mapped_column(JSONB(none_as_null=True))
    address_text: Mapped[str | None] = mapped_column(Text)
    address_details: Mapped[dict[str, Any] | None] = mapped_column(JSONB(none_as_null=True))
    description: Mapped[str | None] = mapped_column(Text)
    victim_details: Mapped[str | None] = mapped_column(Text)
    # NULL means not known/not supplied; {} means an explicitly empty set of answers.
    features: Mapped[dict[str, Any] | None] = mapped_column(JSONB(none_as_null=True))
    additional_fields: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default="{}"
    )
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    saved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notification_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    __mapper_args__ = {"version_id_col": revision}


class ServiceResponse(UUIDPrimaryKey, Base):
    __tablename__ = "service_responses"
    __table_args__ = (
        ForeignKeyConstraint(
            ["card_id", "attempt_id"],
            ["incident_cards.id", "incident_cards.attempt_id"],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("card_id", "service_id"),
        UniqueConstraint("id", "attempt_id"),
        CheckConstraint("revision > 0", name="positive_revision"),
        CheckConstraint("sent_at IS NULL OR sent_at >= added_at", name="dispatch_time_order"),
        CheckConstraint(
            "received_at IS NULL OR (sent_at IS NOT NULL AND received_at >= sent_at)",
            name="receipt_time_order",
        ),
        CheckConstraint(
            "first_decision_at IS NULL OR (sent_at IS NOT NULL AND first_decision_at >= sent_at)",
            name="decision_time_order",
        ),
        CheckConstraint(
            "status NOT IN ('not_accepted', 'refused') OR length(btrim(comment)) > 0",
            name="refusal_reason",
        ),
    )

    card_id: Mapped[UUID] = mapped_column()
    attempt_id: Mapped[UUID] = mapped_column(
        ForeignKey("attempts.id", ondelete="RESTRICT"), index=True
    )
    service_id: Mapped[UUID] = mapped_column(
        ForeignKey("services.id", ondelete="RESTRICT"), index=True
    )
    service_name: Mapped[str] = mapped_column(String(255))
    status: Mapped[ResponseStatus] = mapped_column(
        enum_column(ResponseStatus, "response_status"), default=ResponseStatus.ADDED
    )
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    first_decision_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    crew_number: Mapped[str | None] = mapped_column(String(100))
    comment: Mapped[str] = mapped_column(Text, default="", server_default="")
    revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    __mapper_args__ = {"version_id_col": revision}


class ResponseEvent(UUIDPrimaryKey, Base):
    __tablename__ = "response_events"
    __table_args__ = (
        ForeignKeyConstraint(
            ["response_id", "attempt_id"],
            ["service_responses.id", "service_responses.attempt_id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["attempt_event_id", "attempt_id"],
            ["attempt_events.id", "attempt_events.attempt_id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["information_event_id", "attempt_id"],
            ["attempt_events.id", "attempt_events.attempt_id"],
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "status NOT IN ('not_accepted', 'refused') OR length(btrim(comment)) > 0",
            name="refusal_reason",
        ),
    )

    response_id: Mapped[UUID] = mapped_column(index=True)
    attempt_id: Mapped[UUID] = mapped_column(
        ForeignKey("attempts.id", ondelete="RESTRICT"), index=True
    )
    attempt_event_id: Mapped[UUID] = mapped_column(unique=True)
    information_event_id: Mapped[UUID | None] = mapped_column(index=True)
    status: Mapped[ResponseStatus] = mapped_column(
        enum_column(ResponseStatus, "response_event_status")
    )
    crew_number: Mapped[str | None] = mapped_column(String(100))
    comment: Mapped[str] = mapped_column(Text, default="", server_default="")
