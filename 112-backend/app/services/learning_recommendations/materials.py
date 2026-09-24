"""Small authored study corpus; examples guide pedagogy, never supply student facts."""

import asyncio

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.models import LearningGuide
from app.services.assessment_memory.embeddings import embed, identity
from app.services.learning_recommendations.profile import LABELS

VERSION = "study-guides-v1"
FOCUS = {
    "address": "перенос известных частей адреса в отдельные поля и проверку ориентиров",
    "caller": "перенос известных сведений о заявителе без выдумывания неизвестных",
    "classification": "выбор типа происшествия, отметок и уточняющих признаков по условию",
    "notification": "проверку списка служб по обстоятельствам и их полномочиям",
    "description": "краткое описание существенных фактов без потери смысла "
    "и добавленных обстоятельств",
    "dds_crews": "назначение нужных бригад своей службы по условиям задания",
    "dds_response": "последовательное отражение подтверждённых состояний бригад",
}
STRATEGIES = {
    "focused": (
        "skill_practice",
        "Начните с короткой тренировки. Отработайте {focus}. После неё попробуйте "
        "полную учебную ситуацию.",
    ),
    "checklist": (
        "review",
        "Повторите {focus}. Перед сдачей сверяйте результат с условием по "
        "короткому списку проверок; затем повторите без списка.",
    ),
    "compare": (
        "review",
        "Сначала сравните разборы двух завершённых работ по навыку "
        "«{label}». Затем повторите {focus} в новом задании.",
    ),
    "less_help": (
        "practice",
        "Попробуйте полную учебную ситуацию с меньшим объёмом подсказок, "
        "обращая внимание на {focus}. Это проверка самостоятельного выполнения, "
        "а не подтверждение освоения заранее.",
    ),
    "independent": (
        "assessment",
        "Следующий шаг — короткое занятие без подсказок на {focus}. Успех с "
        "помощью полезен, но самостоятельность проверяется отдельно.",
    ),
}


def corpus():
    return [
        dict(
            id=f"{VERSION}/{skill}/{strategy}",
            version=VERSION,
            skill=skill,
            strategy=strategy,
            text=text.format(focus=FOCUS[skill], label=LABELS[skill]),
        )
        for skill in LABELS
        for strategy, (_, text) in STRATEGIES.items()
    ]


def permitted(signal):
    return (
        {"less_help", "independent"}
        if signal == "independent"
        else {"focused", "checklist", "compare"}
    )


async def retrieve(session, profile, *, vectors=True):
    for row in corpus():
        await session.execute(
            insert(LearningGuide).values(**row).on_conflict_do_nothing(index_elements=["id"])
        )
    await session.flush()
    result, status = [], "metadata"
    for skill in profile["candidates"]:
        choices = list(
            await session.scalars(
                select(LearningGuide)
                .where(
                    LearningGuide.version == VERSION,
                    LearningGuide.skill == skill,
                    LearningGuide.strategy.in_(permitted(profile["skills"][skill]["signal"])),
                    LearningGuide.active.is_(True),
                )
                .order_by(LearningGuide.id)
            )
        )
        if not choices:
            continue
        # Exact skill/strategy constraints are authoritative; vectors only rank safe alternatives.
        if vectors:
            try:
                model = await asyncio.to_thread(identity)
                missing = [c for c in choices if c.embedding is None or c.embedding_model != model]
                texts = [c.text for c in missing]
                query = (
                    f"Рекомендация дальнейшего обучения: {LABELS[skill]}. "
                    f"{profile['skills'][skill]['signal']}. {FOCUS[skill]}"
                )
                embedded, model = await asyncio.to_thread(embed, texts + [query])
                for row, vector in zip(missing, embedded[:-1], strict=True):
                    row.embedding, row.embedding_model = vector, model
                await session.flush()
                choices = list(
                    await session.scalars(
                        select(LearningGuide)
                        .where(
                            LearningGuide.id.in_([c.id for c in choices]),
                            LearningGuide.embedding_model == model,
                        )
                        .order_by(
                            LearningGuide.embedding.cosine_distance(embedded[-1]), LearningGuide.id
                        )
                    )
                )
                status = "vector"
            except Exception:
                status = "metadata_fallback"
        result.extend(
            {
                "id": c.id,
                "skill": c.skill,
                "strategy": c.strategy,
                "text": c.text,
                "lesson_kind": STRATEGIES[c.strategy][0],
            }
            for c in choices[:3]
        )
    return {"status": status, "version": VERSION, "examples": result}
