from pydantic import BaseModel, Field


class TranslationRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    target_language_code: str = Field(default="ru", pattern=r"^[a-z]{2,3}$")


class TranslationResult(BaseModel):
    text: str
    detected_language_code: str | None = None
