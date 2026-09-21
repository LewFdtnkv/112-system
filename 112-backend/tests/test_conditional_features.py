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
async def test_local_training_uses_source_catalog_and_repeats(db_session, tmp_path):
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
    for model, count in [(User, 3), (CardTemplate, 6), (Lesson, 1), (ClassifierVersion, 1)]:
        assert await db_session.scalar(select(func.count()).select_from(model)) == count
    # Random generation must choose only fields in the selected branch.
    from uuid import uuid4

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
    jobs = list(await db_session.scalars(select(AIJob)))
    assert len(jobs) == 20
    for job in jobs:
        answers = job.input["card"]["data"]["features"]["ekp"]
        validate_answers(feature_definitions(entry), answers)
        if answers["where"] == "Транспорт":
            assert "street_sign" not in answers and "street_object" not in answers
