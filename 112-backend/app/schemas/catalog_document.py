"""Portable, bounded EKP interchange: service codes, never database UUIDs."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator

from app.schemas.catalog_admin import ServiceCreate
from app.schemas.group import Title


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FeatureDefinition(StrictModel):
    key: str = Field(pattern=r"^[a-z][a-z0-9_]{0,49}$")
    label: Title


class RouteDefinition(StrictModel):
    service_code: str = Field(pattern=r"^[a-z0-9_-]{1,50}$")
    is_main: bool = False
    when: dict[str, StrictBool] = Field(default_factory=dict, max_length=30)


class EntryDefinition(StrictModel):
    code: str = Field(min_length=1, max_length=50, pattern=r"^\S+$")
    section: Title
    name: Title
    response_scenario: str | None = Field(default=None, max_length=10000)
    features: list[FeatureDefinition] = Field(default_factory=list, max_length=30)
    routes: list[RouteDefinition] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def consistent(self):
        keys = {f.key for f in self.features}
        if len(keys) != len(self.features):
            raise ValueError("Feature keys must not repeat")
        if len({r.service_code for r in self.routes}) != len(self.routes):
            raise ValueError("Service routes must not repeat")
        if any(not set(r.when) <= keys for r in self.routes):
            raise ValueError("Route conditions must reference declared features")
        if not any(not r.when for r in self.routes):
            raise ValueError("At least one unconditional route is required")
        if sum(r.is_main for r in self.routes) > 1:
            raise ValueError("Only one main service is allowed")
        return self


class CatalogDocument(StrictModel):
    format: Literal["system112-ekp-v1"] = "system112-ekp-v1"
    label: str = Field(min_length=1, max_length=100, pattern=r"^\S(?:.*\S)?$")
    services: list[ServiceCreate] = Field(min_length=1, max_length=100)
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
    answers: dict[str, StrictBool] = Field(default_factory=dict, max_length=30)
