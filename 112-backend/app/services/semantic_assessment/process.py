"""Compact learning evidence. Proctoring is deliberately never queried here."""

from collections import Counter

from sqlalchemy import select

from app.models import Assignment, Attempt, AttemptEvent


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
    attempt = await session.get(Attempt, attempt_id)
    parallel = []
    if attempt and attempt.settings_snapshot.get("delivery") == "dds-stream-v1" and events:
        assignment = await session.get(Assignment, attempt.assignment_id)
        surrounding = list(
            await session.scalars(
                select(AttemptEvent)
                .join(Attempt, Attempt.id == AttemptEvent.attempt_id)
                .join(Assignment, Assignment.id == Attempt.assignment_id)
                .where(
                    Assignment.lesson_id == assignment.lesson_id,
                    Assignment.student_id == attempt.student_id,
                    AttemptEvent.occurred_at >= min(attempt.started_at, events[0].occurred_at),
                    AttemptEvent.occurred_at <= events[-1].occurred_at,
                    AttemptEvent.kind.in_(
                        [
                            "dds.card_received",
                            "dds.card_opened",
                            "dds.crew_changed",
                            "dds.submitted",
                            "call.requested",
                        ]
                    ),
                )
                .order_by(AttemptEvent.occurred_at.desc(), AttemptEvent.id)
                .limit(100)
            )
        )
        parallel = [
            {
                "attempt_id": str(e.attempt_id),
                "at": e.occurred_at.isoformat(),
                "kind": e.kind,
                "other_card": e.attempt_id != attempt_id,
            }
            for e in reversed(surrounding)
        ]
    return {
        "parallel_card_activity": parallel,
        "parallel_summary": {
            "other_cards": len({e["attempt_id"] for e in parallel if e["other_card"]}),
            "other_card_actions": dict(Counter(e["kind"] for e in parallel if e["other_card"])),
            "interpretation": "Переключения между карточками допустимы. "
            "Не считать их бездействием или ошибкой.",
        }
        if parallel
        else None,
        "parallel_context_limit": 100,
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
        "Подсказки и исправления без штрафа. Работа в другой карточке не является бездействием; "
        "действия других карточек не засчитываются как выполнение этой карточки.",
    }
