"""Validate a future model response against persisted evidence; does not invoke AI."""

from sqlalchemy import select

from app.models import AttemptEvent
from app.schemas.assessment import AIAssessmentOutput


async def validate_ai_decision(session, output: AIAssessmentOutput, evaluation):
    snapshot = evaluation.context_snapshot
    if (
        output.attempt_id != evaluation.attempt_id
        or output.context_hash != snapshot["context_hash"]
    ):
        raise ValueError("AI response belongs to a different assessment context")
    codes = set(snapshot["unverified_fields"])
    if {item.code for item in output.criteria} != codes:
        raise ValueError("AI may assess only the explicitly assigned semantic criteria")
    cited_ids = {event_id for item in output.criteria for event_id in item.evidence_event_ids}
    existing = set(
        await session.scalars(
            select(AttemptEvent.id).where(
                AttemptEvent.id.in_(cited_ids),
                AttemptEvent.attempt_id == evaluation.attempt_id,
                AttemptEvent.sequence <= snapshot["audit_sequence"],
                ~AttemptEvent.kind.like("ui.%"),
            )
        )
    )
    if cited_ids != existing:
        raise ValueError("AI evidence must refer to authoritative events in the frozen attempt")
    for item in output.criteria:
        allowed_paths = {f"submitted_card.data.{item.code}", f"reference.data.{item.code}"}
        if not set(item.evidence_field_paths) <= allowed_paths:
            raise ValueError("AI cited an unrelated field")
        if item.decision != "abstain" and not (
            item.evidence_event_ids or item.evidence_field_paths
        ):
            raise ValueError("AI decisions need verifiable evidence")
    return output
