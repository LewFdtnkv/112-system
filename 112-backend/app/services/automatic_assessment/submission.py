"""Coordinate card assessment and optional lesson publication in the caller's transaction."""

from app.services.automatic_assessment.attempts import assess_attempt
from app.services.automatic_assessment.results import publish_lesson_result


async def assess_submission(session, attempt, lesson, card_read, *, publish=True):
    await assess_attempt(session, attempt, card_read)
    if publish:
        await publish_lesson_result(session, lesson, attempt.student_id)
