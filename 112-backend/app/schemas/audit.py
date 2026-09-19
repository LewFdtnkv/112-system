import json
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, JsonValue, model_validator


class ClientObservation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    command_id: UUID
    kind: Literal["ui.card_opened", "ui.card_closed", "ui.field_changed"]
    client_occurred_at: AwareDatetime
    field: str | None = Field(
        default=None,
        max_length=100,
        pattern=r"^(categoryId|callerName|description|operatorAction|victimsCount|address\.(country|region|locality|object|district|area|street|house|building|structure|apartment|entrance|floor|doorCode|description)|phones\.(callerId|provided|onSite)|details\.(buildingFloors|classificationDescription|callerStatus|callerGender|callerAge|foreignLanguage|refusedAmbulance|blocked))$",
    )
    value: JsonValue = None

    @model_validator(mode="after")
    def bounded_observation(self):
        if self.kind == "ui.field_changed" and self.field is None:
            raise ValueError("Field change requires a field path")
        if self.kind != "ui.field_changed" and (self.field is not None or self.value is not None):
            raise ValueError("Navigation observations have no field value")
        if (
            isinstance(self.value, (dict, list))
            or len(json.dumps(self.value, ensure_ascii=False)) > 12000
        ):
            raise ValueError("Observation must contain one bounded scalar value")
        return self


class ObservationBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    events: list[ClientObservation] = Field(min_length=1, max_length=20)


class AuditEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    attempt_id: UUID
    sequence: int
    kind: str
    actor: str
    actor_id: UUID | None
    occurred_at: datetime
    client_occurred_at: datetime | None
    payload: dict[str, JsonValue]


class AuditPage(BaseModel):
    items: list[AuditEventRead]
    next_sequence: int | None
    last_sequence: int
