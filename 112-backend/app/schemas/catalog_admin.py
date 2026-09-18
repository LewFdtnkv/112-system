from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import PublicationStatus
from app.schemas.group import Title


class ServiceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=50, pattern=r"^[a-z0-9_-]+$")
    name: Title


class EntryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=50, pattern=r"^\S+$")
    section: Title
    name: Title
    service_ids: list[UUID] = Field(min_length=1, max_length=100)

    @field_validator("service_ids")
    @classmethod
    def unique_services(cls, value):
        if len(value) != len(set(value)):
            raise ValueError("Services must not repeat")
        return value


class ClassifierCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1, max_length=100, pattern=r"^\S(?:.*\S)?$")
    source_filename: str = Field(min_length=1, max_length=255)
    entries: list[EntryCreate] = Field(min_length=1, max_length=2000)

    @field_validator("entries")
    @classmethod
    def unique_codes(cls, value):
        if len(value) != len({entry.code for entry in value}):
            raise ValueError("Incident codes must not repeat")
        return value


class ClassifierAdminRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    label: str
    status: PublicationStatus
    source_sha256: str
