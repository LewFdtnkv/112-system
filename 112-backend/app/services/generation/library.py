import json
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, ConfigDict


class Situation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    types: list[str]
    title: str
    objects: list[str]
    answers: dict
    phrases: list[str]
    has_victims: bool | None
    blocked: bool | None
    victims_limit: int
    service_call: bool


@lru_cache
def library():
    document = json.loads(
        (Path(__file__).parents[2] / "data/generation_templates.json").read_text()
    )
    rows = [Situation.model_validate(row) for row in document["templates"]]
    if len({row.id for row in rows}) != len(rows):
        raise ValueError("Duplicate situation IDs")
    return document["version"], rows


def for_entry(entry):
    names = {entry.name.casefold(), (entry.display_name or "").casefold()}
    return [row for row in library()[1] if names.intersection(n.casefold() for n in row.types)]
