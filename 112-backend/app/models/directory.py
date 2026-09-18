"""Versioned service profiles and synthetic directories visible to students."""

from datetime import datetime
from typing import Any
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
    true,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import CreatedAt, UUIDPrimaryKey, enum_column
from app.models.enums import PublicationStatus


class Service(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "services"

    code: Mapped[str] = mapped_column(String(50), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())


class UserService(CreatedAt, Base):
    __tablename__ = "user_services"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    service_id: Mapped[UUID] = mapped_column(
        ForeignKey("services.id", ondelete="RESTRICT"), primary_key=True, index=True
    )


class ServiceProfile(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "service_profiles"
    __table_args__ = (
        UniqueConstraint("service_id", "version"),
        CheckConstraint("version > 0", name="positive_version"),
        CheckConstraint(
            "status = 'draft' OR (approved_by_id IS NOT NULL AND approved_at IS NOT NULL)",
            name="publication_approval",
        ),
    )

    service_id: Mapped[UUID] = mapped_column(ForeignKey("services.id", ondelete="RESTRICT"))
    version: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(255))  # Historical display name.
    status: Mapped[PublicationStatus] = mapped_column(
        enum_column(PublicationStatus, "profile_publication"), default=PublicationStatus.DRAFT
    )
    responsibility: Mapped[str] = mapped_column(Text)
    rules: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    approved_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ServiceTerritory(UUIDPrimaryKey, Base):
    __tablename__ = "service_territories"
    __table_args__ = (
        UniqueConstraint("profile_id", "code"),
        UniqueConstraint("id", "profile_id"),
    )

    profile_id: Mapped[UUID] = mapped_column(ForeignKey("service_profiles.id", ondelete="RESTRICT"))
    code: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="", server_default="")


class ServiceObject(UUIDPrimaryKey, Base):
    __tablename__ = "service_objects"
    __table_args__ = (
        UniqueConstraint("profile_id", "code"),
        ForeignKeyConstraint(
            ["territory_id", "profile_id"],
            ["service_territories.id", "service_territories.profile_id"],
            ondelete="RESTRICT",
        ),
    )

    profile_id: Mapped[UUID] = mapped_column(ForeignKey("service_profiles.id", ondelete="RESTRICT"))
    territory_id: Mapped[UUID | None] = mapped_column(index=True)
    code: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(255))
    address: Mapped[str] = mapped_column(Text)
    responsibility: Mapped[str] = mapped_column(Text)


class TrainingContact(UUIDPrimaryKey, Base):
    __tablename__ = "training_contacts"
    __table_args__ = (
        UniqueConstraint("profile_id", "code"),
        UniqueConstraint("id", "target_service_id"),
        CheckConstraint(
            "endpoint_key ~ '^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$'", name="local_endpoint"
        ),
    )

    profile_id: Mapped[UUID] = mapped_column(ForeignKey("service_profiles.id", ondelete="RESTRICT"))
    target_service_id: Mapped[UUID] = mapped_column(
        ForeignKey("services.id", ondelete="RESTRICT"), index=True
    )
    code: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(255))
    position: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    # Logical allowlisted endpoint, resolved by a future local SIP adapter; never a PSTN number.
    endpoint_key: Mapped[str] = mapped_column(String(64))
