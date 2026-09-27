"""Recordings are alternatives for the same facts, not alternative answer keys."""

from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.catalog_document import StrictModel


class CrewVoice(StrictModel):
    greeting_id: UUID
    acknowledgment_id: UUID


class CardAudio(StrictModel):
    caller_ids: list[UUID] = Field(default_factory=list, max_length=10)
    crew_variants: list[CrewVoice] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def unique_variants(self):
        pairs = [(v.greeting_id, v.acknowledgment_id) for v in self.crew_variants]
        if len(set(self.caller_ids)) != len(self.caller_ids) or len(set(pairs)) != len(pairs):
            raise ValueError("Варианты записей не должны повторяться")
        return self
