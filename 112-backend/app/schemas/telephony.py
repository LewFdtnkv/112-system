from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, Field, model_validator

from app.schemas.catalog_document import StrictModel


class StationCreate(StrictModel):
    name: str = Field(min_length=1, max_length=255)
    mode: Literal["external", "browser", "phone"]
    provider: str = Field(default="local", pattern=r"^[A-Za-z0-9_-]{1,64}$")
    endpoint: str = Field(pattern=r"^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$")
    student_id: UUID | None = None

    @model_validator(mode="after")
    def provider_mode(self):
        if (self.mode == "external") == (self.provider == "local"):
            raise ValueError("Use a named provider for external PBX, local for Asterisk")
        return self


class StationUpdate(StrictModel):
    student_id: UUID | None
    enabled: bool = True


class StationRead(StrictModel):
    id: UUID
    name: str
    mode: str
    provider: str
    endpoint: str
    student_id: UUID | None
    attempt_id: UUID | None
    enabled: bool
    provisioned: bool
    error: str | None


class CallStart(StrictModel):
    command_id: UUID
    cue_id: UUID
    crew_code: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{1,100}$")
    direction: Literal["incoming", "outgoing"] = "outgoing"
    transport: Literal["manual", "callback"] = "manual"


class CallRead(StrictModel):
    id: UUID
    attempt_id: UUID
    command_id: UUID
    station_id: UUID | None
    contact_name: str
    endpoint_key: str
    status: str
    direction: str
    transport: str
    started_at: datetime
    connected_at: datetime | None
    ended_at: datetime | None
    result: str | None
    cancel_requested: bool
    provider_confirmed: bool
    dialogue: dict | None = None


class AdapterEvent(StrictModel):
    event_id: str = Field(min_length=1, max_length=200)
    endpoint: str = Field(pattern=r"^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$")
    provider_call_id: str = Field(min_length=1, max_length=160)
    call_id: UUID | None = None
    attempt_id: UUID | None = None
    # For calls dialled on the physical phone without a preceding UI command.
    contact_key: str | None = Field(default=None, max_length=100)
    direction: Literal["incoming", "outgoing"] = "outgoing"
    kind: Literal["dialing", "connected", "ended", "busy", "no_answer", "failed"]
    occurred_at: AwareDatetime


class AudioUpdate(StrictModel):
    text: str = Field(min_length=1, max_length=20000)
    voice: str = Field(min_length=1, max_length=100)
    generator_version: str | None = Field(default=None, min_length=1, max_length=100)


class AudioFailure(StrictModel):
    lease_token: UUID
    error: str = Field(min_length=1, max_length=255)
