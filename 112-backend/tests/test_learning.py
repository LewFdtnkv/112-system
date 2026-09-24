from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError
from test_student_workflow import exercise as exercise
from test_teacher_api import teaching as teaching

from app.models import Assignment, Attempt, Lesson, LessonEvaluation
from app.schemas.learning import LearningPolicy

pytestmark = pytest.mark.anyio


@pytest.mark.parametrize(
    "policy",
    [
        {"kind": "assessment", "assistance": {"mode": "text", "on_request": True}},
        {"kind": "skill_practice"},
        {"kind": "review", "target_skills": ["address", "address"]},
        {"target_skills": ["unknown"]},
        {"assistance": {"mode": "none", "idle_seconds": 30}},
        {"assistance": {"mode": "text"}},
        {"assistance": {"mode": "visual", "on_request": True, "idle_seconds": 0}},
        {"assistance": {"mode": "none", "max_level": "solution"}},
    ],
)
async def test_learning_policy_rejects_inconsistent_settings(policy):
    with pytest.raises(ValidationError):
        LearningPolicy.model_validate(policy)


async def test_learning_policy_launch_snapshot_and_permissions(exercise, db_session):
    e = exercise
    policy = LearningPolicy(
        kind="skill_practice",
        objective="Точно указать адрес",
        target_skills=["address"],
        assistance={
            "max_level": "explanation",
            "on_request": True,
        },
    ).model_dump(mode="json")
    payload = e.d.payload | {
        "request_id": str(uuid4()),
        "learning": policy,
        "student_id": str(e.t.accounts["student"].id),
    }
    lesson = await e.t.post("lessons/start", payload)
    assert lesson["learning"] == policy
    assert await e.t.post("lessons/start", payload, expected=200) == lesson
    await e.t.post("lessons/start", payload | {"learning": {"kind": "assessment"}}, expected=409)
    await e.t.post(
        "lessons/start", payload | {"request_id": str(uuid4())}, actor="student", expected=403
    )
    work = await e.request("GET", f"student/lessons/{lesson['id']}")
    assert work["learning"] == policy
    assert work["learning_result"]["independence"]["value"] is None
    assert not work["learning_result"]["assistance_available"]
    assignment_id = work["assignments"][0]["id"]
    attempt = await e.request("POST", f"student/assignments/{assignment_id}/start", status=201)
    assert attempt["learning"] == policy
    stored = await db_session.get(Attempt, UUID(attempt["id"]))
    assignment = await db_session.get(Assignment, UUID(assignment_id))
    assert stored.settings_snapshot["learning"] == policy == assignment.settings["learning"]
    # Future edits to assignment settings must not rewrite an existing attempt.
    assignment.settings = {"learning": LearningPolicy().model_dump(mode="json")}
    await db_session.commit()
    assert (await e.request("GET", f"student/attempts/{attempt['id']}"))["learning"] == policy
    for actor, path in [("student", "views/student/lessons"), ("teacher", "views/lessons")]:
        page = await e.request("GET", f"{path}?kind=skill_practice", actor=actor)
        assert [r["lesson_id"] for r in page["items"]] == [lesson["id"]]
        assert page["items"][0]["learning"] == policy
    await e.request("GET", f"student/lessons/{lesson['id']}", actor="student2", status=404)


async def test_unsupported_modes_and_role_mismatch_cannot_launch(teaching):
    d = await teaching.prepare()
    for policy in [
        {"kind": "worked_example"},
        {"target_skills": ["dds_crews"]},
    ]:
        await teaching.post("lessons/start", d.payload | {"learning": policy}, expected=422)
    dds = await teaching.prepare("dds")
    await teaching.post(
        "lessons/start", dds.payload | {"learning": {"target_skills": ["address"]}}, expected=422
    )
    await teaching.post(
        "lessons/start",
        dds.payload | {"learning": {"kind": "skill_practice", "target_skills": ["dds_crews"]}},
    )


async def test_results_distinguish_unknown_dimensions_and_freeze_learning_context(
    exercise, db_session
):
    e = exercise
    for index in range(3):
        await e.complete(index)
    work = await e.request("GET", f"student/lessons/{e.lesson['id']}")
    result = work["learning_result"]
    assert result["correctness"]["value"] == 100
    assert result["duration"]["value"] >= 0
    assert result["independence"]["status"] == "not_measured"
    assert result["interface"]["status"] == "not_measured"
    review = await e.request(
        "GET",
        f"lessons/{e.lesson['id']}/students/{e.t.accounts['student'].id}/work",
        actor="teacher",
    )
    assert review["learning_result"] == result
    from sqlalchemy import select

    from app.models import Evaluation

    evaluations = list(await db_session.scalars(select(Evaluation)))
    assert evaluations and all(
        row.context_snapshot["learning"]["kind"] == "practice" for row in evaluations
    )


async def test_performance_does_not_mix_training_and_assessment(exercise, db_session):
    e = exercise
    for kind, score in [("practice", 20), ("assessment", 90), ("review", 40)]:
        policy = {"kind": kind, "target_skills": ["address"] if kind == "review" else []}
        lesson = await e.t.post(
            "lessons/start",
            e.d.payload
            | {
                "request_id": str(uuid4()),
                "learning": policy,
                "student_id": str(e.t.accounts["student"].id),
            },
        )
        row = await db_session.get(Lesson, UUID(lesson["id"]))
        row.status = "finished"
        row.ended_at = datetime.now(UTC) + timedelta(seconds=1)
        db_session.add(
            LessonEvaluation(
                lesson_id=row.id,
                student_id=e.t.accounts["student"].id,
                reviewer_id=e.t.accounts["teacher"].id,
                request_id=uuid4(),
                revision=1,
                score=score,
                max_score=100,
                comment="Проверено",
            )
        )
    await db_session.commit()
    data = await e.request("GET", "student/overview")
    tracks = {track["track"]: track for track in data["performance"]["tracks"]}
    assert tracks["training"]["overall_percent"] == 30
    assert tracks["training"]["graded_lessons"] == 2
    assert tracks["assessment"]["overall_percent"] == 90
    assert tracks["assessment"]["graded_lessons"] == 1
    analytics = await e.request("GET", "views/analytics?track=assessment", actor="teacher")
    assert analytics["average_score_percent"] == 90 and analytics["graded"] == 1
    analytics = await e.request("GET", "views/analytics?track=training", actor="teacher")
    assert analytics["average_score_percent"] == 30 and analytics["graded"] == 2


async def test_migration_preserves_historical_modes_and_snapshots(exercise, db_session):
    import importlib.util
    from pathlib import Path

    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import text

    e = exercise
    first = await e.start()
    # Simulate a pre-migration assignment and attempt, retaining unrelated settings.
    await db_session.execute(
        text("UPDATE assignments SET mode = 'assessment', settings = '{\"historic\": true}'")
    )
    await db_session.execute(
        text("UPDATE attempts SET settings_snapshot = settings_snapshot - 'learning'")
    )
    await db_session.execute(text("ALTER TABLE lessons DROP COLUMN learning"))
    path = Path(__file__).resolve().parents[1] / "alembic/versions/0017_learning_foundation.py"
    spec = importlib.util.spec_from_file_location("learning_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    def upgrade(sync_session):
        with Operations.context(MigrationContext.configure(sync_session.connection())):
            migration.upgrade()

    await db_session.run_sync(upgrade)
    lesson = (
        await db_session.execute(
            text("SELECT learning FROM lessons WHERE id = :id"), {"id": UUID(e.lesson["id"])}
        )
    ).scalar_one()
    assert lesson["kind"] == "assessment" and lesson["assistance"]["mode"] == "none"
    settings = (
        await db_session.execute(
            text("SELECT settings FROM assignments WHERE id = :id"),
            {"id": UUID(first["assignment_id"])},
        )
    ).scalar_one()
    assert settings["historic"] is True and settings["learning"] == lesson
    snapshot = (
        await db_session.execute(
            text("SELECT settings_snapshot FROM attempts WHERE id = :id"), {"id": UUID(first["id"])}
        )
    ).scalar_one()
    assert snapshot["learning"] == lesson
    assert snapshot["assessment_policy"]["version"] == "weighted-fields-v1"
