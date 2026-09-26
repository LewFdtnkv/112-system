from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Assignment,
    Attempt,
    ClassifierEntry,
    IncidentCard,
    ScenarioCard,
    ScenarioVersion,
    ServiceResponse,
)
from app.models.enums import (
    AttemptStatus,
    TrainingRole,
)
from app.schemas.catalog import ClassifierEntryRead
from app.schemas.student import (
    DraftData,
    RecipientRead,
    StudentAttemptRead,
    StudentCardRead,
)
from app.services.dds.views import context as dds_context
from app.services.student.routing import final_recipients


async def attempt_read(
    session: AsyncSession, attempt: Attempt, *, context=None, preview: bool = True
) -> StudentAttemptRead:
    if context is None:
        assignment = await session.get(Assignment, attempt.assignment_id)
        source = await session.get(ScenarioCard, assignment.scenario_card_id)
        scenario = await session.get(ScenarioVersion, assignment.scenario_version_id)
        card = await session.scalar(
            select(IncidentCard).where(IncidentCard.attempt_id == attempt.id)
        )
        responses = list(
            await session.scalars(
                select(ServiceResponse)
                .where(
                    ServiceResponse.attempt_id == attempt.id,
                )
                .order_by(ServiceResponse.service_id)
            )
        )
        entry = (
            await session.get(ClassifierEntry, card.classifier_entry_id)
            if card.classifier_entry_id
            else None
        )
    else:
        assignment, source, scenario, card, entry, responses = context
    targets = []
    recipient_error = None
    if (
        scenario.role == TrainingRole.OPERATOR_112
        and preview
        and entry
        and attempt.status == AttemptStatus.IN_PROGRESS
    ):
        try:
            targets = [
                RecipientRead(service_id=item.id, name=item.name, short_name=item.short_name)
                for item in await final_recipients(session, card)
            ]
        except HTTPException as exc:
            recipient_error = str(exc.detail)

    return StudentAttemptRead(
        learning=attempt.settings_snapshot.get("learning", {}),
        exercise_scope=attempt.settings_snapshot.get("exercise_scope"),
        role=scenario.role,
        dds=await dds_context(session, attempt, responses)
        if scenario.role == TrainingRole.DDS
        else None,
        classifier_entry=ClassifierEntryRead.model_validate(entry) if entry else None,
        recipient_services=targets,
        recipient_error=recipient_error,
        norm_seconds=scenario.norm_seconds,
        id=attempt.id,
        assignment_id=attempt.assignment_id,
        status=attempt.status,
        started_at=attempt.started_at,
        ended_at=attempt.ended_at,
        instructions="\n\n".join(
            filter(None, [scenario.instructions, source.snapshot["instructions"]])
        ),
        caller_message=source.snapshot["caller_message"],
        time_limit_seconds=attempt.settings_snapshot.get("time_limit_seconds"),
        card=StudentCardRead(
            id=card.id,
            display_number=card.display_number,
            revision=card.revision,
            status=card.status,
            classifier_version_id=card.classifier_version_id,
            classifier_entry_id=card.classifier_entry_id,
            data=DraftData.model_validate(card),
            opened_at=card.opened_at,
            saved_at=card.saved_at,
            notification_completed_at=card.notification_completed_at,
            recipient_service_ids=card.recipient_service_ids,
        ),
        notified_services=[
            RecipientRead(
                service_id=r.service_id, name=r.service_name, short_name=r.service_short_name
            )
            for r in responses
        ],
    )


async def review_attempts(session: AsyncSession, attempts: list[Attempt]):
    """Two queries for any number of cards; teacher previews need no route calculation."""
    if not attempts:
        return {}
    ids = [attempt.id for attempt in attempts]
    rows = (
        await session.execute(
            select(
                Attempt.id, Assignment, ScenarioCard, ScenarioVersion, IncidentCard, ClassifierEntry
            )
            .join(Assignment, Assignment.id == Attempt.assignment_id)
            .join(ScenarioVersion, ScenarioVersion.id == Assignment.scenario_version_id)
            .join(ScenarioCard, ScenarioCard.id == Assignment.scenario_card_id)
            .join(IncidentCard, IncidentCard.attempt_id == Attempt.id)
            .outerjoin(ClassifierEntry, ClassifierEntry.id == IncidentCard.classifier_entry_id)
            .where(Attempt.id.in_(ids))
        )
    ).all()
    services = {}
    for response in await session.scalars(
        select(ServiceResponse)
        .where(ServiceResponse.attempt_id.in_(ids))
        .order_by(ServiceResponse.service_id)
    ):
        services.setdefault(response.attempt_id, []).append(response)
    contexts = {row[0]: (*row[1:], services.get(row[0], [])) for row in rows}
    return {
        attempt.id: await attempt_read(
            session, attempt, context=contexts[attempt.id], preview=False
        )
        for attempt in attempts
        if attempt.id in contexts
    }
