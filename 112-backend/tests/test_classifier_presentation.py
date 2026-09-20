from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from test_catalog_dds import api as api
from test_catalog_dds import document
from test_teacher_api import teaching as teaching

from app.models import AttemptEvent, Evaluation, ServiceResponse

pytestmark = pytest.mark.anyio


async def exercise(api, teaching, doc, reference_ids=None, reference_data=None):
    version = await api("POST", "admin/classifiers/import", doc, status=201)
    await api("POST", f"admin/classifiers/{version['id']}/publish")
    entries = await api("GET", f"classifiers/{version['id']}/entries?limit=100", actor="teacher")
    entry = next(e for e in entries if not e["notification_required"])
    card = await api(
        "POST",
        "cards",
        {
            "title": "Ошибочно набран номер",
            "caller_message": "Извините, ошибся номером.",
            "classifier_version_id": version["id"],
            "classifier_entry_id": entry["id"],
            "recipient_service_ids": reference_ids or [],
            "use_recommended_recipients": reference_ids is None,
            "data": reference_data or {"description": "Ошибочный вызов"},
        },
        actor="teacher",
        status=201,
    )
    scenario = await api(
        "POST",
        "scenarios",
        {
            "title": "Регистрация обращения",
            "role": "operator_112",
            "card_ids": [card["id"]],
        },
        actor="teacher",
        status=201,
    )
    group = await api("POST", "groups", {"name": "Группа"}, actor="teacher", status=201)
    await api(
        "PUT", f"groups/{group['id']}/students/{teaching.accounts['student'].id}", actor="teacher"
    )
    lesson = await api(
        "POST",
        "lessons/start",
        {
            "request_id": str(uuid4()),
            "group_id": group["id"],
            "scenario_version_id": scenario["id"],
        },
        actor="teacher",
        status=201,
    )
    work = await api("GET", f"student/lessons/{lesson['id']}", actor="student")
    attempt = await api(
        "POST",
        f"student/assignments/{work['assignments'][0]['id']}/start",
        actor="student",
        status=201,
    )
    return attempt, entries, version


def service_document():
    doc = document()
    doc["entries"].append(
        {
            "code": "TRAIN.INFO.01",
            "name": "Ошибочно набран номер",
            "display_name": "Ошибочно набран номер",
            "section": "Обращения",
            "is_popular": True,
            "popular_order": 0,
            "notification_required": False,
            "features": [],
            "routes": [],
        }
    )
    return doc


async def test_popular_and_two_character_search_are_scoped(api, teaching):
    doc = service_document()
    for n in range(14):
        doc["entries"].append(
            doc["entries"][0]
            | {
                "code": f"TRAIN.FIRE.{n:02}",
                "display_name": f"Пожар {n}",
                "is_popular": True,
                "popular_order": n + 1,
            }
        )
    a, entries, _ = await exercise(api, teaching, doc)
    path = f"student/attempts/{a['id']}/classifier-entries"
    for q in ("", "?q=п", "?q=%20%20", "?q=%25%25"):
        assert await api("GET", path + q, actor="student") == []
    popular = await api("GET", path + "?popular=true&limit=100", actor="student")
    assert len(popular) == 11 and popular[0]["display_name"] == "Ошибочно набран номер"
    assert all(e["is_popular"] for e in popular)
    found = await api("GET", path + "?q=Пожар%2013", actor="student")
    assert len(found) == 1 and found[0]["code"] == "TRAIN.FIRE.13"
    await api("GET", path + "?popular=true", actor="student2", status=404)


async def test_register_without_notification_is_explicit_and_graded(api, teaching, db_session):
    a, entries, _ = await exercise(api, teaching, service_document())
    info = next(e for e in entries if not e["notification_required"])
    path = f"student/attempts/{a['id']}"
    saved = await api(
        "PUT",
        path + "/card",
        {
            "revision": a["card"]["revision"],
            "classifier_entry_id": info["id"],
            "data": {"description": "Ошибочный вызов"},
        },
        actor="student",
    )
    assert saved["recipient_services"] == [] and saved["recipient_error"] is None
    submitted = await api(
        "POST", path + "/submit", {"revision": saved["card"]["revision"]}, actor="student"
    )
    assert submitted["status"] == "completed"
    assert submitted["card"]["status"] == "registered"
    assert submitted["card"]["saved_at"] is not None
    assert submitted["card"]["notification_completed_at"] is None
    assert submitted["notified_services"] == []
    assert not list(
        await db_session.scalars(
            select(ServiceResponse).where(ServiceResponse.attempt_id == UUID(a["id"]))
        )
    )
    kinds = list(
        await db_session.scalars(
            select(AttemptEvent.kind).where(AttemptEvent.attempt_id == UUID(a["id"]))
        )
    )
    assert "card.registered_without_notification" in kinds and "card.notified" not in kinds
    grade = await db_session.scalar(
        select(Evaluation).where(Evaluation.attempt_id == UUID(a["id"]))
    )
    assert grade.score == grade.max_score and grade.max_score > 0
    repeated = await api(
        "POST", path + "/submit", {"revision": saved["card"]["revision"]}, actor="student"
    )
    assert repeated["card"] == submitted["card"]


async def test_non_notifying_catalog_cannot_hide_routes(api):
    doc = service_document()
    doc["entries"][0]["notification_required"] = False
    await api("POST", "admin/classifiers/import", doc, status=422)
    doc = service_document()
    doc["entries"][0]["routes"] = []
    await api("POST", "admin/classifiers/import", doc, status=422)
    # A purely informational directory has no artificial recipient service.
    doc = service_document()
    doc["entries"] = doc["entries"][1:]
    doc["services"] = []
    version = await api("POST", "admin/classifiers/import", doc, status=201)
    await api("POST", f"admin/classifiers/{version['id']}/publish")
    exported = await api("GET", f"admin/classifiers/{version['id']}/export")
    assert exported["services"] == []
    assert exported["entries"][0]["notification_required"] is False


async def test_manual_services_override_recommendations_persist_and_are_graded(
    api, teaching, db_session
):
    a, entries, _ = await exercise(api, teaching, service_document())
    info = next(e for e in entries if not e["notification_required"])
    path = f"student/attempts/{a['id']}"
    service_id = str(teaching.service.id)
    options = await api("GET", path + "/services", actor="student")
    assert service_id in {s["id"] for s in options["items"]}
    await api("GET", path + "/services", actor="student2", status=404)
    base = {
        "revision": a["card"]["revision"],
        "classifier_entry_id": info["id"],
        "data": {"description": "Ошибочный вызов"},
    }
    await api(
        "PUT",
        path + "/card",
        base | {"recipient_service_ids": [str(uuid4())]},
        actor="student",
        status=422,
    )
    await api(
        "PUT",
        path + "/card",
        base | {"recipient_service_ids": [service_id, service_id]},
        actor="student",
        status=422,
    )
    edited = await api(
        "PUT", path + "/card", base | {"recipient_service_ids": [service_id]}, actor="student"
    )
    assert [r["service_id"] for r in edited["recipient_services"]] == [service_id]
    restored = await api("GET", path, actor="student")
    assert restored["card"]["recipient_service_ids"] == [service_id]
    # Recommendations stay separate and are still empty for this informational type.
    assert (
        await api("GET", path + f"/recipients?classifier_entry_id={info['id']}", actor="student")
        == []
    )
    reset = await api(
        "PUT",
        path + "/card",
        base | {"revision": edited["card"]["revision"], "recipient_service_ids": None},
        actor="student",
    )
    assert reset["card"]["recipient_service_ids"] is None and reset["recipient_services"] == []
    edited = await api(
        "PUT",
        path + "/card",
        base | {"revision": reset["card"]["revision"], "recipient_service_ids": [service_id]},
        actor="student",
    )
    submitted = await api(
        "POST", path + "/submit", {"revision": edited["card"]["revision"]}, actor="student"
    )
    assert submitted["card"]["status"] == "notified"
    assert [r["service_id"] for r in submitted["notified_services"]] == [service_id]
    changes = list(
        await db_session.scalars(
            select(AttemptEvent).where(
                AttemptEvent.attempt_id == UUID(a["id"]),
                AttemptEvent.kind == "card.services_changed",
            )
        )
    )
    assert len(changes) == 3
    grade = await db_session.scalar(
        select(Evaluation).where(Evaluation.attempt_id == UUID(a["id"]))
    )
    assert grade.score < grade.max_score  # Extra notification is an actual learner decision.


async def test_teacher_can_define_reference_exception_to_ekp(api, teaching, db_session):
    sid = str(teaching.service.id)
    a, entries, _ = await exercise(api, teaching, service_document(), reference_ids=[sid])
    info = next(e for e in entries if not e["notification_required"])
    path = f"student/attempts/{a['id']}"
    saved = await api(
        "PUT",
        path + "/card",
        {
            "revision": a["card"]["revision"],
            "classifier_entry_id": info["id"],
            "recipient_service_ids": [sid],
            "data": {"description": "Ошибочный вызов"},
        },
        actor="student",
    )
    await api("POST", path + "/submit", {"revision": saved["card"]["revision"]}, actor="student")
    grade = await db_session.scalar(
        select(Evaluation).where(Evaluation.attempt_id == UUID(a["id"]))
    )
    assert grade.score == grade.max_score
    assert grade.context_snapshot["source"]["recipients"][0]["service_id"] == sid
