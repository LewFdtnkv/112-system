from fastapi import HTTPException
from sqlalchemy import select

from app.models import (
    ServiceResponse,
)
from app.services.student.access import owned_attempt


async def owned_dds(session, attempt_id, student_id):
    attempt, lesson = await owned_attempt(session, attempt_id, student_id, lock=True)
    if "dds_policy" not in attempt.settings_snapshot:
        raise HTTPException(409, "This command requires a DDS exercise")
    service_id = attempt.settings_snapshot["service_profile"]["service_id"]
    response = await session.scalar(
        select(ServiceResponse).where(
            ServiceResponse.attempt_id == attempt.id, ServiceResponse.service_id == service_id
        )
    )
    return attempt, lesson, response
