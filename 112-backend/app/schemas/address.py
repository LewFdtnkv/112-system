from pydantic import BaseModel, ConfigDict, Field

from app.schemas.location import MapPoint


class AddressSearch(BaseModel):
    query: str = Field(min_length=2, max_length=300)
    count: int = Field(default=5, ge=1, le=10)


class ReverseAddressSearch(MapPoint):
    count: int = Field(default=1, ge=1, le=5)


class GeocodedAddress(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    point: MapPoint
    address_line: str = Field(serialization_alias="addressLine")
    country: str
    administrative_areas: list[str] = Field(serialization_alias="administrativeAreas")
    localities: list[str]
    district: str
    area: str
    street: str
    house: str
    building: str
    structure: str
    apartment: str


class AddressSearchResult(BaseModel):
    items: list[GeocodedAddress]
