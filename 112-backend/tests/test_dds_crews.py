from copy import deepcopy
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from test_catalog_dds import api as api
from test_catalog_dds import dds as dds
from test_teacher_api import teaching as teaching

from app.models import AttemptEvent, Evaluation
from app.schemas.dds import DDSPolicy

pytestmark = pytest.mark.anyio


@pytest.fixture
async def crews(dds, api):
    d = dds
    profile_data = {
        "service_id": str(d.t.service.id),
        "name": "ДДС с бригадами",
        "responsibility": "Учебная территория",
        "crews": [
            {"code": "water", "name": "Аварийная бригада", "description": "Водоснабжение"},
            {"code": "electric", "name": "Электрики", "description": "Электроснабжение"},
            {"code": "off", "name": "Резерв", "is_active": False},
        ],
    }
    profile = await api("POST", "admin/service-profiles", profile_data, status=201)
    profile = await api("POST", f"admin/service-profiles/{profile['id']}/publish")
    policy = {"steps": d.steps, "required_crews": [{"crew_code": "water", "status": "completed"}]}
    base = d.base | {"service_profile_id": profile["id"], "dds_policy": policy}
    scenario = await d.t.post("scenarios", base)
    lesson = await d.t.post(
        "lessons/start",
        {
            "request_id": str(uuid4()),
            "group_id": d.group["id"],
            "scenario_version_id": scenario["id"],
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

    def command(attempt, code="water", status="assigned", **extra):
        return {
            "request_id": str(uuid4()),
            "revision": attempt["dds"]["revision"],
            "information_event_id": attempt["dds"]["information"]["id"],
            "crew_code": code,
            "status": status,
            "crew_number": "23",
            "comment": "Сведения от старшего учебной бригады",
            **extra,
        }

    async def act(attempt, code="water", status="assigned", **extra):
        return await api(
            "POST", path + "/dds/crews", command(attempt, code, status, **extra), actor="student"
        )

    return SimpleNamespace(**locals())


async def test_crew_rights_validation_retry_and_revision(crews, api):
    c = crews
    await api("POST", c.path + "/dds/crews", c.command(c.a), actor="student", status=409)
    a = await api("POST", c.path + "/dds/actions", c.d.action(c.a, "accepted"), actor="student")
    payload = c.command(a)
    service_times = {r["service_id"]: r["status_updated_at"] for r in a["dds"]["responses"]}
    own = next(r for r in a["dds"]["responses"] if r["service_id"] == str(c.d.t.service.id))
    assert own["status_updated_at"] == a["dds"]["history"][-1]["at"]
    assert all(r["added_at"] and r["received_at"] for r in a["dds"]["responses"])
    for actor, status in (("student2", 404), ("teacher", 403), ("admin", 403)):
        await api("POST", c.path + "/dds/crews", payload, actor=actor, status=status)
    for patch in (
        {"crew_code": "foreign"},
        {"crew_code": "off"},
        {"status": "completed"},
        {"information_event_id": str(uuid4())},
    ):
        await api("POST", c.path + "/dds/crews", payload | patch, actor="student", status=422)
    a = await api("POST", c.path + "/dds/crews", payload, actor="student")
    assert len(a["dds"]["crews"]) == 1
    assert a["dds"]["revision"] == payload["revision"] + 1
    assert a["dds"]["crews"][0]["status_updated_at"] == a["dds"]["crews"][0]["history"][-1]["at"]
    assert {r["service_id"]: r["status_updated_at"] for r in a["dds"]["responses"]} == service_times
    retry = await api("POST", c.path + "/dds/crews", payload, actor="student")
    assert retry["dds"]["crews"] == a["dds"]["crews"]
    await api(
        "POST", c.path + "/dds/crews", payload | {"comment": "другое"}, actor="student", status=409
    )
    await api(
        "POST",
        c.path + "/dds/crews",
        c.command(a, "electric", revision=payload["revision"]),
        actor="student",
        status=409,
    )
    await api(
        "POST", c.path + "/dds/actions", c.d.action(a, "completed"), actor="student", status=409
    )
    assert a["dds"]["status"] == "accepted"


async def test_independent_crews_history_cancel_and_automatic_grade(crews, api, db_session):
    c = crews
    a = await api("POST", c.path + "/dds/actions", c.d.action(c.a, "accepted"), actor="student")
    info = a["dds"]["information"]
    for code in ("water", "electric"):
        a = await c.act(a, code)
    for state in ("responding", "arrived", "in_progress", "completed"):
        a = await c.act(a, "water", state)
    assert a["dds"]["status"] == "accepted"
    assert a["dds"]["information"] == info  # Crew events don't consume service messages.
    assert (
        next(c for c in a["dds"]["crews"] if c["crew_code"] == "electric")["status"] == "assigned"
    )
    a = await c.act(a, "electric", "cancelled", comment="Бригада не требуется")
    a = await c.act(a, "electric", "assigned", comment="Новые сведения: нужна повторно")
    a = await c.act(a, "electric", "cancelled", comment="Отмена после уточнения")
    assert len(next(c for c in a["dds"]["crews"] if c["crew_code"] == "electric")["history"]) == 4
    a = await api(
        "POST",
        c.path + "/dds/actions",
        c.d.action(a, "completed", crew_number="УЧ-42"),
        actor="student",
    )
    assert sorted(r["status"] for r in a["dds"]["responses"]) == ["completed", "received"]
    await api("POST", c.path + "/dds/submit", {"revision": a["dds"]["revision"]}, actor="student")
    await api("POST", c.path + "/dds/crews", c.command(a, "electric"), actor="student", status=409)
    evaluation = await db_session.scalar(
        select(Evaluation).where(Evaluation.attempt_id == UUID(a["id"]))
    )
    assert evaluation.score == evaluation.max_score
    assert evaluation.context_snapshot["policy"]["version"] == "dds-crews-v2"
    events = list(
        await db_session.scalars(
            select(AttemptEvent).where(
                AttemptEvent.attempt_id == UUID(a["id"]),
                AttemptEvent.kind == "dds.crew_changed",
            )
        )
    )
    assert len(events) == 9
    assert all(
        e.payload["service_id"] == str(c.d.t.service.id)
        and e.actor_id == c.d.t.accounts["student"].id
        for e in events
    )


async def test_missing_required_crew_is_scored_zero(crews, api, db_session):
    c = crews
    a = await api("POST", c.path + "/dds/actions", c.d.action(c.a, "accepted"), actor="student")
    a = await api(
        "POST",
        c.path + "/dds/actions",
        c.d.action(a, "completed", crew_number="УЧ-42"),
        actor="student",
    )
    await api("POST", c.path + "/dds/submit", {"revision": a["dds"]["revision"]}, actor="student")
    evaluation = await db_session.scalar(
        select(Evaluation).where(Evaluation.attempt_id == UUID(a["id"]))
    )
    assert evaluation.score == 100 and evaluation.max_score == 120


async def test_profile_versions_and_attempt_snapshot(crews, api):
    c = crews
    await api("GET", f"service-profiles/{c.profile['id']}", actor="student", status=403)
    public = await api("GET", f"service-profiles/{c.profile['id']}", actor="teacher")
    assert public["crews"][0]["code"] == "water"
    modified = deepcopy(c.profile_data)
    modified["crews"][0]["name"] = "Новое имя"
    new = await api("POST", "admin/service-profiles", modified, status=201)
    await api("GET", f"service-profiles/{new['id']}", actor="teacher", status=409)
    await api("POST", f"admin/service-profiles/{new['id']}/publish")
    a = await api("GET", c.path, actor="student")
    assert a["dds"]["profile"]["crews"][0]["name"] == "Аварийная бригада"
    invalid = deepcopy(c.profile_data)
    invalid["crews"][0]["contact_code"] = "missing"
    await api("POST", "admin/service-profiles", invalid, status=422)
    invalid = deepcopy(c.profile_data)
    invalid["crews"].append(invalid["crews"][0])
    await api("POST", "admin/service-profiles", invalid, status=422)
    await c.d.t.post(
        "scenarios",
        c.base
        | {
            "dds_policy": c.policy
            | {"required_crews": [{"crew_code": "off", "status": "completed"}]}
        },
        expected=422,
    )


async def test_not_accepted_can_be_corrected_before_submission(dds, api):
    d = dds
    a = await api(
        "POST", d.path + "/dds/actions", d.action(d.attempt, "not_accepted"), actor="student"
    )
    assert "accepted" in a["dds"]["allowed_statuses"]
    a = await api("POST", d.path + "/dds/actions", d.action(a, "accepted"), actor="student")
    assert a["dds"]["status"] == "accepted"
    DDSPolicy.model_validate(
        {
            "steps": [
                {"status": "not_accepted", "message": "Карточка ошибочно направлена"},
                {"status": "accepted", "message": "Уточнение: относится к вашей службе"},
            ]
        }
    )


async def test_crew_milestones_do_not_penalize_further_progress():
    from app.services.dds_assessment import check_dds

    crew = {
        "crew_code": "water",
        "name": "Бригада",
        "status": "completed",
        "history": [
            {"status": "assigned", "comment": "Назначена"},
            {"status": "arrived", "comment": "На месте"},
            {"status": "completed", "comment": "Завершили"},
        ],
    }
    policy = {"steps": [], "required_crews": [{"crew_code": "water", "status": "arrived"}]}
    read = SimpleNamespace(dds={"crews": [crew], "history": [], "comment": ""})
    check = check_dds(policy, read)
    assert check.fields[0].status == "matched"
    crew["status"] = "cancelled"
    assert check_dds(policy, read).fields[0].status == "different"
    crew["status"] = "assigned"
    crew["history"].append({"status": "assigned", "comment": "Повторное назначение"})
    assert check_dds(policy, read).fields[0].status == "different"
    assert all(not f.scored for f in check.fields[1:])
