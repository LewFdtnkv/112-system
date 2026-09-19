"""Semantic audit. Authoritative commands and untrusted browser observations stay distinct."""

from sqlalchemy import func, select

from app.models import Attempt, AttemptEvent
from app.models.enums import EventActor


async def append_event(
    session,
    attempt_id,
    kind,
    payload,
    *,
    actor=EventActor.SYSTEM,
    actor_id=None,
    command_id=None,
    client_occurred_at=None,
):
    # Serialize sequence allocation per attempt. Browser telemetry never needs the
    # group-wide lesson lock. Business commands acquire lesson -> attempt, never reverse.
    await session.execute(select(Attempt.id).where(Attempt.id == attempt_id).with_for_update())
    sequence = 1 + (
        await session.scalar(
            select(func.max(AttemptEvent.sequence)).where(AttemptEvent.attempt_id == attempt_id)
        )
        or 0
    )
    row = AttemptEvent(
        attempt_id=attempt_id,
        sequence=sequence,
        kind=kind,
        payload=payload,
        actor=actor,
        actor_id=actor_id,
        command_id=command_id,
        client_occurred_at=client_occurred_at,
    )
    session.add(row)
    await session.flush()
    return row


def field_changes(before, after, path=""):
    if isinstance(before, dict) and isinstance(after, dict):
        return [
            change
            for key in sorted(set(before) | set(after))
            for change in field_changes(before.get(key), after.get(key), f"{path}.{key}".strip("."))
        ]
    return [] if before == after else [{"field": path, "before": before, "after": after}]
