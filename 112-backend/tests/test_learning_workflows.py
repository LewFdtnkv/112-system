from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select, update
from test_catalog_dds import api as api
from test_catalog_dds import dds as dds
from test_dds_crews import crews as crews
from test_student_workflow import exercise as exercise
from test_teacher_api import teaching as teaching

from app.models import AttemptEvent, Evaluation

pytestmark = pytest.mark.anyio


async def launch(e, kind="skill_practice", skills=None, level="solution"):
    lesson = await e.t.post(
        "lessons/start",
        e.d.payload
        | {
            "request_id": str(uuid4()),
            "student_id": str(e.t.accounts["student"].id),
            "learning": {
                "kind": kind,
                "target_skills": skills or [],
                "assistance": {"max_level": level},
            },
        },
    )
    work = await e.request("GET", f"student/lessons/{lesson['id']}")
    return await e.request(
        "POST", f"student/assignments/{work['assignments'][0]['id']}/start", status=201
    )


@pytest.mark.parametrize("kind", ["skill_practice", "review"])
@pytest.mark.parametrize(
    "skills",
    [
        ["address"],
        ["classification"],
        ["notification"],
        ["classification", "notification"],
        ["address", "description"],
    ],
)
async def test_focused_prefill_and_server_protection(exercise, db_session, kind, skills):
    e = exercise
    a = await launch(e, kind, skills)
    assert set(a["exercise_scope"]) == set(skills)
    assert (a["card"]["classifier_entry_id"] is None) == ("classification" in skills)
    assert (a["card"]["data"]["address_text"] is None) == ("address" in skills)
    assert (a["card"]["data"]["description"] is None) == ("description" in skills)
    if "notification" in skills:
        assert a["card"]["recipient_service_ids"] == [] and a["recipient_services"] == []
    else:
        assert a["card"]["recipient_service_ids"] == [str(e.t.service.id)]
    # A hand-written client cannot overwrite prepared fields; the server projects editable data.
    b = await e.request(
        "PUT",
        f"student/attempts/{a['id']}/card",
        {
            "revision": a["card"]["revision"],
            "classifier_entry_id": None,
            "recipient_service_ids": [],
            "data": {"description": "tampered", "address_text": "new address"},
        },
    )
    if "description" not in skills:
        assert b["card"]["data"]["description"] == "HIDDEN_TEACHER_ANSWER"
    if "classification" not in skills:
        assert b["card"]["classifier_entry_id"] == str(e.t.entry.id)
    if "notification" not in skills:
        assert b["card"]["recipient_service_ids"] == [str(e.t.service.id)]


async def test_hints_levels_progress_retry_and_access(exercise, db_session):
    e = exercise
    a = await launch(e, "practice")
    path = f"student/attempts/{a['id']}"
    request = {"request_id": str(uuid4()), "level": "goal"}
    first = await e.request("POST", path + "/hints", request)
    assert first["hint"]["task"] == "classifier_entry_id"
    assert first["hint"]["presentation"] == "text" and first["hint"]["target"] is None
    assert "Учебное происшествие" not in first["hint"]["text"]
    assert "HIDDEN_TEACHER_ANSWER" not in str(first)
    assert await e.request("POST", path + "/hints", request) == first
    await e.request("POST", path + "/hints", request | {"level": "solution"}, status=409)
    await e.request("POST", path + "/hints", request, actor="student2", status=404)
    for level in ["explanation", "solution"]:
        hint = await e.request(
            "POST", path + "/hints", {"request_id": str(uuid4()), "level": level}
        )
        assert hint["hint"]["target"] == "classification"
        assert ("Учебное происшествие" in hint["hint"]["text"]) == (level == "solution")
    a = await e.fill(a)
    assert (await e.request("POST", path + "/hints", request))["status"] == "waiting"
    hint = await e.request("POST", path + "/hints", {"request_id": str(uuid4())})
    assert hint["hint"]["task"] == "submit"  # Completed fields are not suggested again.
    await e.request("POST", path + "/submit", {"revision": a["card"]["revision"]})
    assert (await e.request("POST", path + "/hints", {"request_id": str(uuid4())}))[
        "status"
    ] == "complete"
    evaluation = await db_session.scalar(
        select(Evaluation).where(Evaluation.attempt_id == UUID(a["id"]))
    )
    assert evaluation.context_snapshot["assistance"]["issued_count"] == 4


async def test_automatic_hint_cooldown_and_depth_limit(exercise, db_session):
    e = exercise
    a = await launch(e, "practice", level="goal")
    path = f"student/attempts/{a['id']}/hints"
    automatic = {"request_id": str(uuid4()), "trigger": "automatic"}
    assert (await e.request("POST", path, automatic))["status"] == "waiting"
    await e.request("POST", path, automatic | {"level": "solution"}, status=403)
    await db_session.execute(
        update(AttemptEvent)
        .where(AttemptEvent.attempt_id == UUID(a["id"]))
        .values(occurred_at=datetime.now(UTC) - timedelta(seconds=60))
    )
    await db_session.commit()
    assert (await e.request("POST", path, automatic))["status"] == "ready"
    assert (await e.request("POST", path, automatic | {"request_id": str(uuid4())}))[
        "status"
    ] == "waiting"
    assessment = await launch(e, "assessment", level="none")
    assert (
        assessment["exercise_scope"] is None and assessment["card"]["classifier_entry_id"] is None
    )
    assert (
        await e.request(
            "POST",
            f"student/attempts/{assessment['id']}/hints",
            {"request_id": str(uuid4()), "level": "solution"},
        )
    )["status"] == "disabled"


async def test_scope_grade_excludes_prepared_facts(exercise, db_session):
    e = exercise
    a = await launch(e, skills=["classification"])
    path = f"student/attempts/{a['id']}"
    a = await e.request(
        "PUT",
        path + "/card",
        {"revision": a["card"]["revision"], "classifier_entry_id": str(e.t.entry.id), "data": {}},
    )
    await e.request("POST", path + "/submit", {"revision": a["card"]["revision"]})
    evaluation = await db_session.scalar(
        select(Evaluation).where(Evaluation.attempt_id == UUID(a["id"]))
    )
    assert evaluation.score == evaluation.max_score
    assert evaluation.context_snapshot["exercise_scope"] == ["classification"]
    assert (
        evaluation.max_score == 25
    )  # Classification weight; no prepared recipients/address credit.


async def test_unavailable_skill_data_and_whole_scenario_conflicts(exercise):
    e = exercise
    for policy in [
        {"kind": "practice", "target_skills": ["address"]},
        {"kind": "assessment", "target_skills": ["address"]},
        {"kind": "review", "target_skills": ["interface"]},
        {"kind": "skill_practice", "target_skills": ["caller"]},
    ]:
        await e.t.post(
            "lessons/start",
            e.d.payload | {"request_id": str(uuid4()), "learning": policy},
            expected=422,
        )


@pytest.mark.parametrize(
    "kind,skills",
    [
        ("practice", []),
        ("assessment", []),
        ("skill_practice", ["dds_response"]),
        ("review", ["dds_crews"]),
    ],
)
async def test_new_dds_uses_crews_without_changing_service(crews, api, db_session, kind, skills):
    c = crews
    lesson = await c.d.t.post(
        "lessons/start",
        {
            "request_id": str(uuid4()),
            "group_id": c.d.group["id"],
            "scenario_version_id": c.scenario["id"],
            "learning": {
                "kind": kind,
                "target_skills": skills,
                "assistance": {"max_level": "none" if kind == "assessment" else "solution"},
            },
        },
    )
    work = await api("GET", f"student/lessons/{lesson['id']}", actor="student")
    a = await api(
        "POST",
        f"student/assignments/{work['assignments'][0]['id']}/start",
        actor="student",
        status=201,
    )
    path = f"student/attempts/{a['id']}"
    assert a["dds"]["workflow"] == "crews-v1" and a["dds"]["can_finish"]
    assert a["dds"]["crew_goals"] == []  # No answer key in the learner response.
    if kind != "assessment":
        hint = await api(
            "POST",
            path + "/hints",
            {"request_id": str(uuid4()), "level": "explanation"},
            actor="student",
        )
        assert hint["status"] == "ready"
        assert hint["hint"]["target"] == (
            "dds_response" if skills == ["dds_response"] else "dds_crews"
        )
    assert bool(a["dds"]["crews"]) == (skills == ["dds_response"])
    service_before = a["dds"]["responses"]
    await api("POST", path + "/dds/actions", c.d.action(a, "accepted"), actor="student", status=409)
    if not a["dds"]["crews"]:
        a = await api("POST", path + "/dds/crews", c.command(a), actor="student")
    if skills == ["dds_crews"]:
        await api(
            "POST",
            path + "/dds/crews",
            c.command(a, status="responding"),
            actor="student",
            status=422,
        )
    else:
        for status in ("responding", "arrived", "completed"):
            a = await api("POST", path + "/dds/crews", c.command(a, status=status), actor="student")
    assert a["dds"]["responses"] == service_before
    await api("POST", path + "/dds/submit", {"revision": a["dds"]["revision"]}, actor="student")
    evaluation = await db_session.scalar(
        select(Evaluation).where(Evaluation.attempt_id == UUID(a["id"]))
    )
    assert evaluation.score == evaluation.max_score


async def test_dds_early_submission_grades_missing_work(crews, api, db_session):
    c = crews
    lesson = await c.d.t.post(
        "lessons/start",
        {
            "request_id": str(uuid4()),
            "group_id": c.d.group["id"],
            "scenario_version_id": c.scenario["id"],
        },
    )
    work = await api("GET", f"student/lessons/{lesson['id']}", actor="student")
    a = await api(
        "POST",
        f"student/assignments/{work['assignments'][0]['id']}/start",
        actor="student",
        status=201,
    )
    await api(
        "POST",
        f"student/attempts/{a['id']}/dds/submit",
        {"revision": a["dds"]["revision"]},
        actor="student",
    )
    evaluation = await db_session.scalar(
        select(Evaluation).where(Evaluation.attempt_id == UUID(a["id"]))
    )
    assert evaluation.score == 0 and evaluation.max_score > 0


async def test_learning_v2_migration_keeps_history(exercise, db_session):
    import importlib.util
    import json
    from pathlib import Path

    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import text

    e = exercise
    a = await e.start()
    old = {
        "version": "learning-v1",
        "kind": "practice",
        "objective": "history",
        "target_skills": ["address"],
        "assistance": {
            "mode": "visual",
            "max_level": "explanation",
            "on_request": True,
            "idle_seconds": 90,
        },
    }
    await db_session.execute(
        text("UPDATE lessons SET learning = CAST(:policy AS jsonb)"), {"policy": json.dumps(old)}
    )
    for table, column in (("assignments", "settings"), ("attempts", "settings_snapshot")):
        await db_session.execute(
            text(
                f"UPDATE {table} SET {column} = ({column} - 'learning_engine') || "
                "jsonb_build_object('learning', CAST(:policy AS jsonb))"
            ),
            {"policy": json.dumps(old)},
        )
    path = Path(__file__).resolve().parents[1] / "alembic/versions/0018_learning_workflows.py"
    spec = importlib.util.spec_from_file_location("learning_v2_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    def upgrade(sync_session):
        with Operations.context(MigrationContext.configure(sync_session.connection())):
            migration.upgrade()

    await db_session.run_sync(upgrade)
    snapshot = (
        await db_session.execute(
            text("SELECT settings_snapshot FROM attempts WHERE id = :id"), {"id": UUID(a["id"])}
        )
    ).scalar_one()
    assert snapshot["learning_legacy"] == old
    assert snapshot["learning"]["version"] == "learning-v2"
    assert snapshot["learning"]["target_skills"] == []
    assert snapshot["learning"]["assistance"] == {"max_level": "explanation", "on_request": True}
    assert "learning_engine" not in snapshot
    assert snapshot["assessment_policy"]["version"] == "weighted-fields-v1"
