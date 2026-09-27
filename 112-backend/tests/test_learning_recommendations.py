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


@pytest.fixture
async def referral(evidence, db_session):
    from app.models import LearningReferral

    job = await ready_job(db_session, evidence.student_id)
    selected = next(
        m["id"] for m in job.context["materials"]["examples"] if m["strategy"] == "focused"
    )
    await finish(db_session, job.id, job.worker_id, {"selected_ids": [selected], "mode": "ai"})
    return await db_session.scalar(select(LearningReferral))


def test_referral_calendar_month():
    from datetime import UTC, datetime

    from app.services.learning_recommendations.referrals import next_month

    assert next_month(datetime(2028, 1, 31, 15, tzinfo=UTC)) == datetime(
        2028, 2, 29, 15, tzinfo=UTC
    )
    assert next_month(datetime(2026, 12, 31, tzinfo=UTC)) == datetime(2027, 1, 31, tzinfo=UTC)


async def test_referral_creates_personal_lesson_once(evidence, referral, db_client, db_session):
    from app.models import Assignment, Lesson, LessonExecution
    from app.services.learning_recommendations.referrals import next_month

    message = await db_session.get(TeachingMessage, referral.message_id)
    assert referral.expires_at == next_month(message.created_at)
    assert referral.learning["target_skills"] == ["address"]
    path = f"/api/v1/student/learning-referrals/{referral.id}/lesson"
    assert (await db_client.post(path)).status_code == 401
    first = await db_client.post(path, headers=evidence.headers)
    assert first.status_code == 200, first.text
    assert first.json()["created"] is True
    second = await db_client.post(path, headers=evidence.headers)
    assert second.json() == first.json() | {"created": False}
    lesson_id = UUID(first.json()["lesson_id"])
    lesson = await db_session.get(Lesson, lesson_id)
    assert lesson.teacher_id == evidence.teacher_id
    assert lesson.available_until is None  # Expiry limits issuance, not the created exercise.
    assert lesson.learning == referral.learning
    assert set(
        await db_session.scalars(
            select(Assignment.student_id).where(Assignment.lesson_id == lesson_id)
        )
    ) == {evidence.student_id}
    execution = await db_session.get(LessonExecution, (lesson_id, evidence.student_id))
    assert execution.started_at is None  # Creation must not start the student's timer.
    listed = (await db_client.get("/api/v1/student/messages", headers=evidence.headers)).json()
    published = listed["items"][0]["details"]["suggestions"][0]["referral"]
    assert published["status"] == "used" and published["lesson_id"] == str(lesson_id)
    workspace = await db_client.get(
        f"/api/v1/student/lessons/{lesson_id}", headers=evidence.headers
    )
    assert workspace.status_code == 200, workspace.text


@pytest.mark.parametrize(
    "reason,code", [("expired", 410), ("obsolete", 409), ("archived", 409), ("disbanded", 409)]
)
async def test_referral_rejects_unavailable_without_creating_lesson(
    reason, code, evidence, referral, db_client, db_session
):
    from datetime import UTC, datetime, timedelta

    from app.models import Lesson, Scenario, ScenarioVersion, TrainingGroup

    before = await db_session.scalar(select(func.count()).select_from(Lesson))
    if reason == "expired":
        referral.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    elif reason == "obsolete":
        m = await db_session.get(TeachingMessage, referral.message_id)
        m.details = m.details | {"obsolete": True}
    elif reason == "archived":
        v = await db_session.get(ScenarioVersion, referral.scenario_version_id)
        scenario = await db_session.get(Scenario, v.scenario_id)
        scenario.is_archived = True
    else:
        for g in await db_session.scalars(
            select(TrainingGroup).where(TrainingGroup.teacher_id == evidence.teacher_id)
        ):
            g.disbanded_at = datetime.now(UTC)
    await db_session.commit()
    response = await db_client.post(
        f"/api/v1/student/learning-referrals/{referral.id}/lesson", headers=evidence.headers
    )
    assert response.status_code == code, response.text
    assert response.json().get("message") or response.json().get("field_errors")
    assert await db_session.scalar(select(func.count()).select_from(Lesson)) == before
    assert referral.lesson_id is None


async def test_referral_is_not_a_general_student_assignment_permission(
    evidence, referral, db_client, db_session
):
    for role in ("student", "teacher", "admin"):
        user = User(
            username=f"referral-{role}",
            password_hash=hash_password("password-123"),
            must_change_password=False,
            is_teacher=role == "teacher",
            is_admin=role == "admin",
        )
        db_session.add(user)
        await db_session.commit()
        token = (
            await db_client.post(
                "/api/v1/auth/login", json={"username": user.username, "password": "password-123"}
            )
        ).json()["access_token"]
        response = await db_client.post(
            f"/api/v1/student/learning-referrals/{referral.id}/lesson",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == (404 if role == "student" else 403), response.text
    assert referral.lesson_id is None


async def test_existing_recommendations_backfill_without_renewal(evidence, referral, db_session):
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import delete

    from app.models import LearningReferral
    from scripts.backfill_learning_referrals import backfill

    original_expiry = referral.expires_at
    await db_session.execute(delete(LearningReferral))
    await db_session.commit()
    assert await backfill(db_session) == 1
    assert await backfill(db_session) == 0
    replaced = await db_session.scalar(select(LearningReferral))
    assert replaced.expires_at == original_expiry
    await db_session.execute(delete(LearningReferral))
    message = await db_session.get(TeachingMessage, referral.message_id)
    message.created_at = datetime.now(UTC) - timedelta(days=32)
    await db_session.commit()
    assert await backfill(db_session) == 0


async def test_no_referral_for_incompatible_skill(evidence, referral, db_session):
    from sqlalchemy import delete

    from app.models import LearningReferral
    from app.services.learning_recommendations.referrals import issue_referrals

    message = await db_session.get(TeachingMessage, referral.message_id)
    await db_session.execute(delete(LearningReferral))
    message.details = message.details | {"role": "dds"}
    assert (
        await issue_referrals(
            db_session,
            message,
            evidence.student_id,
            [{"skill": "address", "lesson_kind": "review"}],
        )
        == 0
    )


@pytest.mark.parametrize("skill,expected", [("dds_crews", 0), ("dds_response", 1)])
async def test_referral_preserves_dds_delivery_and_scope(
    evidence, referral, db_session, db_client, skill, expected
):
    from app.models import Assignment, LearningReferral, ScenarioCard
    from app.services.learning_recommendations.referrals import issue_referrals

    message = await db_session.get(TeachingMessage, referral.message_id)
    message.details = message.details | {
        "role": "dds",
        "sources": {},
        "skills": {skill: {"label": "Работа бригад"}},
    }
    assert (
        await issue_referrals(
            db_session, message, evidence.student_id, [{"skill": skill, "lesson_kind": "review"}]
        )
        == expected
    )
    if not expected:
        return  # Completed DDS examples already have crews: assignment-only work is unsuitable.
    await db_session.commit()
    dds_referral = await db_session.scalar(
        select(LearningReferral).where(LearningReferral.skill == skill)
    )
    response = await db_client.post(
        f"/api/v1/student/learning-referrals/{dds_referral.id}/lesson", headers=evidence.headers
    )
    assert response.status_code == 200, response.text
    assignments = list(
        await db_session.scalars(
            select(Assignment).where(Assignment.lesson_id == UUID(response.json()["lesson_id"]))
        )
    )
    assert assignments
    for assignment in assignments:
        card = await db_session.get(ScenarioCard, assignment.scenario_card_id)
        assert card.snapshot["dds_exercise"]
        assert assignment.settings["delivery"] == "dds-stream-v1"
        assert assignment.settings["arrival_offset_seconds"] == card.arrival_offset_seconds
        assert assignment.settings["learning"]["target_skills"] == [skill]


async def test_referrals_exclude_unfinished_and_future_lessons(evidence, db_session):
    from sqlalchemy import delete

    from app.services.learning_recommendations.referrals import candidate_scenarios

    assert await candidate_scenarios(db_session, evidence.student_id, "operator_112")
    # An assignment alone (including a future exam) is never sufficient permission.
    await db_session.execute(
        delete(LessonEvaluation).where(LessonEvaluation.student_id == evidence.student_id)
    )
    assert await candidate_scenarios(db_session, evidence.student_id, "operator_112") == []


async def test_referral_checks_teacher_override_before_background_invalidation(
    evidence, referral, db_session, db_client
):
    message = await db_session.get(TeachingMessage, referral.message_id)
    grade = await db_session.get(
        LessonEvaluation, UUID(next(iter(message.details["sources"].values())))
    )
    db_session.add(
        LessonEvaluation(
            lesson_id=grade.lesson_id,
            student_id=evidence.student_id,
            reviewer_id=evidence.teacher_id,
            request_id=uuid4(),
            revision=grade.revision + 1,
            supersedes_id=grade.id,
            score=100,
            max_score=100,
            comment="Проверено преподавателем",
        )
    )
    await db_session.commit()
    assert not message.details["obsolete"]
    response = await db_client.post(
        f"/api/v1/student/learning-referrals/{referral.id}/lesson", headers=evidence.headers
    )
    assert response.status_code == 409, response.text
    assert "пересмотрены" in response.json()["message"]
    assert referral.lesson_id is None
