import re

import httpx

from app.core.config import settings
from app.schemas.address import GeocodedAddress
from app.schemas.location import MapPoint

BASE_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs"


class DadataUnavailableError(Exception):
    pass


def _configured_key() -> str:
    if settings.dadata_api_key is None:
        raise DadataUnavailableError("DaData API key is not configured")
    return settings.dadata_api_key.get_secret_value()


def _values(data: dict[str, object], *names: str) -> list[str]:
    return [str(data[name]) for name in names if data.get(name)]


def _building_parts(data: dict[str, object]) -> tuple[str, str]:
    """Разделяет Дома: «к 2 стр 3» на поля корпуса и строения."""
    source = " ".join(_values(data, "block_type", "block"))
    building = re.search(r"(?:корп(?:ус)?|к)\.?\s*([\w/-]+)", source, re.IGNORECASE)
    structure = re.search(
        r"(?:стр(?:оение)?|соор(?:ужение)?)\.?\s*([\w/-]+)",
        source,
        re.IGNORECASE,
    )
    return (
        building.group(1) if building else "",
        structure.group(1) if structure else "",
    )


def _address(item: dict[str, object]) -> GeocodedAddress | None:
    data = item.get("data")
    if not isinstance(data, dict):
        return None
    try:
        point = MapPoint(
            latitude=float(str(data["geo_lat"])),
            longitude=float(str(data["geo_lon"])),
        )
    except (KeyError, TypeError, ValueError):
        return None
    building, structure = _building_parts(data)
    return GeocodedAddress(
        point=point,
        address_line=str(item.get("value") or item.get("unrestricted_value") or ""),
        country=str(data.get("country") or ""),
        administrative_areas=_values(
            data,
            "region_with_type",
            "area_with_type",
            "city_district_with_type",
        ),
        localities=_values(data, "city_with_type", "settlement_with_type"),
        district=str(data.get("city_district_with_type") or ""),
        area=str(data.get("area_with_type") or ""),
        street=str(data.get("street_with_type") or ""),
        house=str(data.get("house") or ""),
        building=building,
        structure=structure,
        apartment=str(data.get("flat") or ""),
    )


async def _request(path: str, payload: dict[str, object]) -> list[GeocodedAddress]:
    headers = {"Authorization": f"Token {_configured_key()}"}
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.post(f"{BASE_URL}/{path}", headers=headers, json=payload)
        response.raise_for_status()
    except httpx.HTTPError as error:
        raise DadataUnavailableError("DaData request failed") from error
    body = response.json()
    suggestions = body.get("suggestions", []) if isinstance(body, dict) else []
    addresses = [_address(item) for item in suggestions if isinstance(item, dict)]
    return [address for address in addresses if address is not None]


async def suggest(query: str, count: int) -> list[GeocodedAddress]:
    return await _request("suggest/address", {"query": query, "count": count})


async def reverse(point: MapPoint, count: int) -> list[GeocodedAddress]:
    return await _request(
        "geolocate/address",
        {"lat": point.latitude, "lon": point.longitude, "count": count},
    )
