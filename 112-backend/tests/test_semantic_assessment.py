from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from test_student_workflow import exercise as exercise
from test_teacher_api import teaching as teaching

from app.models import AIJob, Evaluation, LessonEvaluation
from app.models.enums import AIPurpose, EvaluationMethod, JobStatus
from app.schemas.semantic_assessment import SemanticDecision
from app.services.generation_worker import claim, fail, finish
from app.services.semantic_assessment.inference import evaluate
from app.services.semantic_assessment.recovery import AssessmentFailure
from app.services.semantic_assessment.results import card_score

pytestmark = pytest.mark.anyio


def model_job(answer="Человек без сознания, дышит.", kind="text"):
    return SimpleNamespace(
        model_version="fixture",
        input={
            "criteria": [
                {
                    "code": "description",
                    "label": "Описание",
                    "kind": kind,
                    "situation": "Мужчина без сознания, дыхание сохранено.",
                    "reference": "Без сознания, дышит.",
                    "answer": answer,
                }
            ],
            "submitted_facts": {},
        },
    )


def decision(**kwargs):
    return SemanticDecision(
        verdict="correct",
        confidence=0.96,
        reason="Сохранены потеря сознания и дыхание.",
        reference_quote="дыхание сохранено",
        answer_quote="дышит",
        recommendation="",
        **kwargs,
    )


def test_accepts_supported_agreement_but_not_forged_evidence_or_confidence_alone():
    accepted = evaluate(model_job(), lambda *args: (decision(), {}))
    assert accepted["findings"][0]["applied"]
    assert len(accepted["trace"]) == 2
    calls = iter([decision(), decision().model_copy(update={"verdict": "partial"})])
    disagreement = evaluate(model_job(), lambda *args: (next(calls), {}))
    assert not disagreement["findings"][0]["applied"]
    fake = decision().model_copy(update={"reference_quote": "Прибыл врач", "confidence": 1})
    assert not evaluate(model_job(), lambda *args: (fake, {}))["findings"][0]["applied"]
    low = decision().model_copy(update={"confidence": 0.7})
    assert not evaluate(model_job(), lambda *args: (low, {}))["findings"][0]["applied"]


def test_empty_text_and_unknown_service_competence_do_not_call_llm():
    def forbidden(*args):
        raise AssertionError("Should not invoke model")

    missing = evaluate(model_job(""), forbidden)["findings"][0]
    assert missing["credit"] == 0 and missing["applied"]
    job = model_job("Районная служба", "services")
    job.input["criteria"][0]["service_scope"] = {"Районная служба": ""}
    unknown = evaluate(job, forbidden)["findings"][0]
    assert unknown["credit"] is None and not unknown["applied"]


def test_hybrid_arithmetic_preserves_structured_errors_and_unresolved_weight():
    evaluation = SimpleNamespace(score=Decimal(50), max_score=Decimal(100), context_snapshot={})
    criteria = [
        SimpleNamespace(
            code="address",
            score=Decimal(50),
            max_score=Decimal(100),
            explanation="",
            criterion_snapshot={"fields": [{"field": "address_details.house"}]},
        )
    ]
    job = SimpleNamespace(
        status=JobStatus.SUCCEEDED,
        output={
            "findings": [
                {"code": "description", "applied": True, "credit": 1},
            ]
        },
    )
    score, maximum, _ = card_score(evaluation, criteria, job)
    assert (score, maximum) == (75, 125)  # 60%, the formal mistake remains.
    job.output["findings"].append({"code": "address_text", "applied": False, "credit": None})
    assert card_score(evaluation, criteria, job)[:2] == (50, 100)


def test_service_decision_restores_only_notification_weight():
    evaluation = SimpleNamespace(score=Decimal(30), max_score=Decimal(100))
    criteria = [
        SimpleNamespace(
            code=code,
            score=Decimal(score),
            max_score=Decimal(maximum),
            explanation="",
            criterion_snapshot={"fields": [{"field": field}]},
        )
        for code, score, maximum, field in [
            ("address", 30, 60, "address_details.house"),
            ("notification", 0, 40, "recipients"),
        ]
    ]
    job = SimpleNamespace(
        status=JobStatus.SUCCEEDED,
        output={
            "findings": [
                {
                    "code": "additional_services",
                    "applied": True,
                    "credit": 1,
                    "reason": "Помощь обоснована.",
                }
            ]
        },
    )
    score, maximum, breakdown = card_score(evaluation, criteria, job)
    assert (score, maximum) == (70, 100)
    assert sum(row["score"] for row in breakdown) == 70
    assert sum(row["max_score"] for row in breakdown) == 100


def fake_output(job, credit=1):
    return {
        "findings": [
            {
                "code": c["code"],
                "label": c["label"],
                "verdict": "correct" if credit == 1 else "incorrect",
                "credit": credit,
                "applied": True,
                "reason": "Проверено тестом.",
                "recommendation": "",
            }
            for c in job.input["criteria"]
        ],
        "trace": [],
    }


async def test_submit_enqueues_once_and_worker_publishes_new_revision(exercise, db_session):
    e = exercise
    first = await e.complete()
    await e.request(
        "POST", f"student/attempts/{first['id']}/submit", {"revision": first["card"]["revision"]}
    )
    for index in (1, 2):
        await e.complete(index)
    jobs = list(
        await db_session.scalars(select(AIJob).where(AIJob.purpose == AIPurpose.EVALUATION))
    )
    assert len(jobs) == 3
    assert all(j.input["context_hash"] and j.input["process"]["server_event_count"] for j in jobs)
    grade = await e.request("GET", f"student/lessons/{e.lesson['id']}/evaluation")
    assert grade["assessment_details"]["semantic"]["status"] == "pending"
    for index in range(3):
        job = await claim(db_session)
        assert await finish(db_session, job.id, job.worker_id, fake_output(job, 0), {})
        assert not await finish(db_session, job.id, "old-token", fake_output(job), {})
    grade = await e.request("GET", f"student/lessons/{e.lesson['id']}/evaluation")
    assert grade["method"] == "hybrid" and grade["revision"] == 2
    assert grade["score"] == "75.00"
    assert grade["assessment_details"]["semantic"]["status"] == "complete"
    work = await e.request(
        "GET",
        f"lessons/{e.lesson['id']}/students/{e.t.accounts['student'].id}/work",
        actor="teacher",
    )
    assert work["assignments"][0]["semantic_review"]["status"] == "succeeded"
    assert await db_session.scalar(
        select(Evaluation.id).where(Evaluation.method == EvaluationMethod.AI).limit(1)
    )


async def test_hybrid_keeps_unstarted_cards_at_zero(exercise, db_session):
    from app.models import Lesson
    from app.services.deadlines import enforce_deadlines

    e = exercise
    await e.complete()
    lesson = await db_session.get(Lesson, UUID(e.lesson["id"]))
    deadline = datetime.now(UTC) + timedelta(seconds=1)
    lesson.available_until = deadline
    await db_session.commit()
    await enforce_deadlines(db_session, lesson, deadline + timedelta(seconds=1))
    job = await claim(db_session)
    assert await finish(db_session, job.id, job.worker_id, fake_output(job), {})
    grade = await e.request("GET", f"student/lessons/{e.lesson['id']}/evaluation")
    assert grade["method"] == "hybrid" and grade["score"] == "33.33"
    assert grade["assessment_details"]["missed_cards"] == 2


async def test_late_model_cannot_overwrite_teacher_and_expired_lease_is_fenced(
    exercise, db_session
):
    e = exercise
    for index in range(3):
        await e.complete(index)
    path = f"lessons/{e.lesson['id']}/students/{e.t.accounts['student'].id}"
    await e.request(
        "POST",
        path + "/evaluations",
        {
            "request_id": str(uuid4()),
            "expected_revision": 1,
            "score": 73,
            "max_score": 100,
            "comment": "Решение преподавателя",
        },
        actor="teacher",
        status=201,
    )
    job = await claim(db_session)
    job.lease_expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()
    assert not await finish(db_session, job.id, job.worker_id, fake_output(job), {})
    for _ in range(3):
        job = await claim(db_session)
        assert await finish(db_session, job.id, job.worker_id, fake_output(job), {})
    latest = await db_session.scalar(
        select(LessonEvaluation)
        .where(LessonEvaluation.lesson_id == UUID(e.lesson["id"]))
        .order_by(LessonEvaluation.revision.desc())
        .limit(1)
    )
    assert latest.method == "teacher" and latest.score == 73 and latest.revision == 2


async def test_failed_jobs_reconcile_to_formal_grade_and_retry_is_authorized(exercise, db_session):
    from app.services.semantic_assessment.results import reconcile

    e = exercise
    attempts = [await e.complete(index) for index in range(3)]
    jobs = list(await db_session.scalars(select(AIJob)))
    for job in jobs:
        job.status = JobStatus.FAILED
        job.retry_count = 3
        job.error = "Сервис временно недоступен"
        job.prompt_version = "semantic-v2-rag"
    await db_session.commit()
    await reconcile(db_session)
    grade = await e.request("GET", f"student/lessons/{e.lesson['id']}/evaluation")
    assert grade["method"] == "rules" and grade["score"] == "100.00"
    assert grade["assessment_details"]["semantic"]["status"] == "unavailable"
    path = (
        f"lessons/{e.lesson['id']}/students/{e.t.accounts['student'].id}"
        f"/attempts/{attempts[0]['id']}/semantic-retry"
    )
    await e.request("POST", path, actor="student", status=403)
    await e.request("POST", path, actor="other", status=404)
    assert (await e.request("POST", path, actor="teacher"))["status"] == "queued"
    assert (await e.request("POST", path, actor="teacher"))["status"] == "queued"
    job = await claim(db_session)
    assert job is not None
    assert job.context["prompt_upgrade"]["from"] == "semantic-v2-rag"
    await finish(db_session, job.id, job.worker_id, fake_output(job, 0), {})
    updated = await e.request("GET", f"student/lessons/{e.lesson['id']}/evaluation")
    assert updated["revision"] == 3 and updated["method"] == "hybrid"
    assert updated["assessment_details"]["semantic"]["status"] == "partial"


async def test_failed_attempt_preserves_diagnostics_with_lease_fencing(exercise, db_session):
    await exercise.complete()
    job = await claim(db_session)
    checkpoint = {"signature": "test", "findings": [], "trace": []}
    error = AssessmentFailure(
        TimeoutError("http://private:password@model"),
        {"criterion": "description", "stage": "verification", "seconds": 300.1},
        checkpoint,
    )
    await fail(db_session, job.id, "expired-worker", error)
    await db_session.refresh(job)
    assert "inference_failures" not in job.context
    assert job.status == JobStatus.RUNNING
    await fail(db_session, job.id, job.worker_id, error)
    await db_session.refresh(job)
    assert job.status == JobStatus.QUEUED and job.output is None
    assert job.context["assessment_checkpoint"] == checkpoint
    diagnostic = job.context["inference_failures"][0]
    assert diagnostic["attempt"] == 1
    assert diagnostic["category"] == "timeout"
    assert diagnostic["criterion"] == "description"
    assert "password" not in str(job.context)


async def test_additional_services_never_hide_a_missing_required_service(exercise, db_session):
    from app.services.semantic_assessment.context import build_context

    e = exercise
    first = await e.complete()
    original = await db_session.scalar(
        select(Evaluation).where(
            Evaluation.attempt_id == UUID(first["id"]), Evaluation.method == EvaluationMethod.RULES
        )
    )
    extra = {"service_id": str(uuid4()), "name": "Дополнительная служба"}
    snapshot = original.context_snapshot | {"notified_services": [extra]}
    obj = SimpleNamespace(id=original.id, attempt_id=original.attempt_id, context_snapshot=snapshot)
    context = await build_context(db_session, obj, SimpleNamespace(fields=[]))
    assert not any(c["kind"] == "services" for c in context["criteria"])
    snapshot["notified_services"] = original.context_snapshot["notified_services"] + [extra]
    context = await build_context(db_session, obj, SimpleNamespace(fields=[]))
    services = next(c for c in context["criteria"] if c["kind"] == "services")
    assert services["service_scope"] == {"Дополнительная служба": ""}


async def test_dds_optional_comments_and_skill_scope(exercise, db_session):
    from app.services.semantic_assessment.context import build_context

    first = await exercise.complete()
    original = await db_session.scalar(
        select(Evaluation).where(
            Evaluation.attempt_id == UUID(first["id"]), Evaluation.method == EvaluationMethod.RULES
        )
    )
    snapshot = original.context_snapshot | {
        "dds": {"crews": [{"name": "Бригада", "history": [{"status": "arrived", "comment": ""}]}]},
        "dds_policy": {"steps": [{"message": "Бригада прибыла на место"}]},
    }
    obj = SimpleNamespace(id=original.id, attempt_id=original.attempt_id, context_snapshot=snapshot)
    assert not (await build_context(db_session, obj, SimpleNamespace(fields=[])))["criteria"]
    snapshot["dds"]["crews"][0]["history"][0]["comment"] = "Бригада на месте"
    assert len((await build_context(db_session, obj, SimpleNamespace(fields=[])))["criteria"]) == 1
    snapshot["exercise_scope"] = ["dds_crews"]
    assert not (await build_context(db_session, obj, SimpleNamespace(fields=[])))["criteria"]


def test_new_text_share_is_25_percent_and_old_checks_stay_at_20():
    from app.services.semantic_assessment.results import summary

    evaluation = SimpleNamespace(score=Decimal(100), max_score=Decimal(100), context_snapshot={})
    criteria = [
        SimpleNamespace(
            code="address",
            score=Decimal(100),
            max_score=Decimal(100),
            explanation="",
            criterion_snapshot={"fields": [{"field": "address_details.house"}]},
        )
    ]
    job = SimpleNamespace(
        status=JobStatus.SUCCEEDED,
        input={},
        output={
            "findings": [{"code": "description", "applied": True, "credit": 0}],
        },
    )
    old = card_score(evaluation, criteria, job)
    assert 100 * old[0] / old[1] == 80
    assert summary([job])["semantic_weight_percent"] == 20
    evaluation.context_snapshot = {"semantic_weight_percent": 25}
    job.input = {"semantic_weight_percent": 25}
    current = card_score(evaluation, criteria, job)
    assert round(100 * current[0] / current[1], 2) == 75
    assert "25%" in current[2][-1]["explanation"]
    assert summary([job])["semantic_weight_percent"] == 25
    job.output["findings"][0].update(applied=False, credit=None)
    assert card_score(evaluation, criteria, job)[:2] == (100, 100)
    job.output["findings"][0].update(applied=True, credit=0)
    criteria[0].criterion_snapshot = {"fields": [{"field": "description"}]}
    assert card_score(evaluation, criteria, job)[:2] == (0, 100)


async def test_student_feedback_is_private_and_only_available_after_submission(
    exercise, db_session
):
    e = exercise
    path = f"student/lessons/{e.lesson['id']}/feedback"
    assert await e.request("GET", path) == {"submitted": False, "cards": []}
    await e.request("GET", path, actor="student2", status=404)
    await e.request("GET", path, actor="teacher", status=403)
    await e.complete()
    job = await claim(db_session)
    output = fake_output(job, 0)
    output["findings"][0].update(
        reason="Комментарий ХИХИХАХА не содержит понятных сведений.",
        answer_quote="ХИХИХАХА",
        reference_quote="Эталонное решение",
        recommendation="Опишите, что сообщила бригада.",
    )
    assert job.input["semantic_weight_percent"] == 25
    assert await finish(db_session, job.id, job.worker_id, output, {})
    assert await e.request("GET", path) == {"submitted": False, "cards": []}
    await e.complete(1)
    await e.complete(2)
    data = await e.request("GET", path)
    assert data["submitted"] and len(data["cards"]) == 3
    assert [c["position"] for c in data["cards"]] == [1, 2, 3]
    assert [c["status"] for c in data["cards"]] == ["succeeded", "queued", "queued"]
    assert data["cards"][0]["findings"][0]["answer_quote"] == "ХИХИХАХА"
    assert set(data["cards"][0]) == {"assignment_id", "position", "title", "status", "findings"}
    await e.request("GET", path, actor="student2", status=404)


async def test_student_feedback_includes_failed_and_unstarted_cards(exercise, db_session):
    from app.models import Lesson
    from app.services.deadlines import enforce_deadlines

    e = exercise
    await e.complete()
    job = await db_session.scalar(select(AIJob))
    job.status = JobStatus.FAILED
    job.error = "private backend diagnostics"
    job.output = fake_output(job)
    lesson = await db_session.get(Lesson, UUID(e.lesson["id"]))
    deadline = datetime.now(UTC) + timedelta(seconds=1)
    lesson.available_until = deadline
    await db_session.commit()
    await enforce_deadlines(db_session, lesson, deadline + timedelta(seconds=1))
    data = await e.request("GET", f"student/lessons/{e.lesson['id']}/feedback")
    assert [c["status"] for c in data["cards"]] == ["failed", "not_started", "not_started"]
    assert all(not c["findings"] for c in data["cards"])
    assert "private" not in str(data)
