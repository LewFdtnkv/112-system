import asyncio

import httpx
from fastapi import HTTPException
from pydantic import SecretStr, ValidationError

from app.core.config import settings
from app.schemas.location_services import (
    AddressSearchResponse,
    GeocodedAddress,
    MapPoint,
    TranslationResponse,
)

DADATA_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs"
TRANSLATE_URL = "https://translate.api.cloud.yandex.net/translate/v2/translate"
ADDRESS_ERROR = "Address search is temporarily unavailable"
TRANSLATION_ERROR = "Translation is temporarily unavailable"


def api_key(value: SecretStr | None, detail: str) -> str:
    if value is None or not value.get_secret_value().strip():
        raise HTTPException(503, detail)
    return value.get_secret_value().strip()


async def post_json(client: httpx.AsyncClient, url: str, key: str, payload: dict, detail: str):
    # Fixed upstream URLs, no redirects/retries and no provider bodies or keys in errors.
    try:
        async with asyncio.timeout(settings.external_services_timeout_seconds):
            response = await client.post(url, headers={"Authorization": key}, json=payload)
            response.raise_for_status()
            result = response.json()
            if not isinstance(result, dict):
                raise ValueError("Invalid provider response")
            return result
    except (httpx.HTTPError, TimeoutError, ValueError):
        raise HTTPException(503, detail) from None


def address_item(suggestion: object) -> GeocodedAddress | None:
    if not isinstance(suggestion, dict) or not isinstance(suggestion.get("data"), dict):
        return None
    data = suggestion["data"]

    def value(key: str) -> str:
        raw = data.get(key)
        return raw.strip() if isinstance(raw, str) else ""

    # A result without coordinates cannot be selected by the map. Do not invent (0, 0).
    try:
        point = MapPoint(latitude=float(data["geo_lat"]), longitude=float(data["geo_lon"]))
    except (KeyError, TypeError, ValueError):
        return None
    line = suggestion.get("value")
    if not isinstance(line, str) or not line.strip():
        return None
    block = value("block")
    block_type = value("block_type").lower()
    structure = block if block_type in {"стр", "соор"} else ""
    return GeocodedAddress(
        point=point,
        addressLine=line.strip(),
        country=value("country"),
        administrativeAreas=[value("region_with_type")] if value("region_with_type") else [],
        localities=list(dict.fromkeys(filter(None, [value("city"), value("settlement")]))),
        district=value("city_area"),
        area=value("city_district") or value("area_with_type"),
        street=value("street_with_type"),
        house=value("house"),
        building=block if not structure else "",
        structure=structure,
        apartment=value("flat"),
    )


async def addresses(client: httpx.AsyncClient, operation: str, payload: dict):
    key = api_key(settings.dadata_api_key, ADDRESS_ERROR)
    result = await post_json(
        client, f"{DADATA_URL}/{operation}/address", f"Token {key}", payload, ADDRESS_ERROR
    )
    suggestions = result.get("suggestions")
    if not isinstance(suggestions, list):
        raise HTTPException(503, ADDRESS_ERROR)
    return AddressSearchResponse(
        items=[item for row in suggestions[: payload["count"]] if (item := address_item(row))]
    )


async def translate(client: httpx.AsyncClient, text: str) -> TranslationResponse:
    key = api_key(settings.yandex_translate_api_key, TRANSLATION_ERROR)
    result = await post_json(
        client,
        TRANSLATE_URL,
        f"Api-Key {key}",
        {"texts": [text], "targetLanguageCode": "ru", "format": "PLAIN_TEXT"},
        TRANSLATION_ERROR,
    )
    try:
        rows = result["translations"]
        if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
            raise ValueError("Invalid translations")
        return TranslationResponse(
            text=rows[0]["text"], detected_language_code=rows[0].get("detectedLanguageCode")
        )
    except (KeyError, TypeError, ValueError, ValidationError):
        raise HTTPException(503, TRANSLATION_ERROR) from None
