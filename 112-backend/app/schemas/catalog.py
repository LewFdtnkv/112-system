from uuid import UUID

from pydantic import BaseModel, ConfigDict, JsonValue


class CatalogModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ClassifierRead(CatalogModel):
    id: UUID
    label: str


class ClassifierEntryRead(CatalogModel):
    id: UUID
    classifier_version_id: UUID
    code: str
    section: str
    name: str
    response_scenario: str | None
    conditions: dict[str, JsonValue]


class ClassifierRouteRead(CatalogModel):
    service_id: UUID
    service_name: str
    is_main: bool
    conditions: dict[str, JsonValue]


class ServiceRead(CatalogModel):
    id: UUID
    code: str
    name: str


class ServiceProfileRead(CatalogModel):
    id: UUID
    service_id: UUID
    version: int
    name: str
    responsibility: str
