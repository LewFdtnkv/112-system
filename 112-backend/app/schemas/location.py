from pydantic import BaseModel, ConfigDict, Field


class MapPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False, strict=True)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False, strict=True)


def validate_location(value):
    if value.get("location") is not None:
        value = {**value, "location": MapPoint.model_validate(value["location"]).model_dump()}
    return value
