import asyncio
import os
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import (
    AIJob,
    Assignment,
    Attempt,
    AttemptEvent,
    CardTemplate,
    ClassifierEntry,
    ClassifierRoute,
    ClassifierVersion,
    CriterionEvidence,
    CriterionResult,
    Evaluation,
    GroupMembership,
    IncidentCard,
    Lesson,
    LessonEvaluation,
    Scenario,
    ScenarioCard,
    ScenarioVersion,
    Service,
    ServiceResponse,
    TrainingGroup,
    User,
    UserActivity,
)
from app.models.enums import PublicationStatus, TrainingRole
from app.schemas.authoring import LessonStart
from app.schemas.user import UserCreate
from app.services.groups import add_student
from app.services.lessons import start_lesson
from app.services.users import create_user

pytestmark = pytest.mark.anyio


@pytest.fixture
async def concurrent_teaching():
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL must point to a migrated test PostgreSQL database")
    engine = create_async_engine(url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    rows = []
    group_ids = []
    try:
        async with factory() as session:

            async def add(model, **values):
                row = model(**values)
                session.add(row)
                await session.flush()
                rows.append((model, row.id))
                return row

            teacher = await add(
                User, username=f"teacher-{uuid4()}", password_hash="unused", is_teacher=True
            )
            student = await add(User, username=f"student-{uuid4()}", password_hash="unused")
            extra = await add(User, username=f"student-{uuid4()}", password_hash="unused")
            service = await add(Service, code=f"svc-{uuid4()}", name="Test service")
            approval = dict(
                status=PublicationStatus.PUBLISHED,
                approved_by_id=teacher.id,
                approved_at=datetime.now(UTC),
            )
            classifier = await add(
                ClassifierVersion,
                label=f"ekp-{uuid4()}",
                source_filename="test.xlsx",
                source_storage_key="test.xlsx",
                source_sha256="a" * 64,
                **approval,
            )
            entry = await add(
                ClassifierEntry,
                classifier_version_id=classifier.id,
                code="001",
                section="Test",
                name="Test",
                source_sheet="Test",
                source_row=2,
                source_data={},
            )
            template = await add(
                CardTemplate,
                created_by_id=teacher.id,
                title="Test",
                classifier_version_id=classifier.id,
                classifier_entry_id=entry.id,
                data={},
            )
            await add(
                ClassifierRoute, entry_id=entry.id, service_id=service.id, service_name=service.name
            )
            scenario = await add(Scenario, title="Test", created_by_id=teacher.id)
            version = await add(
                ScenarioVersion,
                scenario_id=scenario.id,
                version=1,
                title="Test",
                role=TrainingRole.OPERATOR_112,
                instructions="",
                classifier_version_id=classifier.id,
                **approval,
            )
            await add(
                ScenarioCard,
                scenario_version_id=version.id,
                card_template_id=template.id,
                position=1,
                snapshot={
                    "title": "Test",
                    "instructions": "Test",
                    "caller_message": "Test call",
                    "data": {},
                    "recipients": [{"service_id": str(service.id), "name": service.name}],
                },
            )
            for _ in range(2):
                group = await add(TrainingGroup, name="Test", teacher_id=teacher.id)
                group_ids.append(group.id)
                session.add(GroupMembership(group_id=group.id, user_id=student.id))
            await session.commit()
        payload = LessonStart(
            request_id=uuid4(), group_id=group_ids[0], scenario_version_id=version.id
        )
        yield SimpleNamespace(
            factory=factory,
            teacher_id=teacher.id,
            student_id=student.id,
            extra_id=extra.id,
            entry_id=entry.id,
            group_ids=group_ids,
            payload=payload,
        )
    finally:
        async with factory() as session:
            lesson_ids = select(Lesson.id).where(Lesson.group_id.in_(group_ids))
            await session.execute(
                delete(LessonEvaluation).where(LessonEvaluation.lesson_id.in_(lesson_ids))
            )
            assignment_ids = select(Assignment.id).where(Assignment.lesson_id.in_(lesson_ids))
            attempt_ids = select(Attempt.id).where(Attempt.assignment_id.in_(assignment_ids))
            for model in (
                CriterionEvidence,
                CriterionResult,
                Evaluation,
                AIJob,
                AttemptEvent,
                ServiceResponse,
                IncidentCard,
            ):
                await session.execute(delete(model).where(model.attempt_id.in_(attempt_ids)))
            await session.execute(delete(Attempt).where(Attempt.id.in_(attempt_ids)))
            await session.execute(delete(Assignment).where(Assignment.lesson_id.in_(lesson_ids)))
            await session.execute(delete(Lesson).where(Lesson.group_id.in_(group_ids)))
            for model, row_id in reversed(rows):
                await session.execute(delete(model).where(model.id == row_id))
            await session.commit()
        await engine.dispose()


@pytest.mark.parametrize("different_group", [False, True])
async def test_concurrent_start_is_idempotent(concurrent_teaching, different_group):
    d = concurrent_teaching

    async def launch(payload):
        async with d.factory() as session:
            try:
                result, created = await start_lesson(session, d.teacher_id, payload)
                return 201 if created else 200, result.id
            except HTTPException as exc:
                return exc.status_code, None

    second = (
        d.payload.model_copy(update={"group_id": d.group_ids[1]}) if different_group else d.payload
    )
    results = await asyncio.wait_for(asyncio.gather(launch(d.payload), launch(second)), timeout=10)
    assert sorted(status for status, _ in results) == (
        [201, 409] if different_group else [200, 201]
    )
    if not different_group:
        assert results[0][1] == results[1][1]
    async with d.factory() as session:
        assert (
            await session.scalar(
                select(func.count())
                .select_from(Lesson)
                .where(
                    Lesson.teacher_id == d.teacher_id,
                )
            )
            == 1
        )
        assert (
            await session.scalar(
                select(func.count())
                .select_from(Assignment)
                .where(
                    Assignment.student_id == d.student_id,
                )
            )
            == 1
        )


async def test_concurrent_group_add_and_launch_have_consistent_snapshot(concurrent_teaching):
    d = concurrent_teaching

    async def launch():
        async with d.factory() as session:
            return await start_lesson(session, d.teacher_id, d.payload)

    async def join():
        async with d.factory() as session:
            return await add_student(session, d.group_ids[0], d.extra_id, d.teacher_id)

    (lesson, _), _ = await asyncio.wait_for(asyncio.gather(launch(), join()), timeout=10)
    async with d.factory() as session:
        students = set(
            await session.scalars(
                select(Assignment.student_id).where(
                    Assignment.lesson_id == lesson.id,
                )
            )
        )
        assert students in ({d.student_id}, {d.student_id, d.extra_id})
        assert lesson.student_count == len(students)
        assert await session.get(GroupMembership, (d.group_ids[0], d.extra_id)) is not None


async def test_concurrent_duplicate_user_returns_conflict(concurrent_teaching):
    d = concurrent_teaching
    payload = UserCreate(username=f"new-{uuid4()}", initial_password="temporary-password-112")

    async def create():
        async with d.factory() as session:
            try:
                await create_user(session, payload)
                return 201
            except HTTPException as exc:
                return exc.status_code

    try:
        assert sorted(await asyncio.gather(create(), create())) == [201, 409]
    finally:
        async with d.factory() as session:
            await session.execute(
                delete(UserActivity).where(
                    UserActivity.user_id.in_(
                        select(User.id).where(User.username == payload.username)
                    )
                )
            )
            await session.execute(delete(User).where(User.username == payload.username))
            await session.commit()
