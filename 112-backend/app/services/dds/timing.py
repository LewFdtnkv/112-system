"""Server receipt starts both QA4 clocks; neither is a completion deadline."""

from app.services.lesson_clock import elapsed_seconds


def timing(attempt):
    policy = attempt.settings_snapshot.get("dds_policy", {})
    if policy.get("workflow") != "crews-v2":
        return None
    result = {}
    for key, at, norm in (
        ("opening", attempt.first_opened_at, 30),
        ("first_record", attempt.first_record_at, 180),
    ):
        seconds = elapsed_seconds(attempt, at or attempt.ended_at)
        result[key] = {
            "at": at.isoformat() if at else None,
            "seconds": seconds,
            "norm_seconds": norm,
            "state": "on_time"
            if at and seconds <= norm
            else "late"
            if at
            else "missing"
            if attempt.ended_at
            else "overdue"
            if seconds > norm
            else "waiting",
        }
    return result
