from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.catalog_document import StrictModel


class SpeechCreate(StrictModel):
    request_id: UUID
    title: str = Field(min_length=1, max_length=200)
    voice: Literal["denis", "dmitri", "irina", "ruslan"]
    kind: Literal["caller", "crew"]
    text: str = Field(default="", max_length=1000)
    greeting: str = Field(default="", max_length=200)
    acknowledgment: str = Field(default="", max_length=200)

    @model_validator(mode="after")
    def content(self):
        for key in ("title", "text", "greeting", "acknowledgment"):
            setattr(self, key, getattr(self, key).strip())
        if not self.title:
            raise ValueError("Укажите название записи")
        if self.kind == "caller":
            if not self.text or self.greeting or self.acknowledgment:
                raise ValueError("Для заявителя укажите только текст сообщения")
        elif not self.greeting or not self.acknowledgment or self.text:
            raise ValueError("Для бригады укажите приветствие и подтверждение")
        return self
