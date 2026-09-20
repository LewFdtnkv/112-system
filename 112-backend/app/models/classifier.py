from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import CreatedAt, UUIDPrimaryKey, enum_column
from app.models.enums import PublicationStatus


class ClassifierVersion(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "classifier_versions"
    __table_args__ = (
        CheckConstraint("source_sha256 ~ '^[0-9a-f]{64}$'", name="source_checksum"),
        CheckConstraint(
            "status = 'draft' OR (approved_by_id IS NOT NULL AND approved_at IS NOT NULL)",
            name="publication_approval",
        ),
    )

    revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    label: Mapped[str] = mapped_column(String(100), unique=True)
    source_filename: Mapped[str] = mapped_column(String(255))
    source_storage_key: Mapped[str] = mapped_column(Text)
    source_sha256: Mapped[str] = mapped_column(String(64))
    status: Mapped[PublicationStatus] = mapped_column(
        enum_column(PublicationStatus, "classifier_publication"), default=PublicationStatus.DRAFT
    )
    import_report: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    approved_by_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ClassifierEntry(UUIDPrimaryKey, Base):
    __tablename__ = "classifier_entries"
    __table_args__ = (
        UniqueConstraint("classifier_version_id", "code"),
        UniqueConstraint("id", "classifier_version_id"),
        CheckConstraint("source_row > 0", name="positive_source_row"),
    )

    classifier_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("classifier_versions.id", ondelete="RESTRICT")
    )
    code: Mapped[str] = mapped_column(String(50))
    section: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(Text)
    response_scenario: Mapped[str | None] = mapped_column(Text)
    conditions: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    source_sheet: Mapped[str] = mapped_column(String(100))
    source_row: Mapped[int] = mapped_column(Integer)
    # Header-based values, formulas, comments, cell coordinates and unresolved mappings.
    source_data: Mapped[dict[str, Any]] = mapped_column(JSONB)


class ClassifierRoute(UUIDPrimaryKey, Base):
    __tablename__ = "classifier_routes"
    __table_args__ = (UniqueConstraint("entry_id", "service_id"),)

    entry_id: Mapped[UUID] = mapped_column(ForeignKey("classifier_entries.id", ondelete="RESTRICT"))
    service_id: Mapped[UUID] = mapped_column(
        ForeignKey("services.id", ondelete="RESTRICT"), index=True
    )
    service_name: Mapped[str] = mapped_column(String(255))
    is_main: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    conditions: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
