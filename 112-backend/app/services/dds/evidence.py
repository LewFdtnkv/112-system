"""Evidence origin is independent of the source text and UI."""


def prepared_assignment(crew):
    if not crew:
        return False
    event = next((e for e in reversed(crew.get("history", [])) if e["status"] == "assigned"), {})
    return bool(event.get("prepared"))


def initial_codes(policy):
    """Assignments still active when this operator takes over the card."""
    return {
        c["crew_code"]
        for c in policy.get("card_exercise", {}).get("initial_crews", [])
        if c["history"][-1]["status"] != "cancelled"
    }
