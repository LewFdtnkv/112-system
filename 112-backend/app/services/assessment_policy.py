from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AnswerKey
from app.schemas.assessment import AssessmentPolicy


async def scenario_policy(session: AsyncSession, version_id) -> AssessmentPolicy:
    key = await session.get(AnswerKey, version_id)
    configured = next(
        (item for item in (key.rubric if key else []) if item.get("kind") == "assessment_policy"),
        None,
    )
    return (
        AssessmentPolicy.model_validate(configured["policy"]) if configured else AssessmentPolicy()
    )
