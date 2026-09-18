from uuid import uuid4

import pytest
from sqlalchemy import func, select
from test_teacher_api import teaching as teaching

from app.models import ClassifierVersion

pytestmark = pytest.mark.anyio


async def test_admin_can_prepare_and_publish_catalog(teaching, db_client):
    t = teaching
    service = await t.post(
        "admin/services", {"code": "demo-112", "name": "Тестовая служба"}, actor="admin"
    )
    payload = {
        "label": "demo-v1",
        "source_filename": "demo.json",
        "entries": [
            {
                "code": "DEMO.1",
                "section": "Тестовый",
                "name": "Тестовое происшествие",
                "service_ids": [service["id"]],
            }
        ],
    }
    version = await t.post("admin/classifiers", payload, actor="admin")
    assert version["status"] == "draft" and len(version["source_sha256"]) == 64
    await t.post("admin/classifiers", payload, actor="admin", expected=409)
    path = f"/api/v1/classifiers/{version['id']}/entries"
    assert (await db_client.get(path, headers=t.headers["teacher"])).status_code == 409
    for _ in range(2):
        published = await t.post(
            f"admin/classifiers/{version['id']}/publish", None, actor="admin", expected=200
        )
        assert published["status"] == "published"
    entries = (await db_client.get(path, headers=t.headers["teacher"])).json()
    assert len(entries) == 1 and entries[0]["code"] == "DEMO.1"
    await t.post(
        "cards",
        t.card_payload
        | {
            "classifier_version_id": version["id"],
            "classifier_entry_id": entries[0]["id"],
            "recipient_service_ids": [service["id"]],
        },
    )


@pytest.mark.parametrize("actor", ["teacher", "student"])
async def test_catalog_writes_are_admin_only(teaching, actor):
    t = teaching
    await t.post("admin/services", {"code": "demo", "name": "Demo"}, actor=actor, expected=403)
    await t.post(f"admin/classifiers/{t.classifier.id}/publish", None, actor=actor, expected=403)


async def test_invalid_catalog_is_atomic(teaching, db_session):
    t = teaching
    before = await db_session.scalar(select(func.count()).select_from(ClassifierVersion))
    payload = {
        "label": "invalid",
        "source_filename": "demo.json",
        "entries": [
            {
                "code": "TEST",
                "section": "Test",
                "name": "Test",
                "service_ids": [str(uuid4())],
            }
        ],
    }
    await t.post("admin/classifiers", payload, actor="admin", expected=422)
    assert await db_session.scalar(select(func.count()).select_from(ClassifierVersion)) == before
    payload["entries"] *= 2
    await t.post("admin/classifiers", payload, actor="admin", expected=422)


async def test_teacher_can_target_one_group_student(teaching):
    t = teaching
    d = await t.prepare()
    payload = d.payload | {"student_id": str(t.accounts["student"].id)}
    lesson = await t.post("lessons/start", payload)
    assert lesson["student_count"] == 1 and lesson["assignment_count"] == 3
    assert (await t.post("lessons/start", payload, expected=200))["id"] == lesson["id"]
    await t.post(
        "lessons/start", payload | {"student_id": str(t.accounts["student2"].id)}, expected=409
    )
    await t.post(
        "lessons/start",
        payload | {"request_id": str(uuid4()), "student_id": str(uuid4())},
        expected=404,
    )
