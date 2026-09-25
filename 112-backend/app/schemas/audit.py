import json
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, JsonValue, model_validator

from app.schemas.numbers import SafeJsonValue


class ClientObservation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    command_id: UUID
    kind: Literal[
        "ui.card_opened", "ui.card_closed", "ui.field_changed", "ui.delivery_gap", "ui.hint_seen"
    ]
    client_occurred_at: AwareDatetime
    field: str | None = Field(
        default=None,
        max_length=100,
        pattern=r"^(ekpAnswers\.[a-z][a-z0-9_]{0,49}|location\.(latitude|longitude)|categoryId|callerName|description|operatorAction|victimsCount|address\.(country|region|locality|object|district|area|street|house|building|structure|apartment|entrance|floor|doorCode|description)|phones\.(callerId|provided|onSite)|details\.(buildingFloors|classificationDescription|callerStatus|callerGender|callerAge|foreignLanguage|hasVictims|noContact|callDropped|refusedAmbulance|blocked))$",
    )
    value: SafeJsonValue = None

    @model_validator(mode="after")
    def bounded_observation(self):
        if self.kind == "ui.field_changed" and self.field is None:
            raise ValueError("Field change requires a field path")
        if self.kind in {"ui.card_opened", "ui.card_closed"} and (
            self.field is not None or self.value is not None
        ):
            raise ValueError("Navigation observations have no field value")
        if self.kind == "ui.delivery_gap" and (
            self.field is not None or type(self.value) is not int or not 1 <= self.value <= 100000
        ):
            raise ValueError("Delivery gap requires a bounded number of lost observations")
        if self.kind == "ui.hint_seen":
            if self.field is not None or not isinstance(self.value, str):
                raise ValueError("Hint observation requires a hint request UUID")
            UUID(self.value)
        if (
            isinstance(self.value, dict)
            or isinstance(self.value, list)
            and (
                not (self.field or "").startswith("ekpAnswers.")
                or len(self.value) > 30
                or any(not isinstance(v, str) or len(v) > 200 for v in self.value)
            )
            or len(json.dumps(self.value, ensure_ascii=False)) > 12000
        ):
            raise ValueError("Observation must contain a bounded scalar or feature string list")
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
