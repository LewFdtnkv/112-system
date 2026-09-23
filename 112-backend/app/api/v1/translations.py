from fastapi import APIRouter, HTTPException, status

from app.schemas.translation import TranslationRequest, TranslationResult
from app.services import yandex_translate

router = APIRouter(prefix="/translations", tags=["translations"])


@router.post("/translate", response_model=TranslationResult)
async def translate_text(payload: TranslationRequest) -> TranslationResult:
    try:
        return await yandex_translate.translate(
            payload.text,
            payload.target_language_code,
        )
    except yandex_translate.TranslationUnavailableError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Translation is temporarily unavailable",
        ) from error
