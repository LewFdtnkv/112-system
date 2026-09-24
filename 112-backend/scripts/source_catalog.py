"""Reviewed source data, kept separate from the mechanics of database population."""

import json
from pathlib import Path

DATA_DIRECTORY = Path(__file__).parent / "data"


def load_catalog():
    return json.loads((DATA_DIRECTORY / "system112_catalog.json").read_text(encoding="utf-8"))


async def populate_database(session):
    """Administrative CLI mode: use application validation, preserve existing credentials."""
    from sqlalchemy import select

    from app.models import ClassifierVersion, User
    from app.schemas.catalog_document import CatalogDocument
    from app.services.catalog_admin import publish_classifier
    from app.services.catalog_editor import import_document

    document = CatalogDocument.model_validate(load_catalog())
    admin = await session.scalar(
        select(User).where(User.is_admin.is_(True), User.is_active.is_(True)).order_by(User.id)
    )
    if admin is None:
        raise RuntimeError("Нужен активный администратор; сначала примените существующие миграции")
    version = await session.scalar(
        select(ClassifierVersion).where(ClassifierVersion.label == document.label)
    )
    if version is None:
        version = await import_document(session, document, admin.id, "system112_catalog.json")
    else:
        source = version.import_report.get("source", {})
        if (
            version.import_report.get("last_edited_at")
            or CatalogDocument.model_validate(source) != document
        ):
            raise RuntimeError(
                "Справочник с таким названием уже изменён; автоматическая замена запрещена"
            )
    version = await publish_classifier(session, version.id, admin.id)
    return summary(str(version.id))


def summary(version_id):
    document = load_catalog()
    return {
        "classifier_id": version_id,
        "classifier_label": document["label"],
        "service_count": len(document["services"]),
        "incident_type_count": len(document["entries"]),
        "feature_count": sum(len(e["features"]) for e in document["entries"]),
        "status": "published",
        "note": "Названия — из целевой системы; недостающие поля и маршруты — учебные.",
    }
