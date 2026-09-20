from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from app.core.security import hash_password, verify_password
from app.models import (
    Assignment,
    Attempt,
    CardTemplate,
    ClassifierEntry,
    ClassifierRoute,
    ClassifierVersion,
    GroupMembership,
    Lesson,
    ScenarioVersion,
    Service,
    ServiceProfile,
    User,
)
from app.models.enums import PublicationStatus

PASSWORD = "temporary-password-112"
pytestmark = pytest.mark.anyio


@pytest.fixture
async def teaching(db_session, db_client):
    async def add(model, **values):
        row = model(**values)
        db_session.add(row)
        await db_session.flush()
        return row

    password_hash = hash_password(PASSWORD)
    accounts = {}
    headers = {}
    for name in ("teacher", "other", "admin", "student", "student2"):
        accounts[name] = await add(
            User,
            username=f"{name}-{uuid4()}",
            password_hash=password_hash,
            is_admin=name == "admin",
            is_teacher=name in ("teacher", "other"),
            must_change_password=False,
        )
    service = await add(Service, code=f"dds-{uuid4()}", name="Учебная ДДС")
    approval = dict(
        status=PublicationStatus.PUBLISHED,
        approved_by_id=accounts["teacher"].id,
        approved_at=datetime.now(UTC),
    )
    profile = await add(
        ServiceProfile,
        service_id=service.id,
        version=1,
        name=service.name,
        responsibility="Учебная территория",
        **approval,
    )
    classifier = await add(
        ClassifierVersion,
        label=f"ekp-{uuid4()}",
        source_filename="test.xlsx",
        source_storage_key="test/test.xlsx",
        source_sha256="a" * 64,
        **approval,
    )
    entry = await add(
        ClassifierEntry,
        classifier_version_id=classifier.id,
        code="001",
        section="Учебный",
        name="Учебное происшествие",
        source_sheet="Лист 1",
        source_row=2,
        source_data={},
    )
    await add(ClassifierRoute, entry_id=entry.id, service_id=service.id, service_name=service.name)
    await db_session.commit()
    for name, account in accounts.items():
        response = await db_client.post(
            "/api/v1/auth/login",
            json={
                "username": account.username,
                "password": PASSWORD,
            },
        )
        assert response.status_code == 200, response.text
        headers[name] = {"Authorization": f"Bearer {response.json()['access_token']}"}

    async def post(path, payload, actor="teacher", expected=201):
        response = await db_client.post(f"/api/v1/{path}", headers=headers[actor], json=payload)
        assert response.status_code == expected, response.text
        return response.json()

    card_payload = dict(
        title="Дерево во дворе",
        classifier_version_id=str(classifier.id),
        classifier_entry_id=str(entry.id),
        caller_message="Во дворе упало дерево.",
        data={"address_text": "Учебная улица, 1", "description": "Упало дерево"},
        recipient_service_ids=[str(service.id)],
    )

    async def prepare(role="operator_112", members=("student", "student2")):
        group = await post("groups", {"name": "Учебная группа"})
        for member in members:
            response = await db_client.put(
                f"/api/v1/groups/{group['id']}/students/{accounts[member].id}",
                headers=headers["teacher"],
            )
            assert response.status_code == 200, response.text
        first = await post("cards", card_payload)
        second = await post("cards", card_payload | {"title": "Вторая карточка"})
        scenario = await post(
            "scenarios",
            {
                "title": "Три карточки",
                "role": role,
                "card_ids": [second["id"], first["id"], second["id"]],
                "service_profile_id": str(profile.id) if role == "dds" else None,
                "dds_policy": {
                    "steps": [
                        {
                            "status": "accepted",
                            "message": "Карточка относится к нашей службе. Примите её.",
                        }
                    ]
                }
                if role == "dds"
                else None,
            },
        )
        payload = dict(
            request_id=str(uuid4()),
            group_id=group["id"],
            scenario_version_id=scenario["id"],
            mode="practice",
            time_limit_seconds=180,
        )
        return SimpleNamespace(
            group=group, first=first, second=second, scenario=scenario, payload=payload
        )

    return SimpleNamespace(**locals())


async def test_admin_creates_account_requiring_password_change(teaching, db_client, db_session):
    t = teaching
    payload = {"username": " NEW-STUDENT ", "initial_password": PASSWORD, "first_name": "Иван"}
    user = await t.post("users", payload, actor="admin")
    assert user["username"] == "new-student" and user["must_change_password"]
    assert not user["is_teacher"] and not user["is_admin"]
    assert "password_hash" not in user and "initial_password" not in user
    stored = await db_session.get(User, UUID(user["id"]))
    assert stored.password_hash != PASSWORD and verify_password(PASSWORD, stored.password_hash)
    await t.post("users", payload, actor="admin", expected=409)
    response = await db_client.post(
        "/api/v1/auth/login",
        json={
            "username": user["username"],
            "password": PASSWORD,
        },
    )
    pair = response.json()
    assert pair["must_change_password"]
    headers = {"Authorization": f"Bearer {pair['access_token']}"}
    response = await db_client.get("/api/v1/users/me", headers=headers)
    assert response.status_code == 403
    changed = await db_client.post(
        "/api/v1/auth/change-password",
        headers=headers,
        json={
            "current_password": PASSWORD,
            "new_password": "new-private-password-112",
        },
    )
    assert changed.status_code == 200 and not changed.json()["must_change_password"]
    headers = {"Authorization": f"Bearer {changed.json()['access_token']}"}
    assert (await db_client.get("/api/v1/users/me", headers=headers)).status_code == 200


@pytest.mark.parametrize(
    "patch",
    [
        {"initial_password": "short"},
        {"initial_password": " " * 12},
        {"username": "bad/name"},
        {"must_change_password": False},
        {"email": "bad-email"},
        {"is_active": False},
    ],
)
async def test_user_creation_validation(teaching, patch):
    await teaching.post(
        "users",
        {"username": "new-student", "initial_password": PASSWORD} | patch,
        actor="admin",
        expected=422,
    )


@pytest.mark.parametrize("actor", ["teacher", "student"])
async def test_only_admin_creates_users(teaching, actor):
    await teaching.post(
        "users",
        {"username": "new-student", "initial_password": PASSWORD},
        actor=actor,
        expected=403,
    )


@pytest.mark.parametrize("actor", ["admin", "student"])
async def test_only_teacher_can_author(teaching, db_client, actor):
    t = teaching
    paths = ["groups", "cards", "scenarios", "lessons/start"]
    payloads = [
        {"name": "Группа"},
        t.card_payload,
        {"title": "Сценарий", "role": "operator_112", "card_ids": [str(uuid4())]},
        {"request_id": str(uuid4()), "group_id": str(uuid4()), "scenario_version_id": str(uuid4())},
    ]
    for path, payload in zip(paths, payloads, strict=True):
        await t.post(path, payload, actor=actor, expected=403)
    for path in ("groups", "cards", "scenarios", "lessons", "classifiers", "services"):
        assert (await db_client.get(f"/api/v1/{path}", headers=t.headers[actor])).status_code == 403


async def test_forced_password_change_protects_all_new_writes(teaching, db_client, db_session):
    t = teaching
    account = t.accounts["teacher"]
    account.is_admin = True
    account.is_teacher = False
    account.must_change_password = True
    await db_session.commit()
    for path, payload in [
        ("users", {"username": "new-student", "initial_password": PASSWORD}),
        ("groups", {"name": "Группа"}),
        ("cards", t.card_payload),
        (
            "scenarios",
            {
                "title": "Сценарий",
                "role": "dds",
                "service_profile_id": str(t.profile.id),
                "card_ids": [str(uuid4())],
            },
        ),
        (
            "lessons/start",
            {
                "request_id": str(uuid4()),
                "group_id": str(uuid4()),
                "scenario_version_id": str(uuid4()),
            },
        ),
    ]:
        result = await t.post(path, payload, expected=403)
        assert result["detail"] == "password_change_required"
    response = await db_client.put(
        f"/api/v1/groups/{uuid4()}/students/{uuid4()}", headers=t.headers["teacher"]
    )
    assert response.status_code == 403


async def test_group_membership_is_idempotent_and_owner_scoped(teaching, db_client, db_session):
    t = teaching
    group = await t.post("groups", {"name": "  Группа 1  "})
    assert group["name"] == "Группа 1" and group["teacher_id"] == str(t.accounts["teacher"].id)
    student = t.accounts["student"]
    student.must_change_password = True
    await db_session.commit()
    path = f"/api/v1/groups/{group['id']}/students/{student.id}"
    for _ in range(2):
        assert (await db_client.put(path, headers=t.headers["teacher"])).status_code == 200
    assert await db_session.scalar(select(func.count()).select_from(GroupMembership)) == 1
    assert (await db_client.put(path, headers=t.headers["other"])).status_code == 404
    for suffix in ("", "/students"):
        assert (
            await db_client.get(f"/api/v1/groups/{group['id']}{suffix}", headers=t.headers["other"])
        ).status_code == 404
    for member in (t.accounts["admin"], t.accounts["teacher"]):
        path = f"/api/v1/groups/{group['id']}/students/{member.id}"
        assert (await db_client.put(path, headers=t.headers["teacher"])).status_code == 409
    path = f"/api/v1/groups/{group['id']}/students/{uuid4()}"
    assert (await db_client.put(path, headers=t.headers["teacher"])).status_code == 404
    await t.post("groups", {"name": "Группа", "teacher_id": str(student.id)}, expected=422)


@pytest.mark.parametrize("state", [PublicationStatus.DRAFT, PublicationStatus.ARCHIVED])
async def test_cards_require_published_classifier(teaching, db_session, state):
    teaching.classifier.status = state
    await db_session.commit()
    await teaching.post("cards", teaching.card_payload, expected=409)
    assert await db_session.scalar(select(func.count()).select_from(CardTemplate)) == 0


@pytest.mark.parametrize(
    "patch",
    [
        {"classifier_entry_id": str(uuid4())},
        {"recipient_service_ids": []},
        {"recipient_service_ids": [str(uuid4())]},
        {"title": "  "},
        {"data": {"address_text": " ", "description": "Сведения"}},
    ],
)
async def test_card_validation(teaching, patch):
    await teaching.post("cards", teaching.card_payload | patch, expected=422)


async def test_card_requires_routes_and_active_recipients(teaching, db_session):
    t = teaching
    t.service.is_active = False
    await db_session.commit()
    await t.post("cards", t.card_payload, expected=422)
    t.service.is_active = True
    route = await db_session.scalar(
        select(ClassifierRoute).where(ClassifierRoute.entry_id == t.entry.id)
    )
    await db_session.delete(route)
    await db_session.commit()
    await t.post("cards", t.card_payload, expected=409)


async def test_conditional_routes_are_explicit_author_choices(teaching, db_session):
    t = teaching
    extra = await t.add(Service, code="conditional", name="Условная служба")
    await t.add(
        ClassifierRoute,
        entry_id=t.entry.id,
        service_id=extra.id,
        service_name=extra.name,
        conditions={"has_victims": True},
    )
    await db_session.commit()
    await t.post("cards", t.card_payload)
    card = await t.post(
        "cards",
        t.card_payload
        | {
            "recipient_service_ids": [str(t.service.id), str(extra.id)],
        },
    )
    assert set(card["recipient_service_ids"]) == {str(t.service.id), str(extra.id)}


@pytest.mark.parametrize("role", ["operator_112", "dds"])
async def test_group_lesson_workflow_and_replay(teaching, db_client, db_session, role):
    t = teaching
    d = await t.prepare(role)
    items = d.scenario["cards"]
    assert [item["position"] for item in items] == [1, 2, 3]
    assert [item["card_template_id"] for item in items] == [
        d.second["id"],
        d.first["id"],
        d.second["id"],
    ]
    lesson = await t.post("lessons/start", d.payload)
    assert lesson["status"] == "active" and lesson["started_at"]
    assert lesson["student_count"] == 2 and lesson["assignment_count"] == 6
    assert lesson["scenario_version_id"] == d.scenario["id"]
    path = f"/api/v1/lessons/{lesson['id']}/assignments"
    response = await db_client.get(path, headers=t.headers["teacher"])
    assignments = response.json()
    for name in ("student", "student2"):
        own = [a for a in assignments if a["student_id"] == str(t.accounts[name].id)]
        assert [a["position"] for a in own] == [1, 2, 3]
        assert [a["scenario_card_id"] for a in own] == [item["id"] for item in items]
        assert all(a["time_limit_seconds"] == 180 for a in own)
    assert await db_session.scalar(select(func.count()).select_from(Attempt)) == 0
    replay = await t.post("lessons/start", d.payload, expected=200)
    assert replay == lesson
    await t.post("lessons/start", d.payload | {"title": "Другой урок"}, expected=409)
    assert await db_session.scalar(select(func.count()).select_from(Lesson)) == 1
    for path in (f"lessons/{lesson['id']}", f"lessons/{lesson['id']}/assignments"):
        assert (
            await db_client.get(f"/api/v1/{path}", headers=t.headers["other"])
        ).status_code == 404


async def test_scenario_snapshots_do_not_change_with_template(teaching, db_session, db_client):
    t = teaching
    d = await t.prepare()
    template = await db_session.get(CardTemplate, UUID(d.first["id"]))
    template.data = {"description": "Изменённый шаблон"}
    await db_session.commit()
    response = await db_client.get(
        f"/api/v1/scenarios/{d.scenario['id']}", headers=t.headers["teacher"]
    )
    assert response.json()["cards"][1]["snapshot"]["data"]["description"] == "Упало дерево"


async def test_card_details_include_reference_metadata_without_student_access(teaching, db_client):
    t = teaching
    card = await t.post("cards", t.card_payload)
    path = f"/api/v1/cards/{card['id']}"
    detail = (await db_client.get(path, headers=t.headers["teacher"])).json()
    assert detail["classifier_entry"]["id"] == str(t.entry.id)
    assert detail["recipients"][0]["service_id"] == str(t.service.id)
    assert detail["recipients"][0]["name"] == t.service.name
    assert (await db_client.get(path, headers=t.headers["student"])).status_code == 403
    assert (await db_client.get(path, headers=t.headers["other"])).status_code == 404


async def test_scenarios_enforce_owner_and_role_requirements(teaching, db_client, db_session):
    t = teaching
    card = await t.post("cards", t.card_payload | {"caller_message": None})
    payload = {"title": "Сценарий", "role": "operator_112", "card_ids": [card["id"]]}
    await t.post("scenarios", payload, expected=422)
    await t.post("scenarios", payload | {"role": "dds"}, expected=422)
    await t.post("scenarios", payload | {"card_ids": []}, expected=422)
    await t.post("scenarios", payload, actor="other", expected=404)
    assert (
        await db_client.get(f"/api/v1/cards/{card['id']}", headers=t.headers["other"])
    ).status_code == 404
    payload |= {
        "role": "dds",
        "service_profile_id": str(t.profile.id),
        "dds_policy": {
            "steps": [{"status": "accepted", "message": "Примите карточку нашей службы."}]
        },
    }
    t.profile.status = PublicationStatus.DRAFT
    await db_session.commit()
    await t.post("scenarios", payload, expected=409)
    t.profile.status = PublicationStatus.PUBLISHED
    another = await t.add(Service, code="another", name="Другая ДДС")
    t.profile.service_id = another.id
    await db_session.commit()
    await t.post("scenarios", payload, expected=422)


@pytest.mark.parametrize(
    "failure", ["empty", "inactive", "staff", "classifier", "scenario", "profile"]
)
async def test_lesson_prerequisites_fail_atomically(teaching, db_session, failure):
    t = teaching
    d = await t.prepare("dds", members=() if failure == "empty" else ("student",))
    if failure == "inactive":
        t.accounts["student"].is_active = False
    elif failure == "staff":
        t.accounts["student"].is_teacher = True
    elif failure == "classifier":
        t.classifier.status = PublicationStatus.ARCHIVED
    elif failure == "scenario":
        scenario = await db_session.get(ScenarioVersion, UUID(d.scenario["id"]))
        scenario.status = PublicationStatus.ARCHIVED
    elif failure == "profile":
        t.profile.status = PublicationStatus.ARCHIVED
    await db_session.commit()
    await t.post("lessons/start", d.payload, expected=409)
    assert await db_session.scalar(select(func.count()).select_from(Lesson)) == 0
    assert await db_session.scalar(select(func.count()).select_from(Assignment)) == 0


async def test_lesson_membership_snapshot_and_ownership(teaching, db_client):
    t = teaching
    d = await t.prepare(members=("student",))
    lesson = await t.post("lessons/start", d.payload)
    path = f"/api/v1/groups/{d.group['id']}/students/{t.accounts['student2'].id}"
    assert (await db_client.put(path, headers=t.headers["teacher"])).status_code == 200
    assert (await t.post("lessons/start", d.payload, expected=200))["student_count"] == 1
    new = await t.post("lessons/start", d.payload | {"request_id": str(uuid4())})
    assert new["student_count"] == 2 and new["id"] != lesson["id"]
    await t.post("lessons/start", d.payload, actor="other", expected=404)
    other_group = await t.post("groups", {"name": "Другая группа"}, actor="other")
    await t.post(
        "lessons/start",
        d.payload | {"request_id": str(uuid4()), "group_id": other_group["id"]},
        actor="other",
        expected=404,
    )


async def test_catalogs_and_list_isolation(teaching, db_client):
    t = teaching
    d = await t.prepare()
    await t.post("lessons/start", d.payload)
    for resource in ("groups", "cards", "scenarios", "lessons"):
        response = await db_client.get(f"/api/v1/{resource}?limit=1", headers=t.headers["teacher"])
        assert response.status_code == 200 and len(response.json()) == 1
        assert (await db_client.get(f"/api/v1/{resource}", headers=t.headers["other"])).json() == []
        assert (
            await db_client.get(f"/api/v1/{resource}?limit=101", headers=t.headers["teacher"])
        ).status_code == 422
    for path in (
        "classifiers",
        f"classifiers/{t.classifier.id}/entries",
        f"classifiers/{t.classifier.id}/entries/{t.entry.id}/routes",
        "services",
        "service-profiles",
    ):
        response = await db_client.get(f"/api/v1/{path}", headers=t.headers["teacher"])
        assert response.status_code == 200 and len(response.json()) == 1


async def test_edit_unused_card_preserves_id_and_rejects_stale_write(teaching, db_client):
    t = teaching
    card = await t.post("cards", t.card_payload)
    assert card["can_edit"] and card["revision"] == 1 and card["scenario_count"] == 0
    payload = t.card_payload | {
        "revision": 1,
        "title": "Уточнённая карточка",
        "data": {
            "address_text": "Учебная улица, 12",
            "description": "Уточнили адрес",
            "features": {"victimsCount": 0},
            "additional_fields": {"note": "Сохранить"},
        },
    }
    path = f"/api/v1/cards/{card['id']}"
    response = await db_client.put(path, headers=t.headers["teacher"], json=payload)
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["id"] == card["id"] and updated["revision"] == 2
    assert updated["created_at"] == card["created_at"]
    assert updated["data"]["features"]["victimsCount"] == 0
    assert updated["data"]["additional_fields"]["note"] == "Сохранить"
    assert updated["title"] == payload["title"]
    assert (
        await db_client.put(path, headers=t.headers["teacher"], json=payload)
    ).status_code == 409
    current = (await db_client.get(path, headers=t.headers["teacher"])).json()
    assert current["revision"] == 2 and current["title"] == payload["title"]


async def test_used_cards_are_read_only_even_in_draft_scenario(teaching, db_client):
    t = teaching
    card = await t.post("cards", t.card_payload)
    scenario = await t.post(
        "scenarios",
        {
            "title": "Черновик",
            "role": "operator_112",
            "status": "draft",
            "card_ids": [card["id"], card["id"]],
        },
    )
    path = f"/api/v1/cards/{card['id']}"
    current = (await db_client.get(path, headers=t.headers["teacher"])).json()
    assert not current["can_edit"] and current["scenario_count"] == 1
    response = await db_client.put(
        path,
        headers=t.headers["teacher"],
        json=t.card_payload | {"revision": 1, "title": "Нельзя изменить"},
    )
    assert response.status_code == 409
    frozen = (
        await db_client.get(f"/api/v1/scenarios/{scenario['id']}", headers=t.headers["teacher"])
    ).json()
    assert frozen["cards"] == scenario["cards"]
    assert (await db_client.get(path, headers=t.headers["teacher"])).json()["revision"] == 1


async def test_card_edit_enforces_owner_roles_and_classifier_validation(teaching, db_client):
    t = teaching
    card = await t.post("cards", t.card_payload)
    path = f"/api/v1/cards/{card['id']}"
    payload = t.card_payload | {"revision": 1}
    for actor, expected in [("student", 403), ("admin", 403), ("other", 404)]:
        assert (
            await db_client.put(path, headers=t.headers[actor], json=payload)
        ).status_code == expected
    invalid = payload | {"recipient_service_ids": []}
    assert (
        await db_client.put(path, headers=t.headers["teacher"], json=invalid)
    ).status_code == 422
    assert (await db_client.get(path, headers=t.headers["teacher"])).json()["revision"] == 1


async def test_card_library_returns_compact_metadata_and_usage(teaching, db_client):
    t = teaching
    card = await t.post("cards", t.card_payload)
    await t.post(
        "scenarios",
        {"title": "Сценарий", "role": "operator_112", "card_ids": [card["id"], card["id"]]},
    )
    page = (await db_client.get("/api/v1/views/cards", headers=t.headers["teacher"])).json()
    item = next(row for row in page["items"] if row["id"] == card["id"])
    assert item["scenario_count"] == 1
    assert item["address_text"] == t.card_payload["data"]["address_text"]
    assert item["incident_name"] == t.entry.name
    assert item["classifier_label"] == t.classifier.label
    assert item["recipients"][0]["name"] == t.service.name
    assert item["revision"] == 1 and item["updated_at"]
    assert "data" not in item and "caller_message" not in item
