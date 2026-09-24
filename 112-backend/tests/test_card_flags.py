from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy import select
from test_card_generation import TEXT, payload
from test_card_generation import teaching as teaching
from test_student_workflow import exercise as exercise

from app.models import AIJob, CardTemplate, Evaluation
from app.schemas.authoring import CardData
from app.schemas.student import StudentAttemptRead
from app.services.field_evaluation import check_fields
from app.services.generation_worker import claim, finish

pytestmark = pytest.mark.anyio


def test_strict_flag_and_count_types():
    from datetime import UTC, datetime

    from app.schemas.audit import ClientObservation
    from app.schemas.card_flags import FLAG_LABELS

    for key in FLAG_LABELS:
        assert (
            ClientObservation(
                command_id=uuid4(),
                kind="ui.field_changed",
                client_occurred_at=datetime.now(UTC),
                field=f"details.{key}",
                value=False,
            ).value
            is False
        )

    for data in (
        {"additional_fields": {"details": {"noContact": "false"}}},
        {"features": {"victimsCount": -1}},
        {"features": {"victimsCount": True}},
        {"features": {"victimsCount": 1.5}},
    ):
        with pytest.raises(ValidationError):
            CardData.model_validate({"description": "Описание"} | data)


async def test_flags_are_scored_without_inventing_legacy_answers(exercise):
    a = StudentAttemptRead.model_validate(await exercise.complete())
    reference = {
        "data": {
            "additional_fields": {
                "details": {
                    "hasVictims": True,
                    "refusedAmbulance": False,
                    "blocked": True,
                    "noContact": False,
                    "callDropped": True,
                }
            }
        }
    }
    reference["data"]["features"] = {"victimsCount": 2}
    a.card.data.features = {"victimsCount": None}
    a.card.data.additional_fields = {
        "details": {"hasVictims": True, "refusedAmbulance": True, "blocked": True}
    }
    check = check_fields(reference, a)
    assert check.possible_points == 5 and check.earned_points == 3
    fields = {f.field: f for f in check.fields}
    assert fields["additional_fields.details.callDropped"].status == "different"
    assert fields["additional_fields.details.noContact"].status == "matched"
    assert check_fields({"data": {}}, a).possible_points == 0


async def test_fixed_flags_are_facts_and_survive_worker(teaching, db_session):
    t = teaching
    data = payload(
        t,
        has_victims=True,
        victims_count=2,
        blocked=True,
        refused_ambulance=True,
        message_format="call",
    )
    jobs = await t.post("card-generations", data, expected=202)
    for item in jobs:
        job = await db_session.get(AIJob, UUID(item["id"]))
        assert job.input["facts"]["Отметки карточки"]["Пострадавшие"] is True
        assert job.input["card"]["data"]["features"]["victimsCount"] == 2
    job = await claim(db_session)
    assert await finish(db_session, job.id, job.worker_id, TEXT, {})
    card = await db_session.get(CardTemplate, job.card_template_id)
    assert card.data["additional_fields"]["details"]["blocked"] is True
    assert "Пострадали два человека." in card.caller_message
    assert "соединение прервалось" not in card.caller_message
    await t.post("card-generations", payload(t, has_victims=False, victims_count=2), expected=422)


async def test_generation_rejects_fixed_contradictions(teaching, db_session):
    t = teaching
    t.entry.conditions = {
        "format": "typed-features-v1",
        "features": [
            {"key": "injured", "label": "Пострадавшие", "type": "boolean", "required": True}
        ],
    }
    await db_session.commit()
    await t.post(
        "card-generations",
        payload(t, has_victims=False, feature_answers={"injured": True}),
        expected=422,
    )
    jobs = await t.post("card-generations", payload(t, has_victims=True), expected=202)
    for item in jobs:
        job = await db_session.get(AIJob, UUID(item["id"]))
        assert job.input["card"]["data"]["features"]["ekp"]["injured"] is True
    await t.post("card-generations", payload(t, no_contact=True), expected=422)


async def test_manually_authored_silent_card_can_be_opened_and_graded(
    teaching, db_client, db_session
):
    t = teaching
    created = await t.post(
        "cards",
        {
            "title": "Молчаливый вызов",
            "classifier_version_id": str(t.classifier.id),
            "classifier_entry_id": None,
            "caller_message": (
                "После обращения оператора в ответ тишина. Затем соединение прервалось."
            ),
            "recipient_service_ids": [],
            "data": {
                "description": "Соединение установлено, сведений не получено.",
                "additional_fields": {"details": {"noContact": True, "callDropped": True}},
            },
        },
    )
    card = await db_session.get(CardTemplate, UUID(created["id"]))
    read = await db_client.get(f"/api/v1/cards/{card.id}", headers=t.headers["teacher"])
    assert read.status_code == 200 and read.json()["classifier_entry_id"] is None
    library = await db_client.get("/api/v1/views/cards", headers=t.headers["teacher"])
    assert library.status_code == 200 and library.json()["total"] == 1
    scenario = await t.post(
        "scenarios", {"title": "Тишина", "role": "operator_112", "card_ids": [str(card.id)]}
    )
    group = await t.post("groups", {"name": "Молчаливые вызовы"})
    enrolled = await db_client.put(
        f"/api/v1/groups/{group['id']}/students/{t.accounts['student'].id}",
        headers=t.headers["teacher"],
    )
    assert enrolled.status_code in (200, 204)
    lesson = await t.post(
        "lessons/start",
        {
            "request_id": str(uuid4()),
            "group_id": group["id"],
            "scenario_version_id": scenario["id"],
        },
    )
    headers = t.headers["student"]
    work = (await db_client.get(f"/api/v1/student/lessons/{lesson['id']}", headers=headers)).json()
    started = await db_client.post(
        f"/api/v1/student/assignments/{work['assignments'][0]['id']}/start", headers=headers
    )
    assert started.status_code == 201, started.text
    a = started.json()
    hint = await db_client.post(
        f"/api/v1/student/attempts/{a['id']}/hints",
        headers=headers,
        json={"request_id": str(uuid4())},
    )
    assert hint.status_code == 200
    saved = await db_client.put(
        f"/api/v1/student/attempts/{a['id']}/card",
        headers=headers,
        json={
            "revision": a["card"]["revision"],
            "classifier_entry_id": None,
            "data": {
                "description": "В трубке тишина, затем звонок оборвался.",
                "additional_fields": {"details": {"noContact": True, "callDropped": True}},
            },
        },
    )
    assert saved.status_code == 200, saved.text
    submitted = await db_client.post(
        f"/api/v1/student/attempts/{a['id']}/submit",
        headers=headers,
        json={"revision": saved.json()["card"]["revision"]},
    )
    assert submitted.status_code == 200, submitted.text
    assert (
        submitted.json()["card"]["status"] == "registered"
        and not submitted.json()["notified_services"]
    )
    evaluation = await db_session.scalar(
        select(Evaluation).where(Evaluation.attempt_id == UUID(a["id"]))
    )
    assert evaluation.score == evaluation.max_score


async def test_flags_roundtrip_and_scope_protection(exercise, db_session):
    from test_learning_workflows import launch

    from app.models import ScenarioCard

    e = exercise
    source = await db_session.scalar(select(ScenarioCard).order_by(ScenarioCard.position))
    source.snapshot = source.snapshot | {
        "data": source.snapshot["data"]
        | {
            "additional_fields": {
                "details": {
                    "hasVictims": True,
                    "blocked": True,
                    "refusedAmbulance": False,
                    "noContact": False,
                    "callDropped": True,
                }
            },
        },
    }
    await db_session.commit()
    # Address-only practice keeps prepared flags even if a client tries to remove them.
    a = await launch(e, skills=["address"])
    assert a["card"]["data"]["additional_fields"]["details"]["callDropped"]
    saved = await e.request(
        "PUT",
        f"student/attempts/{a['id']}/card",
        {
            "revision": a["card"]["revision"],
            "data": {"additional_fields": {"details": {}}},
        },
    )
    assert saved["card"]["data"]["additional_fields"]["details"]["callDropped"]
    # Classification practice removes flags and suggests a missing one after selecting the type.
    a = await launch(e, skills=["classification"])
    assert not a["card"]["data"]["additional_fields"].get("details", {}).get("hasVictims")
    path = f"student/attempts/{a['id']}"
    a = await e.request(
        "PUT",
        path + "/card",
        {
            "revision": a["card"]["revision"],
            "classifier_entry_id": str(e.t.entry.id),
            "data": {"additional_fields": {"details": {"blocked": True, "callDropped": True}}},
        },
    )
    hint = await e.request(
        "POST", path + "/hints", {"request_id": str(uuid4()), "level": "explanation"}
    )
    assert hint["hint"]["task"] == "additional_fields.details.hasVictims"
    assert hint["hint"]["target"] == "classification"
    reread = await e.request("GET", path)
    assert reread["card"]["data"]["additional_fields"]["details"]["blocked"]
    await e.request("POST", path + "/submit", {"revision": a["card"]["revision"]})
    evaluation = await db_session.scalar(
        select(Evaluation).where(Evaluation.attempt_id == UUID(a["id"]))
    )
    assert 0 < evaluation.score < evaluation.max_score


def test_silent_reference_rejects_known_context_but_allows_technical_phone():
    from fastapi import HTTPException

    from app.schemas.card_flags import check_silent

    base = {"additional_fields": {"details": {"noContact": True}}}
    check_silent(
        base | {"caller_phone": "+70000000000", "caller_details": {"callerId": "+70000000000"}},
        None,
        [],
    )
    for extra in (
        {"address_details": {"street": "Ленина"}},
        {"caller_name": "Иван"},
        {"features": {"victimsCount": 2}},
        {"additional_fields": {"details": {"noContact": True, "hasVictims": True}}},
        {
            "additional_fields": {
                "details": {"noContact": True},
                "location": {"latitude": 55.0, "longitude": 37.0},
            }
        },
    ):
        with pytest.raises(HTTPException):
            check_silent(base | extra, None, [])
