"""Safe public failure policies; raw exception strings never enter job diagnostics."""

import urllib.error

from pydantic import ValidationError

from app.services.dds_generation.inference import DDSGenerationFailure
from app.services.semantic_assessment.recovery import AssessmentFailure


def public_error(error):
    if isinstance(error, urllib.error.HTTPError) and error.code == 404:
        return "Модель не загружена. Администратору нужно выполнить команду загрузки из инструкции."
    if isinstance(error, (urllib.error.URLError, TimeoutError, OSError)):
        return "ЛЛМ недоступна или превысила время ожидания. Проверьте сервис llm."
    if isinstance(error, (ValidationError, ValueError, KeyError)):
        return "Не удалось получить корректную карточку от модели. Повторите генерацию."
    return "Не удалось сохранить карточку. Проверьте доступность ЕКП, служб и учётной записи."


def dds_terminal(error):
    return isinstance(error, DDSGenerationFailure) or getattr(error, "status_code", None) in (
        404,
        409,
        422,
    )


def assessment_context(error):
    return (
        {"assessment_checkpoint": error.checkpoint} if isinstance(error, AssessmentFailure) else {}
    )
