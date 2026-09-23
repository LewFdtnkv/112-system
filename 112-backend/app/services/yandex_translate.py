import httpx

from app.core.config import settings
from app.schemas.translation import TranslationResult

BASE_URL = "https://translate.api.cloud.yandex.net/translate/v2/translate"


class TranslationUnavailableError(Exception):
    pass


def _credentials() -> tuple[str, str]:
    if (
        settings.yandex_translate_api_key is None
        or not settings.yandex_translate_api_key.get_secret_value()
        or not settings.yandex_cloud_folder_id
    ):
        raise TranslationUnavailableError("Yandex Translate is not configured")
    return (
        settings.yandex_translate_api_key.get_secret_value(),
        settings.yandex_cloud_folder_id,
    )


async def translate(text: str, target_language_code: str) -> TranslationResult:
    api_key, folder_id = _credentials()
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.post(
                BASE_URL,
                headers={"Authorization": f"Api-Key {api_key}"},
                json={
                    "folderId": folder_id,
                    "texts": [text],
                    "targetLanguageCode": target_language_code,
                },
            )
        response.raise_for_status()
        body = response.json()
        translations = body.get("translations", []) if isinstance(body, dict) else []
        translation = translations[0] if translations else None
        if not isinstance(translation, dict) or not isinstance(translation.get("text"), str):
            raise TranslationUnavailableError("Yandex Translate returned an empty response")
    except httpx.HTTPError as error:
        raise TranslationUnavailableError("Yandex Translate request failed") from error

    detected = translation.get("detectedLanguageCode")
    return TranslationResult(
        text=translation["text"],
        detected_language_code=detected if isinstance(detected, str) else None,
    )
