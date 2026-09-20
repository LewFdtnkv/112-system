"""Portable, bounded EKP interchange: service codes, never database UUIDs."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StringConstraints, model_validator

from app.schemas.catalog_admin import EntryPresentation, ServiceCreate
from app.schemas.group import Title

FeatureString = Annotated[
    str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=200)
]
FeatureAnswer = StrictBool | FeatureString | Annotated[list[FeatureString], Field(max_length=30)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FeatureDefinition(StrictModel):
    key: str = Field(pattern=r"^[a-z][a-z0-9_]{0,49}$")
    label: Title
    type: Literal["boolean", "array", "choice"] = "boolean"
    required: bool = True
    options: list[FeatureString] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def consistent(self):
        if len(self.options) != len(set(self.options)):
            raise ValueError("Feature options must be unique")
        if self.type == "boolean" and self.options:
            raise ValueError("Boolean features have no string options")
        if self.type == "choice" and not self.options:
            raise ValueError("Choice features require options")
        return self

    def accepts(self, value):
        if self.type == "boolean":
            return type(value) is bool
        if self.type == "choice":
            return isinstance(value, str) and value in self.options
        return (
            isinstance(value, list)
            and len(value) <= 30
            and all(isinstance(v, str) and bool(v.strip()) and len(v) <= 200 for v in value)
            and len(set(value)) == len(value)
            and (not self.options or set(value) <= set(self.options))
        )


class RouteDefinition(StrictModel):
    service_code: str = Field(pattern=r"^[a-z0-9_-]{1,50}$")
    is_main: bool = False
    when: dict[str, FeatureAnswer] = Field(default_factory=dict, max_length=30)


class EntryDefinition(EntryPresentation, StrictModel):
    code: str = Field(min_length=1, max_length=50, pattern=r"^\S+$")
    section: Title
    name: Title
    response_scenario: str | None = Field(default=None, max_length=10000)
    features: list[FeatureDefinition] = Field(default_factory=list, max_length=30)
    routes: list[RouteDefinition] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def consistent(self):
        definitions = {f.key: f for f in self.features}
        if len(definitions) != len(self.features):
            raise ValueError("Feature keys must not repeat")
        if len({r.service_code for r in self.routes}) != len(self.routes):
            raise ValueError("Service routes must not repeat")
        for route in self.routes:
            for key, value in route.when.items():
                if key not in definitions or not definitions[key].accepts(value):
                    raise ValueError(
                        "Route conditions must match declared feature types and options"
                    )
                if value == []:
                    raise ValueError("An array route condition must contain at least one option")
        if not self.notification_required and self.routes:
            raise ValueError("Non-notifying types cannot have service routes")
        if self.notification_required and not any(not r.when for r in self.routes):
            raise ValueError("At least one unconditional route is required")
        if sum(r.is_main for r in self.routes) > 1:
            raise ValueError("Only one main service is allowed")
        return self


class CatalogDocument(StrictModel):
    format: Literal["system112-ekp-v1"] = "system112-ekp-v1"
    label: str = Field(min_length=1, max_length=100, pattern=r"^\S(?:.*\S)?$")
    services: list[ServiceCreate] = Field(default_factory=list, max_length=100)
    entries: list[EntryDefinition] = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def consistent(self):
        codes = {s.code for s in self.services}
        if len(codes) != len(self.services) or len({e.code for e in self.entries}) != len(
            self.entries
        ):
            raise ValueError("Service and incident codes must be unique")
        if any(r.service_code not in codes for e in self.entries for r in e.routes):
            raise ValueError("Every route must reference a service from this file")
        return self


class EntryUpdate(StrictModel):
    expected_revision: int = Field(ge=1)
    entry: EntryDefinition


class CatalogClone(StrictModel):
    label: str = Field(min_length=1, max_length=100, pattern=r"^\S(?:.*\S)?$")


class RoutePreview(StrictModel):
    classifier_entry_id: UUID
    answers: dict[str, FeatureAnswer] = Field(default_factory=dict, max_length=30)
