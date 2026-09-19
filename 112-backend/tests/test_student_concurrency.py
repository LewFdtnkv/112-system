import asyncio
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from test_teacher_concurrency import concurrent_teaching as concurrent_teaching

from app.models import Assignment, Attempt, AttemptEvent, ServiceResponse
from app.schemas.audit import ObservationBatch
from app.schemas.student import CardSubmit, DraftSave
from app.services.attempt_audit import record_observations
from app.services.lessons import start_lesson
from app.services.student import save_card, start_attempt, submit_card

pytestmark = pytest.mark.anyio


async def test_concurrent_start_edit_and_submit(concurrent_teaching):
    d = concurrent_teaching
    async with d.factory() as session:
        lesson, _ = await start_lesson(session, d.teacher_id, d.payload)
        assignment = await session.scalar(
            select(Assignment).where(Assignment.lesson_id == lesson.id)
        )
        assignment_id = assignment.id

    async def start():
        async with d.factory() as session:
            return await start_attempt(session, assignment_id, d.student_id)

    results = await asyncio.wait_for(asyncio.gather(start(), start()), timeout=10)
    assert sorted(created for _, created in results) == [False, True]
    attempt = results[0][0]
    assert attempt.id == results[1][0].id

    async def edit(description):
        async with d.factory() as session:
            try:
                row = await save_card(
                    session,
                    attempt.id,
                    d.student_id,
                    DraftSave(
                        revision=1,
                        classifier_entry_id=d.entry_id,
                        data={"address_text": "Test address", "description": description},
                    ),
                )
                return 200, row.card.revision
            except HTTPException as exc:
                return exc.status_code, None

    edited = await asyncio.wait_for(asyncio.gather(edit("First"), edit("Second")), timeout=10)
    assert sorted(status for status, _ in edited) == [200, 409]
    revision = next(revision for status, revision in edited if status == 200)

    async def submit():
        async with d.factory() as session:
            return await submit_card(
                session, attempt.id, d.student_id, CardSubmit(revision=revision)
            )

    async def observe():
        async with d.factory() as session:
            return await record_observations(
                session,
                attempt.id,
                d.student_id,
                ObservationBatch(
                    events=[
                        {
                            "command_id": uuid4(),
                            "kind": "ui.card_closed",
                            "client_occurred_at": datetime.now(UTC),
                        }
                    ]
                ),
            )

    concurrent = await asyncio.wait_for(
        asyncio.gather(submit(), observe(), submit(), observe()), timeout=10
    )
    results = [concurrent[0], concurrent[2]]
    assert all(row.status == "completed" for row in results)
    async with d.factory() as session:
        for model in (Attempt, ServiceResponse):
            query = select(func.count()).select_from(model)
            query = (
                query.where(model.id == attempt.id)
                if model is Attempt
                else query.where(model.attempt_id == attempt.id)
            )
            assert await session.scalar(query) == 1
        assert (
            await session.scalar(
                select(func.count())
                .select_from(AttemptEvent)
                .where(
                    AttemptEvent.attempt_id == attempt.id,
                )
            )
            == 6
        )

        sequences = list(
            await session.scalars(
                select(AttemptEvent.sequence)
                .where(AttemptEvent.attempt_id == attempt.id)
                .order_by(AttemptEvent.sequence)
            )
        )
        assert sequences == list(range(1, 7))
