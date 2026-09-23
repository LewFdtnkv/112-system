from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from test_teacher_api import teaching as base_teaching

from app.models import AIJob, CardTemplate, CardTemplateRecipient, Service
from app.models.enums import JobStatus
from app.schemas.generation import GeneratedText
from app.services.card_generation import PROMPT_VERSION
from app.services.generation.narration import prompt
from app.services.generation_worker import claim, fail, finish, renew

pytestmark = pytest.mark.anyio


@pytest.fixture
async def teaching(db_session, db_client):
    t = await base_teaching.__wrapped__(db_session, db_client)
    t.entry.display_name = "ДТП"
    await db_session.commit()
    return t


TEXT = GeneratedText(
    title="Дерево во дворе",
    caller_message="Здравствуйте, во дворе упало дерево, нужна помощь службы.",
    description="Во дворе жилого дома упало дерево.",
)


def test_generated_text_rejects_foreign_script():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        GeneratedText.model_validate(
            TEXT.model_dump() | {"description": "Пожар начался 晚上 в жилом доме"}
        )


def payload(t, **parameters):
    return {
        "request_id": str(uuid4()),
        "count": 2,
        "parameters": {
            "classifier_version_id": str(t.classifier.id),
            "classifier_entry_id": str(t.entry.id),
            **parameters,
        },
    }


async def test_generation_resolves_facts_once_and_enforces_owner(teaching, db_client, db_session):
    t = teaching
    request = payload(t, gender="male", age=32, street="улица Ленина", house="7")
    jobs = await t.post("card-generations", request, expected=202)
    assert len(jobs) == 2
    assert jobs[0]["facts"]["Пол"] == "Мужской"
    assert jobs[0]["facts"]["Возраст"] == 32
    assert "улица Ленина, д. 7" in jobs[0]["address_text"]
    assert jobs[0]["services"] == [t.service.name]
    assert all(j["status"] == "queued" for j in jobs)
    repeated = await t.post("card-generations", request, expected=202)
    assert repeated == jobs
    await t.post("card-generations", request | {"count": 1}, expected=409)
    await t.post("card-generations", request, actor="student", expected=403)
    await t.post("card-generations", request, actor="admin", expected=403)
    other = await db_client.get("/api/v1/card-generations", headers=t.headers["other"])
    assert other.json()["total"] == 0
    await t.post(f"card-generations/{jobs[0]['id']}/retry", {}, actor="other", expected=404)
    assert await db_session.scalar(select(func.count()).select_from(CardTemplate)) == 0
    stored = await db_session.get(AIJob, UUID(jobs[0]["id"]))
    assert "Случайно" not in prompt(stored.input["narrative"], stored.input["facts"])
    assert "улица Ленина" not in prompt(stored.input["narrative"], stored.input["facts"])


async def test_generation_random_package_uses_one_version_and_distinct_seeds(teaching, db_session):
    t = teaching
    jobs = await t.post("card-generations", {"request_id": str(uuid4()), "count": 10}, expected=202)
    stored = list(
        await db_session.scalars(
            select(AIJob).where(AIJob.created_by_id == t.accounts["teacher"].id)
        )
    )
    assert len(stored) == 10
    assert len({j.input["card"]["classifier_version_id"] for j in stored}) == 1
    assert len({j.input["seed"] for j in stored}) == 10
    assert all(j["facts"]["Тип происшествия"] for j in jobs)


async def test_explicit_services_override_ekp_and_are_preserved_in_worker(teaching, db_session):
    t = teaching
    extra = await t.add(Service, code=f"other-{uuid4()}", name="Учебная служба 102")
    await db_session.commit()
    jobs = await t.post(
        "card-generations", payload(t, service_ids=[str(extra.id)]) | {"count": 1}, expected=202
    )
    assert jobs[0]["services"] == [extra.name]
    job = await claim(db_session)
    token, job_id = job.worker_id, job.id
    assert await finish(db_session, job_id, token, TEXT, {"model": "test"})
    await db_session.refresh(job)
    card = await db_session.get(CardTemplate, job.card_template_id)
    assert "улица" in card.caller_message
    assert card.data["caller_name"] in card.caller_message
    assert extra.name not in card.caller_message
    assert (
        await db_session.scalar(
            select(CardTemplateRecipient.service_id).where(
                CardTemplateRecipient.card_template_id == card.id
            )
        )
        == extra.id
    )
    assert not await finish(db_session, job_id, token, TEXT, {})
    assert await db_session.scalar(select(func.count()).select_from(CardTemplate)) == 1


async def test_generation_expired_lease_fences_old_worker_and_recovers(teaching, db_session):
    t = teaching
    await t.post("card-generations", payload(t) | {"count": 1}, expected=202)
    first = await claim(db_session)
    job_id, old_token = first.id, first.worker_id
    assert await claim(db_session) is None
    first = await db_session.get(AIJob, job_id)
    first.lease_expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()
    assert not await renew(db_session, job_id, old_token)
    next_job = await claim(db_session)
    token = next_job.worker_id
    assert token != old_token and next_job.retry_count == 2
    assert not await finish(db_session, job_id, old_token, TEXT, {})
    assert await renew(db_session, job_id, token)
    assert await finish(db_session, job_id, token, TEXT, {})


async def test_generation_retry_failure_and_pending_pagination(teaching, db_client, db_session):
    t = teaching
    jobs = await t.post("card-generations", payload(t) | {"count": 1}, expected=202)
    for index in range(3):
        job = await claim(db_session)
        job_id, token = job.id, job.worker_id
        await fail(db_session, job_id, token, ValueError("internal secret"))
        await db_session.refresh(job)
        assert job.retry_count == index + 1
        assert "internal secret" not in job.error
        if index < 2:
            assert job.status == JobStatus.QUEUED
            job.available_at = datetime.now(UTC) - timedelta(seconds=1)
            await db_session.commit()
    assert job.status == JobStatus.FAILED
    retried = await t.post(f"card-generations/{jobs[0]['id']}/retry", {}, expected=200)
    assert retried["attempts"] == 0 and retried["facts"] == jobs[0]["facts"]
    job = await claim(db_session)
    await finish(db_session, job.id, job.worker_id, TEXT, {})
    pending = await db_client.get(
        "/api/v1/card-generations?pending_only=true&offset=50", headers=t.headers["teacher"]
    )
    assert pending.json()["total"] == 0 and pending.json()["offset"] == 0
    await t.post(f"card-generations/{jobs[0]['id']}/retry", {}, expected=409)


async def test_generation_rejects_invalid_catalog_and_feature_values(teaching):
    t = teaching
    await t.post("card-generations", payload(t, classifier_entry_id=str(uuid4())), expected=422)
    await t.post("card-generations", payload(t, feature_answers={"missing": True}), expected=422)
    await t.post("card-generations", payload(t, service_ids=[str(uuid4())]), expected=422)
    await t.post("card-generations", payload(t) | {"count": 11}, expected=422)


async def test_generation_preserves_typed_features_and_optional_values(teaching, db_session):
    t = teaching
    t.entry.conditions = {
        "format": "typed-features-v1",
        "features": [
            {"key": "victims", "label": "Есть пострадавшие", "type": "boolean", "required": True},
            {"key": "place", "label": "Место", "type": "choice", "options": ["Двор", "Дорога"]},
            {
                "key": "objects",
                "label": "Объекты",
                "type": "array",
                "options": ["Автомобиль", "Дерево"],
                "required": False,
            },
        ],
    }
    await db_session.commit()
    answers = {"victims": False, "place": "Двор", "objects": ["Дерево"]}
    jobs = await t.post("card-generations", payload(t, feature_answers=answers), expected=202)
    for item in jobs:
        job = await db_session.get(AIJob, UUID(item["id"]))
        assert job.input["card"]["data"]["features"]["ekp"] == answers
    await t.post("card-generations", payload(t, feature_answers={"victims": "false"}), expected=422)


async def test_generation_claims_are_exclusive_across_connections():
    import asyncio
    import os

    from sqlalchemy import delete
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.models import User
    from app.models.enums import AIPurpose

    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Isolated PostgreSQL required")
    engine = create_async_engine(url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    owner_id = uuid4()
    ids = [uuid4(), uuid4()]
    try:
        async with factory() as session:
            session.add(
                User(
                    id=owner_id,
                    username=f"claim-{owner_id}",
                    password_hash="unused",
                    is_teacher=True,
                )
            )
            await session.flush()
            session.add_all(
                [
                    AIJob(
                        id=job_id,
                        purpose=AIPurpose.GENERATION,
                        created_by_id=owner_id,
                        idempotency_key=uuid4(),
                        prompt_version=PROMPT_VERSION,
                        input={},
                    )
                    for job_id in ids
                ]
            )
            await session.commit()

        async def take():
            async with factory() as session:
                job = await claim(session)
                return job.id if job else None

        first, second = await asyncio.gather(take(), take())
        assert {first, second} == set(ids)
        assert await take() is None
    finally:
        async with factory() as session:
            await session.execute(delete(AIJob).where(AIJob.id.in_(ids)))
            await session.execute(delete(User).where(User.id == owner_id))
            await session.commit()
        await engine.dispose()


async def test_old_pending_jobs_are_closed_without_running_old_generator(teaching, db_session):
    t = teaching
    jobs = await t.post("card-generations", payload(t) | {"count": 1}, expected=202)
    job = await db_session.get(AIJob, UUID(jobs[0]["id"]))
    job.prompt_version = "card-generation-v2"
    await db_session.commit()
    assert await claim(db_session) is None
    await db_session.refresh(job)
    assert job.status == JobStatus.FAILED and "новый пакет" in job.error
    await t.post(f"card-generations/{job.id}/retry", {}, expected=409)
