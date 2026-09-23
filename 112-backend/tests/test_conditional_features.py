import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.catalog_document import CatalogDocument, EntryDefinition
from app.services.catalog_rules import active_features, validate_answers
from scripts.source_catalog import load_catalog, populate_database


def fire():
    return CatalogDocument.model_validate(load_catalog()).entries[0]


def test_source_catalog_and_fire_branches():
    document = CatalogDocument.model_validate(load_catalog())
    assert len(document.services) == 211 and len(document.entries) == 51
    fields = fire().features

    def visible(answers):
        return {f.key for f in active_features(fields, answers)}

    assert visible({}) == {"where", "description"}
    street = {"where": "Улица", "street_sign": "Открытое пламя / Дым", "street_object": "Мусор"}
    assert "offense" in visible(street)
    assert "transport_object" not in visible(street)
    validate_answers(fields, street)
    validate_answers(fields, {"where": "Транспорт"})
    # A hidden parent cannot enable its descendants through stale values.
    assert "offense" not in visible(street | {"where": "Дом"})
    for complete in (False, True):
        with pytest.raises(HTTPException, match="hidden"):
            validate_answers(fields, street | {"where": "Дом"}, require_complete=complete)


def test_only_visible_required_fields_and_typed_conditions():
    entry = EntryDefinition.model_validate(
        {
            "code": "X",
            "name": "X",
            "section": "X",
            "notification_required": False,
            "features": [
                {
                    "key": "parent",
                    "label": "Parent",
                    "type": "array",
                    "options": ["A", "B"],
                    "required": False,
                },
                {
                    "key": "detail",
                    "label": "Detail",
                    "type": "text",
                    "visible_when": [{"parent": ["A"]}],
                },
            ],
        }
    )
    validate_answers(entry.features, {})
    validate_answers(entry.features, {"parent": ["B"]})
    with pytest.raises(HTTPException, match="required"):
        validate_answers(entry.features, {"parent": ["A", "B"]})
    validate_answers(entry.features, {"parent": ["A"], "detail": "Пояснение"})
    for condition in ({"detail": "self"}, {"unknown": True}, {"parent": ["C"]}, {}):
        invalid = entry.model_dump()
        invalid["features"][1]["visible_when"] = [condition]
        with pytest.raises(ValidationError):
            EntryDefinition.model_validate(invalid)


@pytest.mark.anyio
async def test_database_population_idempotent_and_preserves_password(db_session):
    from sqlalchemy import select

    from app.models import ClassifierVersion, User
    from app.services.catalog_editor import export_document

    admin = await db_session.scalar(select(User).where(User.username == "admin"))
    original = admin.password_hash
    first = await populate_database(db_session)
    assert await populate_database(db_session) == first
    await db_session.refresh(admin)
    assert admin.password_hash == original
    version = await db_session.scalar(select(ClassifierVersion))
    exported = await export_document(db_session, version)
    assert len(exported.services) == 211  # Also preserve services without a route.
    assert next(e for e in exported.entries if e.name == "101").features == fire().features


@pytest.mark.anyio
async def test_cleanup_is_scoped_and_repeatable(db_session):
    from sqlalchemy import select

    from app.models import ClassifierVersion, Service, User
    from app.services.catalog_editor import import_document
    from scripts.cleanup_demo import cleanup

    await populate_database(db_session)
    admin = await db_session.scalar(select(User).where(User.username == "admin"))
    doc = CatalogDocument.model_validate(
        {
            "label": "test-clone",
            "services": [{"code": "demo-fire", "name": "Учебная пожарная служба"}],
            "entries": [
                {
                    "code": "TRAIN.01",
                    "name": "Old",
                    "section": "Old",
                    "routes": [{"service_code": "demo-fire"}],
                }
            ],
        }
    )
    await import_document(db_session, doc, admin.id)
    plan = await cleanup(db_session)
    assert plan["records"]["classifier_versions"] == 1
    assert not plan["applied"]
    result = await cleanup(db_session, apply=True)
    assert result["records"] == plan["records"]
    assert (await cleanup(db_session))["records"] == {}
    assert len(list(await db_session.scalars(select(Service)))) == 211
    assert len(list(await db_session.scalars(select(ClassifierVersion)))) == 1


@pytest.mark.anyio
async def test_cleanup_refuses_service_used_by_other_catalog(db_session):
    from sqlalchemy import select

    from app.models import User
    from app.services.catalog_editor import import_document
    from scripts.cleanup_demo import cleanup

    admin = await db_session.scalar(select(User).where(User.username == "admin"))
    doc = CatalogDocument.model_validate(
        {
            "label": "Real data",
            "services": [{"code": "demo-fire", "name": "Учебная пожарная служба"}],
            "entries": [
                {
                    "code": "REAL.01",
                    "name": "Real",
                    "section": "Real",
                    "routes": [{"service_code": "demo-fire"}],
                }
            ],
        }
    )
    await import_document(db_session, doc, admin.id)
    with pytest.raises(RuntimeError, match="вне тестового"):
        await cleanup(db_session, apply=True)


@pytest.mark.anyio
async def test_local_training_uses_source_catalog_and_repeats(db_session, tmp_path, auth_settings):
    from sqlalchemy import func, select

    from app.models import CardTemplate, ClassifierVersion, Lesson, User
    from scripts.seed_demo import State
    from scripts.seed_training import DatabaseGateway, populate_training

    catalog = await populate_database(db_session)
    admin = await db_session.scalar(select(User).where(User.username == "admin"))
    state = State(tmp_path / "state.json", "http://local", "demo")
    gateway = DatabaseGateway(db_session, admin)
    first = await populate_training(gateway, state, catalog["classifier_id"], load_catalog())
    assert (
        await populate_training(gateway, state, catalog["classifier_id"], load_catalog()) == first
    )
    for model, count in [(User, 3), (CardTemplate, 8), (Lesson, 11), (ClassifierVersion, 1)]:
        assert await db_session.scalar(select(func.count()).select_from(model)) == count
    from test_seed_demo import assert_dds_seed, assert_learning_seed

    await assert_dds_seed(db_session, first["dds"])
    await assert_learning_seed(db_session, first["learning"])
    # Repeating seed must preserve the student's ongoing DDS work.
    dds = gateway.dds()
    await dds.use_student(state.data["accounts"]["student"])
    active = await dds.lesson(first["dds"]["lessons"]["active"])
    assignment_id = active["assignments"][0]["id"]
    attempt = await dds.start(assignment_id)
    from uuid import uuid4

    changed = await dds.command(
        attempt["id"],
        "crews",
        {
            "crew_code": "fire-1",
            "request_id": str(uuid4()),
            "revision": attempt["dds"]["revision"],
            "information_event_id": attempt["dds"]["information"]["id"],
            "status": "assigned",
            "comment": "Бригада назначена учеником вручную",
        },
    )
    # Every seeded format must actually open, with the intended preparation.
    opened = []
    for role, lesson_ids in first["learning"]["lessons"].items():
        for kind, lesson_id in lesson_ids.items():
            work = await dds.lesson(lesson_id)
            started = await dds.start(work["assignments"][0]["id"])
            opened.append(started)
            assert started["learning"]["kind"] == kind
            if role == "operator_112":
                data = started["card"]["data"]
                assert bool(data["caller_name"]) == (kind == "review")
                assert bool(data["address_details"]) == (kind == "review")
                assert bool(started["card"]["classifier_entry_id"]) == (kind == "skill_practice")
            else:
                assert started["dds"]["workflow"] == "crews-v1"
                assert bool(started["dds"]["crews"]) == (kind == "review")
    from uuid import UUID

    from app.schemas.student import DraftSave
    from app.services.student import save_card

    focused = next(a for a in opened if a["exercise_scope"] == ["address", "caller"])
    saved = await save_card(
        db_session,
        UUID(focused["id"]),
        dds.student_id,
        DraftSave(
            revision=focused["card"]["revision"],
            data={"caller_name": "Введено учеником", "address_text": "Незавершённый адрес"},
        ),
    )
    await populate_training(gateway, state, catalog["classifier_id"], load_catalog())
    for started in opened:
        resumed = await dds.start(started["assignment_id"])
        assert resumed["id"] == started["id"]
        if started["id"] == focused["id"]:
            assert resumed["card"]["revision"] == saved.card.revision
            assert resumed["card"]["data"]["caller_name"] == "Введено учеником"
    unchanged = await dds.start(assignment_id)
    assert unchanged["dds"]["revision"] == changed["dds"]["revision"]
    assert unchanged["dds"]["crews"][0]["comment"] == "Бригада назначена учеником вручную"
    from app.services.auth import login

    for role in ("teacher", "student"):
        account = state.data["accounts"][role]
        pair = await login(db_session, account["username"], account["password"])
        assert not pair.must_change_password
        assert account["password"] == f"demo-{role}-123"
    # Random generation must choose only fields in the selected branch.
    from app.models import AIJob, ClassifierEntry
    from app.schemas.generation import GenerationCreate
    from app.services.card_generation import enqueue
    from app.services.catalog_rules import feature_definitions

    entry = await db_session.scalar(select(ClassifierEntry).where(ClassifierEntry.name == "101"))
    for where in ("Улица", "Транспорт"):
        await enqueue(
            db_session,
            gateway.teacher.id,
            GenerationCreate.model_validate(
                {
                    "request_id": str(uuid4()),
                    "count": 10,
                    "parameters": {
                        "classifier_version_id": catalog["classifier_id"],
                        "classifier_entry_id": str(entry.id),
                        "feature_answers": {"where": where},
                    },
                }
            ),
        )
    jobs = list(await db_session.scalars(select(AIJob).where(AIJob.purpose == "generation")))
    assert len(jobs) == 20
    for job in jobs:
        answers = job.input["card"]["data"]["features"]["ekp"]
        validate_answers(feature_definitions(entry), answers)
        if answers["where"] == "Транспорт":
            assert "street_sign" not in answers and "street_object" not in answers


@pytest.mark.anyio
async def test_cleanup_removes_demo_teacher_after_private_recipients(db_session):
    from sqlalchemy import select

    from app.models import MessageRecipient, TeachingMessage, User
    from scripts.cleanup_demo import cleanup

    teacher = User(username="demo-teacher", password_hash="test-only", is_teacher=True)
    student = User(username="demo-student", password_hash="test-only")
    db_session.add_all([teacher, student])
    await db_session.flush()
    message = TeachingMessage(teacher_id=teacher.id, text="Учебное сообщение")
    db_session.add(message)
    await db_session.flush()
    db_session.add(MessageRecipient(message_id=message.id, student_id=student.id))
    await db_session.flush()
    result = await cleanup(db_session, apply=True)
    assert result["records"]["users"] == 2
    assert result["preserved_with_other_data"] == []
    assert list(await db_session.scalars(select(User.username))) == ["admin"]
