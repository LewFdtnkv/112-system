"""Versioned reacting-unit process; a service tile is not a crew's work status."""

CREW_TRANSITIONS = {
    "assigned": {"responding", "cancelled"},
    "responding": {"arrived", "cancelled"},
    "arrived": {"in_progress", "completed", "cancelled"},
    "in_progress": {"completed", "cancelled"},
    "completed": set(),
    "cancelled": {"assigned"},
}

VERSION = "crews-v2"
PATH = ("assigned", "accepted", "responding", "arrived", "in_progress", "completed")
REFUSALS = {"not_accepted", "refused"}
INACTIVE = {"cancelled", *REFUSALS}
TERMINAL = {"completed", *REFUSALS}
TRANSITIONS = {
    "assigned": {"accepted", "not_accepted", "cancelled"},
    "accepted": {"responding", "refused", "cancelled"},
    "responding": {"arrived", "refused", "cancelled"},
    "arrived": {"in_progress", "refused", "cancelled"},
    "in_progress": {"completed", "refused", "cancelled"},
    "completed": set(),
    "not_accepted": {"assigned"},
    "refused": {"assigned"},
    "cancelled": {"assigned"},
}


def transitions(version):
    return TRANSITIONS if version == VERSION else CREW_TRANSITIONS


def cycle(history):
    result = []
    for event in history:
        if event["status"] == "assigned":
            result = []
        result.append(event)
    return result


def required_path(goal):
    if goal == "not_accepted":
        return ("assigned", "not_accepted")
    if goal == "refused":
        return ("assigned", "accepted", "refused")
    if goal == "cancelled":
        return ("assigned", "cancelled")
    return PATH[: PATH.index(goal) + 1]
