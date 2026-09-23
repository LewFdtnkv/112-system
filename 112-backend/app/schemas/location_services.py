from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


class AddressQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
    count: int = Field(default=5, ge=1, le=20, strict=True)


class MapPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False, strict=True)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False, strict=True)


class ReverseAddressQuery(MapPoint):
    count: int = Field(default=1, ge=1, le=20, strict=True)


class GeocodedAddress(BaseModel):
    point: MapPoint
    addressLine: str
    country: str = ""
    administrativeAreas: list[str] = Field(default_factory=list)
    localities: list[str] = Field(default_factory=list)
    district: str = ""
    area: str = ""
    street: str = ""
    house: str = ""
    building: str = ""
    structure: str = ""
    apartment: str = ""


class AddressSearchResponse(BaseModel):
    items: list[GeocodedAddress]


class TranslationQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]
    target_language_code: Literal["ru"] = "ru"


class TranslationResponse(BaseModel):
    text: str = Field(min_length=1, max_length=30000)
    detected_language_code: str | None = Field(default=None, max_length=16)
