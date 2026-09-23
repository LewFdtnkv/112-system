"""Compact learning evidence. Proctoring is deliberately never queried here."""

from collections import Counter

from sqlalchemy import select

from app.models import AttemptEvent


async def summarize_process(session, attempt_id, through):
    events = list(
        await session.scalars(
            select(AttemptEvent)
            .where(
                AttemptEvent.attempt_id == attempt_id,
                AttemptEvent.sequence <= (through or 0),
            )
            .order_by(AttemptEvent.sequence)
        )
    )
    server = [e for e in events if not e.kind.startswith("ui.")]
    browser = [e for e in events if e.kind.startswith("ui.")]
    hints = [e for e in server if e.kind == "learning.hint_issued"]
    changes = Counter(
        change["field"]
        for e in server
        if e.kind == "card.draft_saved"
        for change in e.payload.get("changes", [])
    )
    hint_details = []
    for e in hints[-20:]:
        following = next(
            (
                item
                for item in server
                if item.sequence > e.sequence
                and item.kind
                in {
                    "card.draft_saved",
                    "card.notified",
                    "dds.crew_changed",
                    "dds.submitted",
                }
            ),
            None,
        )
        hint_details.append(
            {
                "displayed_in_browser": any(
                    b.kind == "ui.hint_seen" and b.payload.get("value") == str(e.command_id)
                    for b in browser
                ),
                "event_id": str(e.id),
                "task": e.payload.get("task"),
                "level": e.payload.get("level"),
                "trigger": e.payload.get("trigger"),
                "text": e.payload.get("response", {}).get("hint", {}).get("text", ""),
                "next_action": following.kind if following else None,
                "next_event_id": str(following.id) if following else None,
                "seconds_to_next_action": round(
                    (following.occurred_at - e.occurred_at).total_seconds()
                )
                if following
                else None,
            }
        )
    gaps = [(b.occurred_at - a.occurred_at).total_seconds() for a, b in zip(server, server[1:])]
    return {
        "through_sequence": through or 0,
        "server_event_count": len(server),
        "confirmed_actions": dict(Counter(e.kind for e in server)),
        "browser_event_count": len(browser),
        "saved_field_changes": dict(changes),
        "hints_count": len(hints),
        "hints": hint_details,
        "hints_truncated": len(hints) > 20,
        "max_gap_between_server_events_seconds": round(max(gaps, default=0)),
        "browser_coverage": "incomplete_or_unknown",
        "delivery_gaps_reported": sum(e.kind == "ui.delivery_gap" for e in browser),
        "interpretation": "Пауза между событиями не доказывает бездействие. "
        "Подсказки и исправления без штрафа.",
    }
