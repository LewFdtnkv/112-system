from typing import Literal
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.dependencies import SessionDep, TeacherDep
from app.api.pagination import Limit, Offset, Search
from app.db.pagination import page_rows
from app.models import (
    AIJob,
    CardTemplate,
    CardTemplateRecipient,
    ClassifierEntry,
    ClassifierVersion,
    Scenario,
    ScenarioCard,
    ScenarioVersion,
    Service,
)
from app.schemas.student import RecipientRead
from app.schemas.views import (
    CardLibraryItem,
    Page,
    ScenarioItem,
)

router = APIRouter(prefix="/views", tags=["frontend pages"])


@router.get("/scenarios", response_model=Page[ScenarioItem])
async def scenarios(
    session: SessionDep,
    teacher: TeacherDep,
    q: Search = "",
    status: Literal["all", "draft", "published"] = "all",
    limit: Limit = 20,
    offset: Offset = 0,
):
    latest = (
        select(ScenarioVersion.scenario_id, func.max(ScenarioVersion.version).label("version"))
        .group_by(ScenarioVersion.scenario_id)
        .subquery()
    )
    query = (
        select(ScenarioVersion, func.count(ScenarioCard.id).label("card_count"))
        .join(Scenario)
        .join(
            latest,
            (latest.c.scenario_id == ScenarioVersion.scenario_id)
            & (latest.c.version == ScenarioVersion.version),
        )
        .outerjoin(ScenarioCard)
        .where(Scenario.created_by_id == teacher.id, Scenario.is_archived.is_(False))
    )
    if q:
        query = query.where(
            func.concat_ws(" ", ScenarioVersion.title, ScenarioVersion.category).ilike(f"%{q}%")
        )
    if status != "all":
        query = query.where(ScenarioVersion.status == status)
    query = query.group_by(ScenarioVersion.id).order_by(
        ScenarioVersion.created_at.desc(), ScenarioVersion.id
    )
    total, rows = await page_rows(session, query, limit, offset)
    return Page(
        items=[
            ScenarioItem.model_validate(
                {
                    **{
                        key: getattr(version, key)
                        for key in ScenarioItem.model_fields
                        if key != "card_count"
                    },
                    "card_count": count,
                }
            )
            for version, count in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/cards", response_model=Page[CardLibraryItem])
async def cards(
    session: SessionDep,
    teacher: TeacherDep,
    q: Search = "",
    classifier_version_id: UUID | None = None,
    dds_profile_id: UUID | None = None,
    limit: Limit = 20,
    offset: Offset = 0,
):
    usage = (
        select(
            ScenarioCard.card_template_id,
            func.count(func.distinct(ScenarioVersion.scenario_id)).label("count"),
        )
        .join(ScenarioVersion, ScenarioVersion.id == ScenarioCard.scenario_version_id)
        .group_by(ScenarioCard.card_template_id)
        .subquery()
    )
    query = (
        select(
            CardTemplate,
            ClassifierEntry.name,
            ClassifierEntry.display_name,
            ClassifierVersion.label,
            func.coalesce(usage.c.count, 0),
            AIJob.id,
        )
        .outerjoin(ClassifierEntry, ClassifierEntry.id == CardTemplate.classifier_entry_id)
        .join(ClassifierVersion, ClassifierVersion.id == CardTemplate.classifier_version_id)
        .outerjoin(usage, usage.c.card_template_id == CardTemplate.id)
        .outerjoin(AIJob, AIJob.card_template_id == CardTemplate.id)
        .where(CardTemplate.created_by_id == teacher.id)
    )
    if q:
        query = query.where(CardTemplate.title.ilike(f"%{q}%"))
    if dds_profile_id:
        query = query.where(
            CardTemplate.dds_exercise["service_profile_id"].astext == str(dds_profile_id)
        )
    if classifier_version_id:
        query = query.where(CardTemplate.classifier_version_id == classifier_version_id)
    total, rows = await page_rows(
        session, query.order_by(CardTemplate.created_at.desc(), CardTemplate.id), limit, offset
    )
    services = {row[0].id: [] for row in rows}
    if services:
        for card_id, service in await session.execute(
            select(CardTemplateRecipient.card_template_id, Service)
            .join(Service, Service.id == CardTemplateRecipient.service_id)
            .where(CardTemplateRecipient.card_template_id.in_(services))
            .order_by(Service.name, Service.id)
        ):
            services[card_id].append(
                RecipientRead(
                    service_id=service.id, name=service.name, short_name=service.short_name
                )
            )
    return Page(
        items=[
            CardLibraryItem(
                id=card.id,
                title=card.title,
                revision=card.revision,
                updated_at=card.updated_at,
                classifier_version_id=card.classifier_version_id,
                classifier_entry_id=card.classifier_entry_id,
                created_at=card.created_at,
                incident_name=display_name or name or "Молчаливый вызов",
                classifier_label=label,
                address_text=card.data.get("address_text") or "",
                recipients=services[card.id],
                scenario_count=count,
                generated_by_ai=job_id is not None,
            )
            for card, name, display_name, label, count, job_id in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )
