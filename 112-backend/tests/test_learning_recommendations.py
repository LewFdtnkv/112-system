import json
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from test_semantic_assessment import fake_output

from app.core.security import hash_password
from app.models import AIJob, LearningGuide, LessonEvaluation, TeachingMessage, User
from app.models.enums import AIPurpose
from app.services.generation_worker import claim
from app.services.learning_recommendations.inference import evaluate, validate
from app.services.learning_recommendations.jobs import enqueue, finish, schedule
from app.services.learning_recommendations.materials import retrieve
from app.services.learning_recommendations.profile import aggregate, build_profile, credits_for
from app.services.semantic_assessment.jobs import finish as finish_assessment
from scripts.seed_demo import State
from scripts.seed_training import DatabaseGateway, populate_training
from scripts.source_catalog import load_catalog, populate_database

pytestmark = pytest.mark.anyio


def observations(values, assisted=False):
    return [
        {
            "lesson_id": str(i // 2),
            "assisted": assisted,
            "credits": {"address": credit, "classification": 1},
        }
        for i, credit in enumerate(values)
    ]


def test_skill_evidence_thresholds_and_trends():
    assert aggregate(observations([0, 0]))["candidates"] == []
    missing = observations([0, 0, 0])
    missing[-1]["credits"] = {}
    assert aggregate(missing)["candidates"] == []
    profile = aggregate(observations([1, 1, 1, 0, 0, 0]))
    assert profile["skills"]["address"]["signal"] == "regression"
    assert profile["skills"]["classification"]["signal"] == "ready"
    assert profile["candidates"] == ["address"]
    supported = aggregate(observations([1, 1, 1, 1], assisted=True))
    assert supported["skills"]["address"]["signal"] == "independent"
    assert supported["skills"]["address"]["errors"] == 0


def test_model_cannot_add_facts_or_choose_unsafe_methods():
    materials = [{"id": "address/focused", "skill": "address", "text": "Тренировка адреса"}]
    with pytest.raises(ValueError):
        validate({"selected_ids": ["invented"]}, materials)
    with pytest.raises(ValueError):
        validate({"selected_ids": ["address/focused"], "text": "Ученик списывал"}, materials)
    with pytest.raises(ValueError):
        validate({"selected_ids": ["address/focused", "address/focused"]}, materials)
    job = SimpleNamespace(
        input={"profile": aggregate(observations([0, 0, 1]))},
        context={"materials": {"examples": materials}},
        model_version="test",
    )
    result = evaluate(
        job, lambda _: {"done": True, "message": {"content": '{"selected_ids":["invented"]}'}}
    )
    assert result["mode"] == "methodical_fallback"
    assert result["selected_ids"] == ["address/focused"]


def test_unverified_text_and_extra_services_are_not_skill_evidence():
    criteria = [
        SimpleNamespace(
            criterion_snapshot={
                "fields": [
                    {"field": "recipients", "scored": True, "status": "mismatch"},
                    {"field": "address_text", "scored": True, "status": "matched"},
                    {"field": "description", "scored": True, "status": "matched"},
                    {"field": "address_details.house", "scored": True, "status": "matched"},
                ]
            }
        )
    ]
    semantic = SimpleNamespace(input={"criteria": [{"code": "additional_services"}]}, output=None)
    assert credits_for(None, criteria, semantic) == {"address": 1}
    semantic.output = {
        "findings": [
            {"code": "additional_services", "applied": True, "credit": 1},
            {"code": "description", "applied": False, "credit": 0},
        ]
    }
    assert credits_for(None, criteria, semantic) == {"address": 1, "notification": 1}


@pytest.fixture
async def evidence(db_client, db_session, tmp_path):
    catalog = await populate_database(db_session)
    admin = await db_session.scalar(select(User).where(User.is_admin.is_(True)))
    state = State(tmp_path / "study-test.json", "http://test", "advice")
    result = await populate_training(
        DatabaseGateway(db_session, admin),
        state,
        catalog["classifier_id"],
        load_catalog(),
        recommendation_cards=6,
    )
    student_id = UUID(state.data["ids"]["source-training-student"])
    teacher_id = UUID(state.data["ids"]["source-training-teacher"])
    # Structured skill exercises now also receive a semantic job. Recommendations
    # must wait for its terminal result; offline fixtures keep the formal field credit.
    while job := await claim(db_session):
        assert job.purpose == AIPurpose.EVALUATION
        assert await finish_assessment(db_session, job.id, job.worker_id, fake_output(job))
    pair = (
        await db_client.post(
            "/api/v1/auth/login",
            json={"username": "advice-student", "password": "advice-student-123"},
        )
    ).json()
    return SimpleNamespace(
        student_id=student_id,
        teacher_id=teacher_id,
        result=result,
        headers={"Authorization": f"Bearer {pair['access_token']}"},
    )


async def ready_job(session, student_id):
    # Keep this test's unrelated semantic examples out of the single shared queue.
    job = await enqueue(session, student_id, "operator_112")
    assert job is not None and job.purpose == AIPurpose.RECOMMENDATION
    await session.commit()
    for other in await session.scalars(select(AIJob).where(AIJob.id != job.id)):
        other.status = "failed"
    await session.commit()
    claimed = await claim(session)
    assert claimed.id == job.id
    claimed.context = {"materials": await retrieve(session, job.input["profile"], vectors=False)}
    await session.commit()
    return claimed


async def test_seed_profile_job_message_access_and_invalidation(evidence, db_session, db_client):
    e, session = evidence, db_session
    profile = await build_profile(session, e.student_id, "operator_112")
    assert profile["candidates"] == ["address"]
    assert profile["skills"]["address"]["cards"] == 6
    assert profile["skills"]["address"]["errors"] == 4
    assert len(profile["skills"]["address"]["recurring_fields"]) == 2
    assert all(f["cards"] == 4 for f in profile["skills"]["address"]["recurring_fields"])
    assert profile["skills"]["classification"]["signal"] == "ready"
    assert (await build_profile(session, e.student_id, "dds"))["candidates"] == []
    job = await ready_job(session, e.student_id)
    assert await session.scalar(select(func.count()).select_from(LearningGuide)) == 35
    selected = next(
        m["id"] for m in job.context["materials"]["examples"] if m["strategy"] == "focused"
    )
    output = evaluate(
        job,
        lambda body: {
            "done": True,
            "message": {"content": json.dumps({"selected_ids": [selected]})},
        },
    )
    assert output["mode"] == "ai"
    assert await finish(session, job.id, "stale-token", output) is False
    await session.refresh(job)
    assert await finish(session, job.id, job.worker_id, output)
    message = await session.scalar(
        select(TeachingMessage).where(TeachingMessage.ai_job_id == job.id)
    )
    assert "6 проверенных карточках" in message.text and "расхождениями — 4" in message.text
    assert message.teacher_id is None
    assert message.details["suggestions"][0]["lesson_id"] is not None
    listed = await db_client.get("/api/v1/student/messages", headers=e.headers)
    assert listed.status_code == 200
    assert listed.json()["items"][0]["source"] == "learning_advice"
    hidden = await db_client.get("/api/v1/student/messages?include_advice=false", headers=e.headers)
    assert hidden.json()["total"] == 0
    feedback = await db_client.post(
        f"/api/v1/student/messages/{message.id}/feedback?helpful=false", headers=e.headers
    )
    assert feedback.status_code == 204
    assert (await db_client.get("/api/v1/student/messages")).status_code == 401
    stranger = User(
        username="other-learner",
        password_hash=hash_password("other-learner-123"),
        must_change_password=False,
    )
    session.add(stranger)
    await session.commit()
    pair = (
        await db_client.post(
            "/api/v1/auth/login",
            json={
                "username": "other-learner",
                "password": "other-learner-123",
            },
        )
    ).json()
    stranger_headers = {"Authorization": f"Bearer {pair['access_token']}"}
    assert (await db_client.get("/api/v1/student/messages", headers=stranger_headers)).json()[
        "total"
    ] == 0
    for action in ("read", "feedback?helpful=true"):
        assert (
            await db_client.post(
                f"/api/v1/student/messages/{message.id}/{action}",
                headers=stranger_headers,
            )
        ).status_code == 404
    assert await enqueue(session, e.student_id, "operator_112") is None
    await schedule(session)
    assert await session.scalar(select(func.count()).select_from(TeachingMessage)) == 1
    grade = await session.scalar(
        select(LessonEvaluation)
        .where(LessonEvaluation.lesson_id == UUID(e.result["recommendations"]["lesson_ids"][0]))
        .order_by(LessonEvaluation.revision.desc())
        .limit(1)
    )
    session.add(
        LessonEvaluation(
            lesson_id=grade.lesson_id,
            student_id=e.student_id,
            reviewer_id=e.teacher_id,
            request_id=uuid4(),
            revision=grade.revision + 1,
            supersedes_id=grade.id,
            score=100,
            max_score=100,
            comment="Проверено преподавателем",
        )
    )
    await session.commit()
    await enqueue(session, e.student_id, "operator_112")
    await session.commit()
    await session.refresh(message)
    assert message.details["obsolete"] is True


async def test_late_job_cannot_publish_after_teacher_override(evidence, db_session):
    e, session = evidence, db_session
    job = await ready_job(session, e.student_id)
    grade = await session.scalar(
        select(LessonEvaluation)
        .where(LessonEvaluation.lesson_id == UUID(e.result["recommendations"]["lesson_ids"][0]))
        .order_by(LessonEvaluation.revision.desc())
        .limit(1)
    )
    session.add(
        LessonEvaluation(
            lesson_id=grade.lesson_id,
            student_id=e.student_id,
            reviewer_id=e.teacher_id,
            request_id=uuid4(),
            revision=grade.revision + 1,
            supersedes_id=grade.id,
            score=100,
            max_score=100,
            comment="Ручное решение",
        )
    )
    await session.commit()
    output = {"selected_ids": [job.context["materials"]["examples"][0]["id"]], "mode": "ai"}
    assert await finish(session, job.id, job.worker_id, output)
    assert await session.scalar(select(func.count()).select_from(TeachingMessage)) == 0
    assert job.output["publication"] == "superseded_or_unavailable"
