from fastapi import APIRouter, HTTPException, status

from app.schemas.address import AddressSearch, AddressSearchResult, ReverseAddressSearch
from app.services import dadata

router = APIRouter(prefix="/addresses", tags=["address search"])


@router.post("/suggest", response_model=AddressSearchResult)
async def suggest_address(payload: AddressSearch) -> AddressSearchResult:
    try:
        return AddressSearchResult(items=await dadata.suggest(payload.query, payload.count))
    except dadata.DadataUnavailableError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Address search is temporarily unavailable",
        ) from error


@router.post("/reverse", response_model=AddressSearchResult)
async def reverse_address(payload: ReverseAddressSearch) -> AddressSearchResult:
    try:
        return AddressSearchResult(
            items=await dadata.reverse(payload, payload.count),
        )
    except dadata.DadataUnavailableError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Address search is temporarily unavailable",
        ) from error
