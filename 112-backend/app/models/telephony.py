from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
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
    response_id: Mapped[UUID | None] = mapped_column(index=True)
    command_id: Mapped[UUID] = mapped_column()
    request_fingerprint: Mapped[str | None] = mapped_column(String(64))
    initiated_by_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    contact_id: Mapped[UUID | None] = mapped_column(index=True)
    target_service_id: Mapped[UUID | None] = mapped_column(
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
    station_id: Mapped[UUID | None] = mapped_column(ForeignKey("telephony_stations.id"))
    audio_id: Mapped[UUID | None] = mapped_column(ForeignKey("speech_assets.id"))
    direction: Mapped[str] = mapped_column(
        String(16), default="outgoing", server_default="outgoing"
    )
    transport: Mapped[str] = mapped_column(String(16), default="manual", server_default="manual")
    provider: Mapped[str] = mapped_column(String(64), default="local", server_default="local")
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Frozen crew/voice binding and durable dialogue phase; never supplied by the student.
    dialogue: Mapped[dict | None] = mapped_column(JSONB)

    @property
    def provider_confirmed(self) -> bool:
        return self.provider_call_id is not None


class TelephonyStation(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "telephony_stations"
    __table_args__ = (
        UniqueConstraint("provider", "endpoint"),
        CheckConstraint("mode IN ('external', 'browser', 'phone')", name="mode"),
        CheckConstraint("endpoint ~ '^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$'", name="endpoint"),
    )
    name: Mapped[str] = mapped_column(String(255))
    mode: Mapped[str] = mapped_column(String(16))
    provider: Mapped[str] = mapped_column(String(64))
    endpoint: Mapped[str] = mapped_column(String(64))
    # Recoverable SIP credentials are never returned in station lists or event payloads.
    sip_password: Mapped[str] = mapped_column(String(128))
    student_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), unique=True)
    attempt_id: Mapped[UUID | None] = mapped_column(ForeignKey("attempts.id"), unique=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    provisioned: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    error: Mapped[str | None] = mapped_column(String(255))


class SpeechAsset(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "speech_assets"
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True)
    text: Mapped[str] = mapped_column(Text)
    voice: Mapped[str] = mapped_column(String(100))
    generator_version: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(16), default="queued")
    file_key: Mapped[str | None] = mapped_column(String(64))
    duration_seconds: Mapped[float | None] = mapped_column()
    lease_token: Mapped[UUID | None] = mapped_column()
    leased_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    error: Mapped[str | None] = mapped_column(String(255))


class CallCue(UUIDPrimaryKey, Base):
    __tablename__ = "call_cues"
    __table_args__ = (UniqueConstraint("scenario_card_id", "contact_key"),)
    scenario_card_id: Mapped[UUID] = mapped_column(
        ForeignKey("scenario_cards.id", ondelete="CASCADE")
    )
    contact_key: Mapped[str] = mapped_column(String(100))
    contact_name: Mapped[str] = mapped_column(String(255))
    audio_id: Mapped[UUID] = mapped_column(ForeignKey("speech_assets.id"))


class TelephonyEvent(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "telephony_events"
    __table_args__ = (UniqueConstraint("provider", "event_id"),)
    call_id: Mapped[UUID] = mapped_column(ForeignKey("training_calls.id"), index=True)
    provider: Mapped[str] = mapped_column(String(64))
    event_id: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(32))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
