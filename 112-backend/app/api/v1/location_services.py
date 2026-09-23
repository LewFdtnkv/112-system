from collections.abc import AsyncIterator
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends

from app.core.config import settings
from app.schemas.location_services import (
    AddressQuery,
    AddressSearchResponse,
    ReverseAddressQuery,
    TranslationQuery,
    TranslationResponse,
)
from app.services.location_services import addresses, translate

router = APIRouter(tags=["address search and translation"])


async def external_client() -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(
        timeout=settings.external_services_timeout_seconds, follow_redirects=False
    ) as client:
        yield client


ExternalClient = Annotated[httpx.AsyncClient, Depends(external_client)]


@router.post("/addresses/suggest", response_model=AddressSearchResponse)
async def suggest_address(payload: AddressQuery, client: ExternalClient):
    return await addresses(client, "suggest", payload.model_dump())


@router.post("/addresses/reverse", response_model=AddressSearchResponse)
async def reverse_address(payload: ReverseAddressQuery, client: ExternalClient):
    return await addresses(
        client,
        "geolocate",
        {"lat": payload.latitude, "lon": payload.longitude, "count": payload.count},
    )


@router.post("/translations/translate", response_model=TranslationResponse)
async def translate_text(payload: TranslationQuery, client: ExternalClient):
    return await translate(client, payload.text)
