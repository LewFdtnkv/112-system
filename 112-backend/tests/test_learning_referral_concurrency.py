import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import delete, func, select
from test_teacher_concurrency import concurrent_teaching as concurrent_teaching

from app.models import AIJob, LearningReferral, Lesson, MessageRecipient, TeachingMessage
from app.services.learning_recommendations.referrals import create_lesson

pytestmark = pytest.mark.anyio


async def test_concurrent_referral_consumption_creates_one_lesson(concurrent_teaching):
    d = concurrent_teaching
    job_id, message_id, referral_id = uuid4(), uuid4(), uuid4()
    try:
        async with d.factory() as session:
            session.add(
                AIJob(
                    id=job_id,
                    student_id=d.student_id,
                    purpose="recommendation",
                    idempotency_key=uuid4(),
                    prompt_version="test",
                    input={},
                )
            )
            await session.flush()
            session.add(
                TeachingMessage(
                    id=message_id,
                    source="learning_advice",
                    ai_job_id=job_id,
                    text="Повторите ситуацию",
                    details={"role": "operator_112", "sources": {}},
                )
            )
            await session.flush()
            session.add(MessageRecipient(message_id=message_id, student_id=d.student_id))
            session.add(
                LearningReferral(
                    id=referral_id,
                    message_id=message_id,
                    student_id=d.student_id,
                    scenario_version_id=d.payload.scenario_version_id,
                    teacher_id=d.teacher_id,
                    skill="address",
                    title="Повторение",
                    learning={"kind": "practice"},
                    expires_at=datetime.now(UTC) + timedelta(days=1),
                )
            )
            await session.commit()

        async def create():
            async with d.factory() as session:
                return await create_lesson(session, referral_id, d.student_id)

        results = await asyncio.wait_for(asyncio.gather(create(), create()), timeout=10)
        assert results[0]["lesson_id"] == results[1]["lesson_id"]
        assert sorted(r["created"] for r in results) == [False, True]
        async with d.factory() as session:
            assert (
                await session.scalar(
                    select(func.count())
                    .select_from(Lesson)
                    .where(Lesson.start_request_id == referral_id)
                )
                == 1
            )
    finally:
        async with d.factory() as session:
            await session.execute(
                delete(LearningReferral).where(LearningReferral.id == referral_id)
            )
            await session.execute(
                delete(MessageRecipient).where(MessageRecipient.message_id == message_id)
            )
            await session.execute(delete(TeachingMessage).where(TeachingMessage.id == message_id))
            await session.execute(delete(AIJob).where(AIJob.id == job_id))
            await session.commit()
