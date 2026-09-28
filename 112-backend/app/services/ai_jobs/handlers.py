"""One explicit registration per purpose; the queue does not implement domain publication."""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AIJob
from app.models.enums import AIPurpose
from app.services import group_reports
from app.services.ai_jobs.errors import assessment_context, dds_terminal, public_error
from app.services.assessment_memory import worker as memory_worker
from app.services.card_generation import PROMPT_VERSION
from app.services.dds_generation import PROMPT_VERSION as DDS_PROMPT
from app.services.dds_generation import examples as dds_examples
from app.services.dds_generation import inference as dds_inference
from app.services.dds_generation import jobs as dds_jobs
from app.services.generation import examples as generation_examples
from app.services.generation import llm, publication
from app.services.learning_recommendations import inference as recommendation_inference
from app.services.learning_recommendations import jobs as recommendation_jobs
from app.services.semantic_assessment import inference as assessment_inference
from app.services.semantic_assessment import jobs as assessment_jobs
from app.services.semantic_assessment.context import PROMPT_VERSION as ASSESSMENT_PROMPT


@dataclass(frozen=True)
class JobHandler:
    prompt_version: str
    prepare: Callable[[AIJob], Awaitable[None]]
    infer: Callable[[AIJob], tuple[Any, dict]]
    publish: Callable[[AsyncSession, UUID, str, Any, dict], Awaitable[bool]]
    version_error: str
    failure_message: Callable[[Exception], str]
    requires_owner: bool = False
    terminal_error: Callable[[Exception], bool] = lambda error: False
    failure_context: Callable[[Exception], dict] = lambda error: {}
    on_failed: Callable[[AsyncSession, UUID], Awaitable[None]] | None = None


GENERATION_VERSION_ERROR = "Формат генерации обновлён. Создайте новый пакет карточек."
ADVICE_VERSION_ERROR = "Версия рекомендаций обновлена; задача больше не поддерживается."


def advice_error(error):
    return "Не удалось подготовить рекомендацию по дальнейшему обучению."


HANDLERS = {
    AIPurpose.GENERATION: JobHandler(
        prompt_version=PROMPT_VERSION,
        prepare=lambda job: generation_examples.prepare(job),
        infer=lambda job: llm.compose(job),
        publish=lambda *args: publication.finish(*args),
        version_error=GENERATION_VERSION_ERROR,
        failure_message=public_error,
        requires_owner=True,
    ),
    AIPurpose.DDS_GENERATION: JobHandler(
        prompt_version=DDS_PROMPT,
        prepare=lambda job: dds_examples.prepare(job),
        infer=lambda job: dds_inference.compose(job),
        publish=lambda *args: dds_jobs.finish(*args),
        version_error=GENERATION_VERSION_ERROR,
        failure_message=lambda error: (
            "Упражнение ДДС не прошло проверку или не может быть сохранено. "
            "Карточка сохранена без изменений. Запустите новую генерацию в карточке."
        ),
        requires_owner=True,
        terminal_error=dds_terminal,
    ),
    AIPurpose.EVALUATION: JobHandler(
        prompt_version=ASSESSMENT_PROMPT,
        prepare=lambda job: memory_worker.prepare(job),
        infer=lambda job: (assessment_inference.evaluate(job), {}),
        publish=lambda session, job_id, token, value, metadata: assessment_jobs.finish(
            session, job_id, token, value
        ),
        version_error=(
            "Версия смысловой проверки не поддерживается этим воркером. "
            "Сохранена оценка по правилам."
        ),
        failure_message=lambda error: (
            "Смысловая проверка недоступна или ответ модели не прошёл проверку. "
            "Сохранена оценка по правилам."
        ),
        failure_context=assessment_context,
        on_failed=lambda session, job_id: assessment_jobs.publish_failed(session, job_id),
    ),
    AIPurpose.RECOMMENDATION: JobHandler(
        prompt_version=recommendation_inference.PROMPT_VERSION,
        prepare=lambda job: recommendation_jobs.prepare(job),
        infer=lambda job: (recommendation_inference.evaluate(job), {}),
        publish=lambda session, job_id, token, value, metadata: recommendation_jobs.finish(
            session, job_id, token, value
        ),
        version_error=ADVICE_VERSION_ERROR,
        failure_message=advice_error,
    ),
    AIPurpose.GROUP_RECOMMENDATION: JobHandler(
        prompt_version=group_reports.PROMPT_VERSION,
        prepare=lambda job: recommendation_jobs.prepare(job),
        infer=lambda job: (recommendation_inference.evaluate(job), {}),
        publish=lambda session, job_id, token, value, metadata: group_reports.finish(
            session, job_id, token, value
        ),
        version_error=ADVICE_VERSION_ERROR,
        failure_message=advice_error,
    ),
}


def handler_for(purpose: AIPurpose) -> JobHandler:
    # Never silently send an unknown purpose to the card generator.
    return HANDLERS[purpose]
