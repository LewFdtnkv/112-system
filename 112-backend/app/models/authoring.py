"""Teacher-authored card library and ordered, immutable scenario composition."""

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
from app.models.common import CreatedAt, UUIDPrimaryKey


class CardTemplate(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "card_templates"
    __table_args__ = (
        CheckConstraint("revision > 0", name="positive_revision"),
        ForeignKeyConstraint(
            ["classifier_entry_id", "classifier_version_id"],
            ["classifier_entries.id", "classifier_entries.classifier_version_id"],
            ondelete="RESTRICT",
        ),
    )

    created_by_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    title: Mapped[str] = mapped_column(String(255))
    classifier_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("classifier_versions.id", ondelete="RESTRICT"), index=True
    )
    classifier_entry_id: Mapped[UUID | None] = mapped_column(index=True)
    caller_message: Mapped[str | None] = mapped_column(Text)
    instructions: Mapped[str] = mapped_column(Text, default="", server_default="")
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)
    revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CardTemplateRecipient(Base):
    __tablename__ = "card_template_recipients"

    card_template_id: Mapped[UUID] = mapped_column(
        ForeignKey("card_templates.id", ondelete="RESTRICT"), primary_key=True
    )
    service_id: Mapped[UUID] = mapped_column(
        ForeignKey("services.id", ondelete="RESTRICT"), primary_key=True, index=True
    )


class ScenarioCard(UUIDPrimaryKey, Base):
    __tablename__ = "scenario_cards"
    __table_args__ = (
        UniqueConstraint("scenario_version_id", "position"),
        UniqueConstraint("id", "scenario_version_id"),
        CheckConstraint("position > 0", name="positive_position"),
    )

    scenario_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("scenario_versions.id", ondelete="RESTRICT")
    )
    card_template_id: Mapped[UUID] = mapped_column(
        ForeignKey("card_templates.id", ondelete="RESTRICT"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    # Frozen at scenario creation, including recipient names, fields, source text and instructions.
    # For operator_112 the data is a hidden expected answer, not a prefilled student card.
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB)
