from copy import deepcopy
from datetime import datetime
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy import select
from test_catalog_dds import api as api
from test_catalog_dds import dds as dds
from test_dds_crews import crews as crews
from test_teacher_api import teaching as teaching

from app.models import AttemptEvent, Evaluation
from app.schemas.dds_exercise import DDSExercise
from app.schemas.learning import LearningPolicy

pytestmark = pytest.mark.anyio


def exercise(profile_id):
    return {
        "workflow": "crews-v1",
        "service_profile_id": profile_id,
        "crew_calls_required": True,
        "initial_crews": [
            {
                "crew_code": "water",
                "history": [
                    {
                        "status": "assigned",
                        "seconds_before_start": 300,
                        "comment": "Принято предыдущей сменой",
                        "crew_number": "23",
                    },
                    {
                        "status": "responding",
                        "seconds_before_start": 120,
                        "comment": "Выехали",
                        "crew_number": "23",
                    },
                ],
            }
        ],
        "required_crews": [{"crew_code": "water", "status": "arrived"}],
        "messages": [
            {"crew_code": "water", "message": "Бригада водоснабжения сообщает: прибыли по адресу."}
        ],
    }


@pytest.mark.parametrize(
    "problem",
    [
        "already_done",
        "unreachable",
        "bad_transition",
        "reverse_time",
        "missing_message",
        "duplicate",
        "negative_time",
    ],
)
async def test_invalid_starting_state_rejected(problem):
    data = exercise(str(uuid4()))
    if problem == "already_done":
        data["required_crews"][0]["status"] = "assigned"
    elif problem == "unreachable":
        data["initial_crews"][0]["history"] += [{"status": "arrived"}, {"status": "completed"}]
        data["required_crews"][0]["status"] = "cancelled"
    elif problem == "bad_transition":
        data["initial_crews"][0]["history"][0]["status"] = "completed"
    elif problem == "reverse_time":
        data["initial_crews"][0]["history"][1]["seconds_before_start"] = 600
    elif problem == "missing_message":
        data["messages"] = []
    elif problem == "duplicate":
        data["initial_crews"] *= 2
    else:
        data["initial_crews"][0]["history"][0]["seconds_before_start"] = -1
    with pytest.raises(ValidationError):
        DDSExercise.model_validate(data)


async def test_card_local_histories_evidence_and_independent_goals(crews, api):
    c = crews
    t = c.d.t
    t.card_payload = t.card_payload | {"recipient_service_ids": c.d.card["recipient_service_ids"]}
    data = exercise(c.profile["id"])
    first = await t.post("cards", t.card_payload | {"dds_exercise": data})
    second_data = deepcopy(data)
    second_data.update(
        initial_crews=[],
        crew_calls_required=False,
        required_crews=[{"crew_code": "water", "status": "assigned"}],
        messages=[{"crew_code": "water", "message": "Назначьте аварийную бригаду водоснабжения."}],
    )
    second = await t.post("cards", t.card_payload | {"dds_exercise": second_data})
    scenario = await t.post(
        "scenarios",
        {
            "title": "Две разные работы",
            "role": "dds",
            "service_profile_id": c.profile["id"],
            "card_ids": [first["id"], second["id"]],
            "arrival_offsets_seconds": [0, 0],
        },
    )
    assert scenario["dds_policy"] is None
    assert scenario["cards"][0]["snapshot"]["dds_exercise"]["initial_crews"]
    await t.post(
        "scenarios",
        {
            "title": "Чужой профиль",
            "role": "dds",
            "service_profile_id": str(t.profile.id),
            "card_ids": [first["id"]],
        },
        expected=422,
    )
    await api(
        "PUT",
        f"cards/{first['id']}",
        t.card_payload | {"dds_exercise": data, "revision": 1},
        actor="teacher",
        status=409,
    )
    listing = await api("GET", f"views/cards?dds_profile_id={c.profile['id']}", actor="teacher")
    assert {r["id"] for r in listing["items"]} == {first["id"], second["id"]}
    lesson = await t.post(
        "lessons/start",
        {
            "request_id": str(uuid4()),
            "group_id": c.d.group["id"],
            "scenario_version_id": scenario["id"],
            "learning": {"kind": "practice"},
        },
    )
    work = await api("GET", f"student/lessons/{lesson['id']}", actor="student")
    assignments = work["assignments"]
    a = await api(
        "POST", f"student/assignments/{assignments[0]['id']}/start", actor="student", status=201
    )
    b = await api(
        "POST", f"student/assignments/{assignments[1]['id']}/start", actor="student", status=200
    )
    assert b["dds"]["crews"] == []
    assert a["dds"]["crews"][0]["status"] == "responding"
    assert a["dds"]["crew_calls"] == []  # Previous operator already assigned/notified this crew.
    assert a["dds"]["first_decision_at"] is None
    assert "прибыли по адресу" not in a["dds"]["information"]["message"]
    assert a["dds"]["crew_messages"] == data["messages"]
    history = a["dds"]["crews"][0]["history"]
    assert all(h["prepared"] for h in history)
    assert (
        datetime.fromisoformat(a["dds"]["sent_at"]) - datetime.fromisoformat(history[0]["at"])
    ).total_seconds() == 300
    prepared = list(
        await t.db_session.scalars(
            select(AttemptEvent).where(
                AttemptEvent.attempt_id == UUID(a["id"]), AttemptEvent.kind == "dds.crew_changed"
            )
        )
    )
    assert all(e.actor.value == "simulation" for e in prepared)
    from app.schemas.student import StudentAttemptRead
    from app.services.dds.exercise import policy_for
    from app.services.dds_assessment import check_dds

    before = check_dds(policy_for(data), StudentAttemptRead.model_validate(a))
    assert not any(f.field.startswith("dds.assignment.") for f in before.fields)
    assert next(f for f in before.fields if f.field.startswith("dds.status.")).status != "matched"
    response_times = [(r["status"], r["status_updated_at"]) for r in a["dds"]["responses"]]
    a = await api(
        "POST",
        f"student/attempts/{a['id']}/dds/crews",
        c.command(a, status="arrived", comment="Прибыли"),
        actor="student",
    )
    assert a["dds"]["first_decision_at"] is not None
    assert not a["dds"]["crews"][0]["history"][-1].get("prepared")
    assert response_times == [(r["status"], r["status_updated_at"]) for r in a["dds"]["responses"]]
    after = check_dds(policy_for(data), StudentAttemptRead.model_validate(a))
    assert all(f.status == "matched" for f in after.fields if f.scored)
    await api(
        "POST",
        f"student/attempts/{a['id']}/dds/submit",
        {"revision": a["dds"]["revision"]},
        actor="student",
    )
    from types import SimpleNamespace

    from app.services.semantic_assessment.context import build_context

    evaluation = await t.db_session.scalar(
        select(Evaluation).where(Evaluation.attempt_id == UUID(a["id"]))
    )
    context = await build_context(t.db_session, evaluation, SimpleNamespace(fields=[]))
    criterion = context["criteria"][0]
    assert "Принято предыдущей сменой" not in criterion["answer"]
    assert "Принято предыдущей сменой" in criterion["situation"]
    assert context["process"]["confirmed_actions"]["dds.crew_changed"] == 1


async def test_card_edit_validation_and_skill_conflicts(crews, api):
    c = crews
    t = c.d.t
    t.card_payload = t.card_payload | {"recipient_service_ids": c.d.card["recipient_service_ids"]}
    data = exercise(c.profile["id"])
    card = await t.post("cards", t.card_payload | {"dds_exercise": data})
    invalid = deepcopy(data)
    invalid["messages"][0]["crew_code"] = "off"
    await t.post("cards", t.card_payload | {"dds_exercise": invalid}, expected=422)
    changed = await api(
        "PUT",
        f"cards/{card['id']}",
        t.card_payload | {"revision": 1, "dds_exercise": data},
        actor="teacher",
    )
    assert changed["revision"] == 2 and changed["dds_exercise"]["initial_crews"]
    scenario = await t.post(
        "scenarios",
        {
            "title": "Передача смены",
            "role": "dds",
            "service_profile_id": c.profile["id"],
            "card_ids": [card["id"]],
        },
    )
    lesson = {
        "request_id": str(uuid4()),
        "group_id": c.d.group["id"],
        "scenario_version_id": scenario["id"],
        "learning": {"kind": "skill_practice", "target_skills": ["dds_crews"]},
    }
    await t.post("lessons/start", lesson, expected=422)
    lesson["learning"]["target_skills"] = ["dds_response"]
    await t.post("lessons/start", lesson)


async def test_cancelled_source_assignment_requires_new_work():
    from fastapi import HTTPException

    from app.services.dds.exercise import policy_for
    from app.services.dds_assessment import check_crew_exercise
    from app.services.learning_scope import validate_exercise

    data = exercise(str(uuid4()))
    data["initial_crews"][0]["history"].append({"status": "cancelled", "seconds_before_start": 60})
    DDSExercise.model_validate(data)
    scenario = SimpleNamespace(role="dds", completion_rules={})
    card = SimpleNamespace(snapshot={"dds_exercise": data})
    focused = LearningPolicy(kind="skill_practice", target_skills=["dds_response"])
    with pytest.raises(HTTPException, match="добавьте навык назначения"):
        validate_exercise(focused, scenario, [card])
    policy = LearningPolicy()
    validate_exercise(policy, scenario, [card])
    crew = {
        "crew_code": "water",
        "name": "Водоснабжение",
        "status": "cancelled",
        "history": [dict(h, prepared=True) for h in data["initial_crews"][0]["history"]],
    }
    read = SimpleNamespace(
        learning=policy,
        dds={"crews": [crew], "profile": {"crews": [{"code": "water", "name": "Водоснабжение"}]}},
    )
    check = check_crew_exercise(policy_for(data), read)
    assert {f.field for f in check.fields if f.scored} == {
        "dds.assignment.water",
        "dds.status.water",
        "dds.notification.water",
    }
    assert all(f.status != "matched" for f in check.fields)
