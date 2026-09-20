from copy import deepcopy
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from test_teacher_api import teaching as teaching

from app.models import AttemptEvent, ClassifierVersion, Evaluation, ResponseEvent, Service

pytestmark = pytest.mark.anyio


@pytest.fixture
async def api(teaching, db_client):
    async def call(method, path, data=None, actor="admin", status=200):
        r = await db_client.request(
            method, "/api/v1/" + path, json=data, headers=teaching.headers[actor]
        )
        assert r.status_code == status, r.text
        return r.json()

    return call


def document():
    suffix = uuid4().hex[:8]
    return {
        "format": "system112-ekp-v1",
        "label": "Каталог " + suffix,
        "services": [
            {"code": "fire-" + suffix, "name": "Учебная пожарная служба"},
            {"code": "med-" + suffix, "name": "Учебная скорая"},
        ],
        "entries": [
            {
                "code": "101",
                "section": "Пожары",
                "name": "Учебный пожар",
                "response_scenario": "Учебные действия",
                "features": [{"key": "victims", "label": "Есть пострадавшие"}],
                "routes": [
                    {"service_code": "fire-" + suffix, "is_main": True, "when": {}},
                    {"service_code": "med-" + suffix, "is_main": False, "when": {"victims": True}},
                ],
            }
        ],
    }


async def test_catalog_roundtrip_edits_revision_publication_and_clone(api):
    doc = document()
    version = await api("POST", "admin/classifiers/import", doc, status=201)
    path = f"admin/classifiers/{version['id']}"
    assert await api("GET", path + "/export") == doc
    listing = await api("GET", path + "/entries?limit=1")
    assert listing["total"] == 1
    entry_path = path + "/entries/" + listing["items"][0]["id"]
    detail = await api("GET", entry_path)
    edited = detail["entry"] | {"name": "Пожар в учебном доме"}
    payload = {"expected_revision": detail["revision"], "entry": edited}
    changed = await api("PUT", entry_path, payload)
    assert changed["revision"] == detail["revision"] + 1
    await api("PUT", entry_path, payload, status=409)
    await api("POST", path + "/publish")
    await api(
        "PUT", entry_path, payload | {"expected_revision": changed["revision"] + 1}, status=409
    )
    exported = await api("GET", path + "/export")
    assert exported["entries"][0] == edited
    cloned = await api(
        "POST", path + "/versions", {"label": doc["label"] + " — исправление"}, status=201
    )
    assert cloned["status"] == "draft" and cloned["id"] != version["id"]
    assert (await api("GET", f"admin/classifiers/{cloned['id']}/export"))["entries"] == exported[
        "entries"
    ]
    for actor in ("student", "teacher"):
        await api("GET", path + "/export", actor=actor, status=403)
        await api("PUT", entry_path, payload, actor=actor, status=403)
        await api("POST", "admin/classifiers/import", document(), actor=actor, status=403)


@pytest.mark.parametrize(
    "invalid", ["duplicate", "unknown_feature", "coerced_boolean", "unknown_service"]
)
async def test_invalid_file_does_not_create_services_or_partial_catalog(api, db_session, invalid):
    doc = document()
    before = await db_session.scalar(select(func.count()).select_from(Service))
    entry = doc["entries"][0]
    if invalid == "duplicate":
        doc["entries"].append(deepcopy(entry))
    if invalid == "unknown_feature":
        entry["routes"][1]["when"] = {"hidden": True}
    if invalid == "coerced_boolean":
        entry["routes"][1]["when"] = {"victims": "false"}
    if invalid == "unknown_service":
        entry["routes"][1]["service_code"] = "absent"
    await api("POST", "admin/classifiers/import", doc, status=422)
    assert await db_session.scalar(select(func.count()).select_from(Service)) == before
    assert (
        await db_session.scalar(
            select(ClassifierVersion).where(ClassifierVersion.label == doc["label"])
        )
        is None
    )


async def test_duplicate_import_rolls_back_new_services(api, db_session):
    doc = document()
    await api("POST", "admin/classifiers/import", doc, status=201)
    conflicting = document() | {"label": doc["label"]}
    await api("POST", "admin/classifiers/import", conflicting, status=409)
    assert (
        await db_session.scalar(
            select(Service).where(Service.code == conflicting["services"][0]["code"])
        )
        is None
    )


async def test_profile_directories_versions_and_rights(api, teaching):
    t = teaching
    data = {
        "service_id": str(t.service.id),
        "name": "ДДС учебного района",
        "responsibility": "Учебный район",
        "procedure": "Проверить принадлежность карточки",
        "territories": [{"code": "t", "name": "Район", "description": "Территория"}],
        "objects": [
            {
                "code": "o",
                "name": "Школа",
                "territory_code": "t",
                "address": "Учебная, 1",
                "responsibility": "Наша служба",
            }
        ],
        "contacts": [
            {
                "code": "c",
                "name": "Дежурный",
                "target_service_id": str(t.service.id),
                "endpoint_key": "training_only",
                "description": "Учебный контакт",
            }
        ],
    }
    await api("POST", "admin/service-profiles", data, actor="teacher", status=403)
    created = await api("POST", "admin/service-profiles", data, status=201)
    path = f"admin/service-profiles/{created['id']}"
    assert created["objects"] == data["objects"]
    changed = await api(
        "PUT", path, data | {"name": "Исправленный профиль", "expected_revision": 1}
    )
    await api("PUT", path, data | {"expected_revision": 1}, status=409)
    published = await api("POST", path + "/publish")
    assert published["status"] == "published"
    await api("PUT", path, data | {"expected_revision": published["revision"]}, status=409)
    next_version = await api("POST", "admin/service-profiles", data, status=201)
    assert next_version["version"] == created["version"] + 1
    assert (await api("GET", path))["name"] == changed["name"]
    await api("GET", path, actor="student", status=403)
    invalid = data | {"objects": [data["objects"][0] | {"territory_code": "absent"}]}
    await api("POST", "admin/service-profiles", invalid, status=422)


@pytest.fixture
async def dds(api, teaching):
    t = teaching
    group = await t.post("groups", {"name": "ДДС"})
    await api("PUT", f"groups/{group['id']}/students/{t.accounts['student'].id}", actor="teacher")
    # Two recipients: finishing our response must not finish the other service.
    other = await t.post(
        "admin/services", {"code": uuid4().hex, "name": "Другая учебная служба"}, actor="admin"
    )
    from app.models import ClassifierRoute

    await t.add(
        ClassifierRoute,
        entry_id=t.entry.id,
        service_id=UUID(other["id"]),
        service_name=other["name"],
    )
    await t.db_session.commit()
    card = await t.post(
        "cards", t.card_payload | {"recipient_service_ids": [str(t.service.id), other["id"]]}
    )
    steps = [
        {"status": "accepted", "message": "Карточка относится к нашей службе. Примите."},
        {
            "status": "completed",
            "message": "Наряд УЧ-42 сообщил, что работы завершены.",
            "crew_number": "УЧ-42",
        },
    ]
    base = {
        "title": "Работа ДДС",
        "role": "dds",
        "service_profile_id": str(t.profile.id),
        "card_ids": [card["id"]],
    }
    await t.post("scenarios", base, expected=422)
    scenario = await t.post("scenarios", base | {"dds_policy": {"steps": steps}})
    lesson = await t.post(
        "lessons/start",
        {
            "request_id": str(uuid4()),
            "group_id": group["id"],
            "scenario_version_id": scenario["id"],
        },
    )
    work = await api("GET", f"student/lessons/{lesson['id']}", actor="student")
    attempt = await api(
        "POST",
        f"student/assignments/{work['assignments'][0]['id']}/start",
        actor="student",
        status=201,
    )
    path = f"student/attempts/{attempt['id']}"

    def action(a, status, **extra):
        return {
            "request_id": str(uuid4()),
            "revision": a["dds"]["revision"],
            "information_event_id": a["dds"]["information"]["id"],
            "status": status,
            "crew_number": None,
            "comment": "Учебный комментарий",
            **extra,
        }

    return SimpleNamespace(**locals())


async def test_dds_flow_ownership_revisions_sources_and_automatic_grade(dds, api, db_session):
    d = dds
    a = d.attempt
    assert a["role"] == "dds" and a["card"]["data"]["description"] == "Упало дерево"
    assert a["dds"]["status"] == "received" and not a["dds"]["first_decision_at"]
    assert "УЧ-42" not in str(a)  # No next message or expected answer leaks.
    await api("PUT", d.path + "/card", {"revision": 1, "data": {}}, actor="student", status=409)
    await api("POST", d.path + "/submit", {"revision": 1}, actor="student", status=409)
    payload = d.action(a, "accepted")
    await api("POST", d.path + "/dds/actions", payload, actor="student2", status=404)
    await api("POST", d.path + "/dds/actions", payload, actor="teacher", status=403)
    await api(
        "POST",
        d.path + "/dds/actions",
        payload | {"status": "arrived"},
        actor="student",
        status=422,
    )
    await api(
        "POST",
        d.path + "/dds/actions",
        payload | {"information_event_id": str(uuid4())},
        actor="student",
        status=409,
    )
    a = await api("POST", d.path + "/dds/actions", payload, actor="student")
    assert a["dds"]["first_decision_at"] and "УЧ-42" in a["dds"]["information"]["message"]
    assert (await api("POST", d.path + "/dds/actions", payload, actor="student"))["dds"][
        "history"
    ] == a["dds"]["history"]
    await api(
        "POST",
        d.path + "/dds/actions",
        payload | {"comment": "Changed"},
        actor="student",
        status=409,
    )
    await api(
        "POST",
        d.path + "/dds/actions",
        d.action(a, "completed") | {"revision": 1},
        actor="student",
        status=409,
    )
    a = await api(
        "POST",
        d.path + "/dds/actions",
        d.action(a, "completed", crew_number="УЧ-42"),
        actor="student",
    )
    assert a["card"]["status"] == "notified" and a["dds"]["responses"][1]["status"] in (
        "received",
        "completed",
    )
    assert sorted(r["status"] for r in a["dds"]["responses"]) == ["completed", "received"]
    result = await api(
        "POST", d.path + "/dds/submit", {"revision": a["dds"]["revision"]}, actor="student"
    )
    assert result["status"] == "completed"
    evaluation = await db_session.scalar(
        select(Evaluation).where(Evaluation.attempt_id == UUID(a["id"]))
    )
    assert evaluation.score == 100
    assert (
        await db_session.scalar(
            select(func.count())
            .select_from(ResponseEvent)
            .where(ResponseEvent.attempt_id == UUID(a["id"]))
        )
        == 2
    )
    events = list(
        await db_session.scalars(
            select(AttemptEvent)
            .where(AttemptEvent.attempt_id == UUID(a["id"]))
            .order_by(AttemptEvent.sequence)
        )
    )
    assert len({e.sequence for e in events}) == len(events)
    assert sum(e.kind == "dds.information" for e in events) == 2


async def test_dds_wrong_terminal_answer_is_recorded_and_graded(dds, api, db_session):
    d = dds
    a = await api(
        "POST", d.path + "/dds/actions", d.action(d.attempt, "not_accepted"), actor="student"
    )
    assert a["dds"]["can_finish"]
    await api("POST", d.path + "/dds/submit", {"revision": a["dds"]["revision"]}, actor="student")
    evaluation = await db_session.scalar(
        select(Evaluation).where(Evaluation.attempt_id == UUID(a["id"]))
    )
    assert evaluation.score == 0


async def test_typed_conditions_require_explicit_answers_and_matching_reference_recipients(api):
    doc = document()
    version = await api("POST", "admin/classifiers/import", doc, status=201)
    await api("POST", f"admin/classifiers/{version['id']}/publish")
    entry = (await api("GET", f"classifiers/{version['id']}/entries", actor="teacher"))[0]
    services = (await api("GET", f"views/admin/services?q={doc['services'][0]['code']}"))["items"]
    main = services[0]["id"]
    base = {
        "title": "Карточка с признаками",
        "caller_message": "Пожар. Пострадавших нет.",
        "classifier_version_id": version["id"],
        "classifier_entry_id": entry["id"],
        "data": {"address_text": "Учебная, 1", "description": "Пожар"},
        "recipient_service_ids": [main],
    }
    await api("POST", "cards", base, actor="teacher", status=422)
    for answer in ("false", None):
        await api(
            "POST",
            "cards",
            base | {"data": base["data"] | {"features": {"ekp": {"victims": answer}}}},
            actor="teacher",
            status=422,
        )
    await api(
        "POST",
        "cards",
        base | {"data": base["data"] | {"features": {"ekp": {"victims": True}}}},
        actor="teacher",
        status=422,
    )
    await api(
        "POST",
        "cards",
        base | {"data": base["data"] | {"features": {"ekp": {"victims": False, "hidden": True}}}},
        actor="teacher",
        status=422,
    )
    correct = await api(
        "POST",
        "cards",
        base | {"data": base["data"] | {"features": {"ekp": {"victims": False}}}},
        actor="teacher",
        status=201,
    )
    scenario = await api(
        "POST",
        "scenarios",
        {"title": "Признаки", "role": "operator_112", "card_ids": [correct["id"]]},
        actor="teacher",
        status=201,
    )
    assert scenario["cards"][0]["snapshot"]["feature_definitions"] == doc["entries"][0]["features"]
