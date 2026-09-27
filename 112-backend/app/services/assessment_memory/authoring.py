"""Standalone teacher examples use the same scoped retrieval as corrections of real works."""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.models import AssessmentExample
from app.schemas.assessment_memory import MEMORY_CRITERIA
from app.services.assessment_memory.catalog import item
from app.services.assessment_memory.retrieval import POLICY_VERSION, search_text


async def create(session, teacher_id, payload):
    key = f"manual:{teacher_id}:{payload.request_id}"
    kind = MEMORY_CRITERIA[payload.criterion_code][1]
    values = {
        "criterion_code": payload.criterion_code,
        "situation": payload.condition,
        "answer": payload.answer,
        "verdict": payload.verdict,
        "reason": payload.reason,
    }
    await session.execute(
        insert(AssessmentExample)
        .values(
            source_key=key,
            created_by_id=teacher_id,
            kind=kind,
            role="dds" if kind == "dds" else "operator_112",
            policy_version=POLICY_VERSION,
            reference="",
            search_text=search_text(values, payload.reason),
            active=True,
            **values,
        )
        .on_conflict_do_nothing(index_elements=[AssessmentExample.source_key])
    )
    row = await session.scalar(select(AssessmentExample).where(AssessmentExample.source_key == key))
    if any(getattr(row, name) != value for name, value in values.items()):
        raise HTTPException(
            409, "Запрос уже использован для другого разбора. Откройте форму заново."
        )
    await session.commit()
    return item(row)
