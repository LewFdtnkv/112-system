from uuid import UUID

import pytest
from sqlalchemy import func, select

from app.core.config import settings
from app.models import (
    AIJob,
    Attempt,
    AttemptEvent,
    CallCue,
    Evaluation,
    LessonEvaluation,
    LessonExecution,
    MessageRecipient,
    ProctoringEvent,
    Recording,
    SpeechAsset,
    TeachingMessage,
    TelephonyStation,
    TrainingCall,
    User,
)
from scripts.seed_demo import State
from scripts.seed_full_demo import populate_full_demo
from scripts.seed_training import DatabaseGateway
from scripts.source_catalog import load_catalog, populate_database


@pytest.mark.anyio
async def test_full_demo_results_and_repeat(db_session, tmp_path, auth_settings, monkeypatch):
    import urllib.request

    def no_network(*args, **kwargs):
        raise AssertionError("Full seed must not call external services")

    monkeypatch.setattr(urllib.request, "urlopen", no_network)
    monkeypatch.setattr(settings, "telephony_media_directory", str(tmp_path / "media"))
    admin = await db_session.scalar(select(User).where(User.username == "admin"))
    original_password = admin.password_hash
    catalog = await populate_database(db_session)
    state = State(tmp_path / "state.json", "http://isolated", "fulltest")
    gateway = DatabaseGateway(db_session, admin)
    previous = settings.semantic_assessment_enabled
    result = await populate_full_demo(gateway, state, catalog["classifier_id"], load_catalog())
    assert settings.semantic_assessment_enabled == previous
    assert admin.password_hash == original_password
    full = result["full_demo"]
    assert len(full["student_ids"]) == 4
    assert len(full["completed_attempt_ids"]) == 30
    assert len(full["generation_job_ids"]) == 3
    assert full["recommendations"] == "worker_after_assessment"
    assert len(full["lessons"]) == 14
    assert await db_session.scalar(select(Attempt.id).where(Attempt.status == "interrupted"))
    assert await db_session.scalar(select(func.count()).select_from(ProctoringEvent)) == 120
    assert await db_session.scalar(
        select(AttemptEvent.id).where(AttemptEvent.kind == "learning.hint_issued").limit(1)
    )
    assert await db_session.scalar(
        select(LessonEvaluation.id).where(LessonEvaluation.method == "teacher").limit(1)
    )
    assert await db_session.scalar(
        select(LessonExecution.paused_at).where(
            LessonExecution.lesson_id == UUID(full["lessons"]["paused"]),
            LessonExecution.student_id == UUID(full["student_ids"][0]),
        )
    )
    assert (
        await db_session.scalar(
            select(func.count()).select_from(AIJob).where(AIJob.status.in_(["queued", "running"]))
        )
        > 30
    )
    assert not await db_session.scalar(select(Evaluation.id).where(Evaluation.method == "ai"))
    assert not await db_session.scalar(
        select(TeachingMessage.id).where(TeachingMessage.source == "learning_advice")
    )
    jobs = list(await db_session.scalars(select(AIJob)))
    assert all(job.status == "queued" and job.output is None for job in jobs)
    assert all(job.model_version != "demo-fixture/no-model" for job in jobs)
    assert {job.purpose for job in jobs} == {"generation", "dds_generation", "evaluation"}
    assert await db_session.scalar(select(CallCue.id).limit(1))
    assert await db_session.scalar(select(func.count()).select_from(Recording)) == 9
    assert (
        await db_session.scalar(
            select(func.count())
            .select_from(Recording)
            .join(SpeechAsset)
            .where(SpeechAsset.status == "queued")
        )
        == 9
    )
    station = await db_session.get(TelephonyStation, UUID(full["station_id"]))
    assert station.enabled and not station.provisioned and station.mode == "browser"
    assert station.student_id == UUID(full["student_ids"][0])
    calls = list(await db_session.scalars(select(TrainingCall)))
    assert calls == []

    # Exercise the same readers as the student and teacher screens, not only row counts.
    from app.models import Lesson
    from app.services.lesson_evaluation import review_work
    from app.services.messages import list_messages
    from app.services.student.feedback import lesson_feedback
    from app.services.student.journal import lesson_work

    for name, lesson_id in full["lessons"].items():
        if not name.startswith("result-"):
            continue
        lesson = await db_session.get(Lesson, UUID(lesson_id))
        for student_id in full["student_ids"][:3]:
            student_id = UUID(student_id)
            work = await lesson_work(db_session, lesson, student_id)
            assert all(a.status == "completed" for a in work.assignments)
            review = await review_work(db_session, lesson.id, student_id, gateway.teacher.id)
            assert review.evaluations
            feedback = await lesson_feedback(db_session, lesson.id, student_id)
            assert feedback.submitted and feedback.cards
    inbox = await list_messages(db_session, UUID(full["student_ids"][0]))
    assert any(m["read_at"] for m in inbox["items"])
    assert any(m["read_at"] is None for m in inbox["items"])

    models = (
        User,
        Attempt,
        AIJob,
        LessonEvaluation,
        TeachingMessage,
        MessageRecipient,
        AttemptEvent,
    )
    counts = [await db_session.scalar(select(func.count()).select_from(m)) for m in models]
    # Simulate a lost final checkpoint and a few committed creates whose IDs were not saved.
    state.data.pop("full-demo-v2")
    for marker in (
        "full-demo-v2-scenario-operator_112",
        "full-demo-v2-editable-card",
        "full-demo-message-welcome",
    ):
        state.data["ids"].pop(marker)
    state.save()
    assert (
        await populate_full_demo(gateway, state, catalog["classifier_id"], load_catalog()) == result
    )
    assert counts == [await db_session.scalar(select(func.count()).select_from(m)) for m in models]
    # A tester's edits must survive reruns.
    teacher = gateway.teacher
    teacher.first_name = "Изменено тестировщиком"
    await db_session.commit()
    assert (
        await populate_full_demo(gateway, state, catalog["classifier_id"], load_catalog()) == result
    )
    assert teacher.first_name == "Изменено тестировщиком"
    assert counts == [await db_session.scalar(select(func.count()).select_from(m)) for m in models]


@pytest.mark.anyio
async def test_full_demo_requires_real_ai(monkeypatch):
    monkeypatch.setattr(settings, "semantic_assessment_enabled", False)
    with pytest.raises(RuntimeError, match="SEMANTIC_ASSESSMENT_ENABLED"):
        await populate_full_demo(None, None, None, None)
    assert settings.semantic_assessment_enabled is False


@pytest.mark.anyio
async def test_full_demo_rejects_legacy_fabricated_results(tmp_path):
    state = State(tmp_path / "state.json", "http://isolated", "old")
    state.data["full-demo-v1"] = {}
    with pytest.raises(RuntimeError, match="старые готовые ИИ-разборы"):
        await populate_full_demo(None, state, None, None)


@pytest.mark.parametrize("flags", [[], ["--database", "--profiles-only"]])
def test_full_demo_requires_database_and_training(monkeypatch, flags, capsys):
    from scripts import seed_demo

    monkeypatch.setattr("sys.argv", ["seed_demo.py", "--full-demo", *flags])
    with pytest.raises(SystemExit) as exc:
        seed_demo.main()
    assert exc.value.code == 2
    assert "--full-demo требует --database" in capsys.readouterr().err


def test_full_demo_is_exposed_in_cli_help(monkeypatch, capsys):
    from scripts import seed_demo

    monkeypatch.setattr("sys.argv", ["seed_demo.py", "--help"])
    with pytest.raises(SystemExit) as exc:
        seed_demo.main()
    assert exc.value.code == 0
    assert "--full-demo" in capsys.readouterr().out
