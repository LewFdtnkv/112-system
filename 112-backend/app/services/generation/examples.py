"""Small, opt-in RAG corpus: exact incident/channel filters before feature ranking.

No embeddings are needed to select a few style examples from a teacher's own library.
Examples never define facts or reference answers for the new card.
"""

import json
import random
import re
from functools import lru_cache
from pathlib import Path
from uuid import UUID

from sqlalchemy import select

from app.db.session import session_factory
from app.models import CardTemplate


@lru_cache
def library():
    return json.loads((Path(__file__).parents[2] / "data/generation_examples.json").read_text())


def requirements_match(plan, requires):
    return all(
        plan.get(group, {}).get(key) == value
        for group in ("flags", "answers")
        for key, value in requires.get(group, {}).items()
    ) and ("victims_count" not in requires or plan["victims_count"] == requires["victims_count"])


def builtins(data):
    plan = data["narrative"]
    candidates = [
        row
        for row in library()
        if (
            row["channel"] == plan.get("message_format", "call")
            and plan["template_id"] in row["templates"]
            and requirements_match(plan, row.get("requires", {}))
        )
    ]
    if not candidates:
        return []

    def specificity(row):
        required = row.get("requires", {})
        return (
            len(required.get("flags", {}))
            + len(required.get("answers", {}))
            + ("victims_count" in required)
        )

    best = max(map(specificity, candidates))
    candidates = [row for row in candidates if specificity(row) == best]
    return [dict(candidates[data["seed"] % len(candidates)], source="authored")]


def anonymize(card):
    message = card.caller_message.split("\n\nСведения, доступные оператору:", 1)[0]
    message = message.split("\n\nВ ходе уточнения выяснено:", 1)[0]
    for key, marker in (
        ("address_text", "[АДРЕС]"),
        ("caller_name", "[ИМЯ]"),
        ("caller_phone", "[ТЕЛЕФОН]"),
    ):
        if card.data.get(key):
            message = message.replace(card.data[key], marker)
    return message[:1800]


def tokens(value):
    return set(re.findall(r"[а-яёa-z]+", json.dumps(value, ensure_ascii=False).lower()))


def compatible(card, plan):
    """Do not invite copying a different count, state or incident subtype."""
    features = card.data.get("features") or {}
    requires = {
        "answers": features.get("ekp") or {},
        "flags": {
            key: value
            for key, value in card.data.get("additional_fields", {}).get("details", {}).items()
            if key in {"hasVictims", "blocked", "refusedAmbulance"} and value is not None
        },
    }
    if features.get("victimsCount") is not None:
        requires["victims_count"] = features["victimsCount"]
    return requirements_match(plan, requires)


async def retrieve(session, job):
    data = job.input
    entry = data["card"].get("classifier_entry_id")
    if not entry:
        return builtins(data)
    channel = data["narrative"].get("message_format", "call")
    cards = list(
        await session.scalars(
            select(CardTemplate)
            .where(
                CardTemplate.created_by_id == job.created_by_id,
                CardTemplate.classifier_entry_id == UUID(entry),
                CardTemplate.generation_example.is_(True),
            )
            .order_by(CardTemplate.updated_at.desc(), CardTemplate.id)
            .limit(100)
        )
    )
    cards = [
        c
        for c in cards
        if c.caller_message
        and c.data.get("additional_fields", {}).get("messageChannel", "call") == channel
        and compatible(c, data["narrative"])
    ]
    wanted = tokens(data["narrative"]["answers"])
    cards.sort(key=lambda c: len(wanted & tokens(c.data.get("features"))), reverse=True)
    # Stable per job, varied across the batch; preference stays with the closest examples.
    selected = random.Random(data["seed"]).sample(cards[:3], min(1, len(cards)))
    return [
        {"id": str(c.id), "revision": c.revision, "source": "teacher", "message": anonymize(c)}
        for c in selected
    ] + builtins(data)


async def prepare(job):
    if job.input["narrative"]["mode"] == "template":
        return
    async with session_factory() as session:
        examples = await retrieve(session, job)
    job.context = {**job.context, "generation_examples": examples}


async def still_approved(session, teacher_id, examples):
    for example in examples:
        if example.get("source") != "teacher":
            continue
        card = await session.scalar(
            select(CardTemplate)
            .where(
                CardTemplate.id == UUID(example["id"]),
                CardTemplate.created_by_id == teacher_id,
                CardTemplate.generation_example.is_(True),
                CardTemplate.revision == example["revision"],
            )
            .with_for_update()
        )
        if card is None:
            return False
    return True
