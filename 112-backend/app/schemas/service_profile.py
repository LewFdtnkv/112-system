from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.catalog_document import StrictModel
from app.schemas.group import Title


class TerritoryInput(StrictModel):
    code: str = Field(min_length=1, max_length=100)
    name: Title
    description: str = Field(default="", max_length=5000)


class ObjectInput(StrictModel):
    code: str = Field(min_length=1, max_length=100)
    name: Title
    territory_code: str | None = None
    address: str = Field(min_length=1, max_length=2000)
    responsibility: str = Field(min_length=1, max_length=5000)


class ContactInput(TerritoryInput):
    target_service_id: UUID
    position: str | None = Field(default=None, max_length=255)
    endpoint_key: str = Field(pattern=r"^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$")


class ProfileInput(StrictModel):
    service_id: UUID
    name: Title
    responsibility: str = Field(min_length=1, max_length=10000)
    procedure: str = Field(default="", max_length=10000)
    territories: list[TerritoryInput] = Field(default_factory=list, max_length=100)
    objects: list[ObjectInput] = Field(default_factory=list, max_length=200)
    contacts: list[ContactInput] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def consistent(self):
        for rows in (self.territories, self.objects, self.contacts):
            if len({r.code for r in rows}) != len(rows):
                raise ValueError("Directory codes must not repeat")
        territories = {t.code for t in self.territories}
        if any(
            o.territory_code is not None and o.territory_code not in territories
            for o in self.objects
        ):
            raise ValueError("Object territory must belong to this profile")
        if not self.responsibility.strip():
            raise ValueError("Responsibility must not be blank")
        return self


class ProfileUpdate(ProfileInput):
    expected_revision: int = Field(ge=1)


class ProfileRead(ProfileInput):
    id: UUID
    version: int
    revision: int
    status: Literal["draft", "published", "archived"]
