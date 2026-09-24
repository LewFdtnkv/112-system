"""Versioned methodological advice, separate from answer-assessment examples."""

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LearningGuide(Base):
    __tablename__ = "learning_guides"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    version: Mapped[str] = mapped_column(String(40))
    skill: Mapped[str] = mapped_column(String(40), index=True)
    strategy: Mapped[str] = mapped_column(String(40))
    text: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1024))
    embedding_model: Mapped[str | None] = mapped_column(String(255))
