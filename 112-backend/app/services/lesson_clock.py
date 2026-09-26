"""Pure timing rules. Wall-clock deadlines are independent of card pause intervals."""

from datetime import UTC, datetime, timedelta


def execution_deadline(lesson, execution):
    limits = [lesson.available_until] if lesson.available_until else []
    if lesson.time_limit_seconds and execution and execution.started_at:
        limits.append(execution.started_at + timedelta(seconds=lesson.time_limit_seconds))
    return min(limits) if limits else None


def active_intervals(attempt, until=None, *, start=None):
    end = until or attempt.ended_at or datetime.now(UTC)
    cursor = start or attempt.started_at
    result = []
    for pause in getattr(attempt, "pauses", None) or []:
        start = max(cursor, datetime.fromisoformat(pause["start"]))
        if start >= end:
            break
        if start > cursor:
            result.append((cursor, start))
        cursor = max(cursor, datetime.fromisoformat(pause["end"]) if pause["end"] else end)
    if cursor < end:
        result.append((cursor, end))
    return result


def elapsed_seconds(attempt, until=None, *, start=None):
    return sum(
        (end - start).total_seconds()
        for start, end in active_intervals(attempt, until, start=start)
    )
