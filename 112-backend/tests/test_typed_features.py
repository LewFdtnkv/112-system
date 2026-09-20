from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from test_catalog_dds import api as api
from test_classifier_presentation import exercise, service_document
from test_teacher_api import teaching as teaching

from app.schemas.catalog_document import CatalogDocument, FeatureDefinition
from app.schemas.student import StudentAttemptRead
from app.services.catalog_rules import applicable_routes, validate_answers
from app.services.field_evaluation import check_fields

pytestmark = pytest.mark.anyio

FEATURES = [
    {"key": "place", "label": "Место", "type": "choice", "options": ["Дом", "Улица"]},
    {"key": "signs", "label": "Признаки", "type": "array", "options": ["Дым", "Пламя"]},
    {"key": "access", "label": "Доступ", "required": False},
    {"key": "notes", "label": "Уточнения", "type": "array", "required": False},
]
ANSWERS = {"place": "Дом", "signs": ["Дым", "Пламя"]}


def test_typed_routes_and_optional_absence():
    entry = SimpleNamespace(conditions={"format": "typed-features-v1", "features": FEATURES})
    routes = [
        SimpleNamespace(conditions={"when": when})
        for when in ({}, {"place": "Дом"}, {"signs": ["Дым"]}, {"access": False})
    ]
    assert applicable_routes(entry, routes, {"ekp": ANSWERS}) == routes[:3]
    assert applicable_routes(entry, routes, {"ekp": ANSWERS | {"access": False}}) == routes
    definitions = [FeatureDefinition.model_validate(f) for f in FEATURES]
    validate_answers(definitions, {}, require_complete=False)
    for invalid in (
        {},
        ANSWERS | {"place": "Крыша"},
        ANSWERS | {"signs": []},
        ANSWERS | {"signs": ["Дым", "Дым"]},
        ANSWERS | {"access": "false"},
        ANSWERS | {"notes": [4]},
        ANSWERS | {"unknown": True},
    ):
        with pytest.raises(HTTPException):
            validate_answers(definitions, invalid)
    validate_answers(definitions, ANSWERS | {"notes": ["Проезд со двора"]})


async def test_typed_student_roundtrip_grading_audit_and_map(api, teaching):
    doc = service_document()
    doc["entries"][1]["features"] = deepcopy(FEATURES)
    data = {"description": "Уточнённое обращение", "features": {"ekp": ANSWERS}}
    a, entries, version = await exercise(api, teaching, doc, reference_data=data)
    exported = await api("GET", f"admin/classifiers/{version['id']}/export")
    assert exported["entries"] == CatalogDocument.model_validate(doc).model_dump()["entries"]
    path = f"student/attempts/{a['id']}"
    entry = next(e for e in entries if not e["notification_required"])
    base = {
        "revision": a["card"]["revision"],
        "classifier_entry_id": entry["id"],
        "data": {"description": "Уточнённое обращение"},
        "recipient_service_ids": [],
    }
    saved = await api("PUT", path + "/card", base, actor="student")
    await api(
        "POST",
        path + "/submit",
        {"revision": saved["card"]["revision"]},
        actor="student",
        status=422,
    )
    base["revision"] = saved["card"]["revision"]
    for invalid in ({"latitude": 91, "longitude": 0}, {"latitude": 0, "longitude": "37"}):
        await api(
            "PUT",
            path + "/card",
            base | {"data": data | {"additional_fields": {"location": invalid}}},
            actor="student",
            status=422,
        )
    point = {"latitude": 55.75, "longitude": 37.61}
    answers = ANSWERS | {"signs": ["Пламя", "Дым"], "notes": ["Со двора"]}
    saved = await api(
        "PUT",
        path + "/card",
        base
        | {"data": data | {"features": {"ekp": answers}, "additional_fields": {"location": point}}},
        actor="student",
    )
    restored = await api("GET", path, actor="student")
    assert restored["card"]["data"]["additional_fields"]["location"] == point
    event = {
        "command_id": str(uuid4()),
        "kind": "ui.field_changed",
        "client_occurred_at": datetime.now(UTC).isoformat(),
        "field": "ekpAnswers.signs",
        "value": answers["signs"],
    }
    await api("POST", path + "/observations", {"events": [event]}, actor="student", status=200)
    result = await api(
        "POST", path + "/submit", {"revision": saved["card"]["revision"]}, actor="student"
    )
    snapshot = {
        "classifier_entry_id": entry["id"],
        "notification_required": False,
        "data": data,
        "feature_definitions": FEATURES,
    }
    check = check_fields(snapshot, StudentAttemptRead.model_validate(result))
    assert check.score_percent == 100
    changed = StudentAttemptRead.model_validate(result)
    changed.card.data.features["ekp"]["signs"] = ["Дым"]
    assert check_fields(snapshot, changed).score_percent < 100


async def test_service_names_permissions_search_and_export(api, teaching):
    doc = service_document()
    doc["services"][0]["short_name"] = "Служба 101"
    version = await api("POST", "admin/classifiers/import", doc, status=201)
    service = (await api("GET", "views/admin/services?q=" + doc["services"][0]["code"]))["items"][0]
    assert service["short_name"] == "Служба 101"
    data = {
        "name": "Учебное учреждение пожарной охраны города Москвы",
        "short_name": "Пожарная служба",
    }
    for actor in ("student", "teacher"):
        await api("PATCH", f"admin/services/{service['id']}", data, actor=actor, status=403)
    await api("PATCH", f"admin/services/{service['id']}", data)
    found = await api("GET", "services?q=Пожарная", actor="teacher")
    assert service["id"] in [s["id"] for s in found]
    exported = await api("GET", f"admin/classifiers/{version['id']}/export")
    assert next(s for s in exported["services"] if s["code"] == service["code"]) == data | {
        "code": service["code"]
    }
