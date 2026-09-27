"""DDS RAG: approved teacher examples, filtered by incident/profile/transition.

Exact status filters matter more than semantic proximity for this small corpus.
Examples illustrate wording, never override the new exercise's facts.
"""

from sqlalchemy import select

from app.db.session import session_factory
from app.models import CardTemplate
from app.services.generation.examples import tokens

BUILTINS = {
    "assigned": (
        "Бригада назначена предыдущей сменой.",
        "Направьте бригаду для работы по поступившей карточке.",
    ),
    "responding": ("Руководитель сообщил о выезде.", "Выехали к месту происшествия."),
    "arrived": ("Получено сообщение о прибытии.", "Мы на месте, прибыли по указанному адресу."),
    "in_progress": ("Бригада приступила к работам.", "На месте, приступили к работам по карточке."),
    "completed": ("Получено сообщение о завершении работ.", "Работы по карточке завершили."),
    "cancelled": ("Назначение бригады отменено.", "Отмените назначение этой бригады."),
}


async def retrieve(session, job):
    plan = job.input["plan"]
    required = {(s["kind"], s["status"]) for s in plan["slots"]}
    examples = [
        {
            "source": "authored",
            "id": f"dds-v1:{kind}:{status}",
            "kind": kind,
            "status": status,
            "text": BUILTINS[status][kind == "message"],
        }
        for kind, status in sorted(required)
    ]
    cards = list(
        await session.scalars(
            select(CardTemplate)
            .where(
                CardTemplate.created_by_id == job.created_by_id,
                CardTemplate.id != job.target_card_id,
                CardTemplate.generation_example.is_(True),
                CardTemplate.dds_exercise.is_not(None),
                CardTemplate.classifier_entry_id == job.input["classifier_entry_id"],
            )
            .order_by(CardTemplate.updated_at.desc())
            .limit(100)
        )
    )
    cards = [
        c
        for c in cards
        if c.dds_exercise["service_profile_id"] == plan["exercise"]["service_profile_id"]
        and c.data.get("features") == plan["situation"]["data"].get("features")
    ]
    wanted = tokens(plan["situation"])
    cards.sort(key=lambda c: len(wanted & tokens(c.data)), reverse=True)
    for card in cards[:2]:
        exercise = card.dds_exercise
        history = [
            {"kind": "history", "status": e["status"], "text": e["comment"]}
            for c in exercise["initial_crews"]
            for e in c["history"]
            if e["comment"]
        ]

        # Pending messages may describe several transitions: use only exact same goals/history.
        def signature(x):
            return (
                [(c["crew_code"], [e["status"] for e in c["history"]]) for c in x["initial_crews"]],
                x["required_crews"],
            )

        messages = (
            [
                {"kind": "message", "status": "same-plan", "text": m["message"]}
                for m in exercise["messages"]
            ]
            if signature(exercise) == signature(plan["exercise"])
            else []
        )
        for row in history + messages:
            if (row["kind"], row["status"]) in required or row["status"] == "same-plan":
                examples.append(
                    {
                        "source": "teacher",
                        "id": str(card.id),
                        "revision": card.revision,
                        **row,
                        "text": row["text"][:500],
                    }
                )
    examples.sort(key=lambda row: row["source"] != "teacher")
    return examples[:10]


async def prepare(job):
    async with session_factory() as session:
        examples = await retrieve(session, job)
    job.context = {**job.context, "dds_examples": examples}
